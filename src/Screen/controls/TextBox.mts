import type { TextBoxProperties, WindowProperties, StyleId } from '../types.mjs';
import { BUILTIN_TEXT_PLACEHOLDER, BUILTIN_CURSOR, BUILTIN_TEXT_SELECTION } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';
import { VirtualCursor } from '../VirtualCursor.mjs';

/** A single-line text-input widget with scrolling, cursor display, and placeholder support.
 *  Wraps content area inside a single-line border (total height 3 by default).
 *  Call handleKey() to feed raw terminal key strings from your input loop. */
export class TextBox extends Window {
	private value: string;
	private cursor: number;
	/** Anchor of the active selection, or null when no selection is active.
	 *  Selection spans the half-open range [min(anchor, cursor), max(anchor, cursor)). */
	private selectionAnchor: number | null;
	private scrollOffset: number;
	private placeholder: string;
	private placeholderStyleId: StyleId;
	private cursorStyleId: StyleId;
	private selectionStyleId: StyleId;
	/** Software-cursor model: blink state + glyph. Always present so the
	 *  caller can reconfigure at runtime via `getVirtualCursor()`. */
	private virtualCursor: VirtualCursor;

	/** Invoked after every value change driven by handleKey. Not called by setValue. */
	private onChange?: (value: string) => void;
	/** Invoked when Enter is pressed while focused. */
	private onSubmit?: (value: string) => void;
	/** Pre-dispatch hook — return true to short-circuit built-in handling. */
	private onKeyDown?: (key: string) => boolean | void;

	/** Creates a TextBox from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: TextBoxProperties) {
		super({
			...wp,
			defaultBorder: { top: true, right: true, bottom: true, left: true, style: 'single' },
		});

		this.value       = cp?.value       ?? '';
		this.placeholder = cp?.placeholder ?? '';
		this.scrollOffset = 0;
		this.cursor      = cp?.cursor !== undefined
			? Math.max(0, Math.min(cp.cursor, this.value.length))
			: this.value.length;
		this.selectionAnchor = null;

		this.onChange  = cp?.onChange;
		this.onSubmit  = cp?.onSubmit;
		this.onKeyDown = cp?.onKeyDown;

		const reg = getRegistry();
		this.placeholderStyleId = reg.getNamed(BUILTIN_TEXT_PLACEHOLDER)!;
		this.cursorStyleId      = reg.getNamed(BUILTIN_CURSOR)!;
		this.selectionStyleId   = reg.getNamed(BUILTIN_TEXT_SELECTION)!;

		this.virtualCursor = new VirtualCursor({
			symbol: cp?.cursorSymbol,
			blink:  cp?.cursorBlink,
		});

		this.clampScroll();
	}

	/** Returns the VirtualCursor model so callers can tweak symbol/blink at runtime. */
	public getVirtualCursor(): VirtualCursor {
		return this.virtualCursor;
	}

	/** Replaces the current value; clamps cursor and scroll to fit. Does NOT fire onChange.
	 *  Any active selection is cleared because the old anchor no longer maps
	 *  onto the new string. */
	public setValue(value: string): void {
		this.value  = value;
		this.cursor = Math.min(this.cursor, value.length);
		this.selectionAnchor = null;
		this.clampScroll();
	}

	/** Returns the normalized selection range `{ start, end }` (half-open)
	 *  when a selection is active and non-empty, otherwise `null`. */
	public getSelection(): { start: number; end: number } | null {
		if (this.selectionAnchor === null) return null;
		const a = this.selectionAnchor;
		const b = this.cursor;
		if (a === b) return null;
		return a < b ? { start: a, end: b } : { start: b, end: a };
	}

	/** Returns the currently selected substring, or '' when no selection. */
	public getSelectedText(): string {
		const sel = this.getSelection();
		return sel === null ? '' : this.value.slice(sel.start, sel.end);
	}

	/** Replaces the current selection: sets anchor and cursor, clamping both
	 *  to the current value length. Passing identical indices clears the
	 *  selection; callers that want an empty anchor should use `clearSelection()`. */
	public setSelection(anchor: number, cursor: number): void {
		const len = this.value.length;
		const a = Math.max(0, Math.min(anchor, len));
		const c = Math.max(0, Math.min(cursor, len));
		this.selectionAnchor = a === c ? null : a;
		this.cursor = c;
		this.clampScroll();
	}

	/** Selects every character in the current value. No-op when the value is empty. */
	public selectAll(): void {
		if (this.value.length === 0) {
			this.selectionAnchor = null;
			return;
		}
		this.selectionAnchor = 0;
		this.cursor = this.value.length;
		this.clampScroll();
	}

	/** Drops any active selection without moving the cursor. */
	public clearSelection(): void {
		this.selectionAnchor = null;
	}

	/** Replaces the onChange callback (passing undefined clears it). */
	public setOnChange(fn?: (value: string) => void): void {
		this.onChange = fn;
	}

	/** Replaces the onSubmit callback. */
	public setOnSubmit(fn?: (value: string) => void): void {
		this.onSubmit = fn;
	}

	/** Replaces the onKeyDown pre-dispatch hook. */
	public setOnKeyDown(fn?: (key: string) => boolean | void): void {
		this.onKeyDown = fn;
	}

	/** Returns the current text value. */
	public getValue(): string {
		return this.value;
	}

	/** Sets the cursor to the given character index (clamped to valid range).
	 *  Any active selection is dropped — callers that want to adjust the
	 *  cursor while keeping the selection must use `setSelection()`. */
	public setCursor(pos: number): void {
		this.cursor = Math.max(0, Math.min(pos, this.value.length));
		this.selectionAnchor = null;
		this.clampScroll();
	}

	/** Returns the current cursor character index. */
	public getCursor(): number {
		return this.cursor;
	}

	/** Processes a key string from the terminal input loop and updates value/cursor.
	 *  Supported special keys: backspace (\x7f), delete (\x1b[3~), left (\x1b[D),
	 *  right (\x1b[C), home (\x1b[H), end (\x1b[F), plus their shift-modified
	 *  CSI variants (`\x1b[1;2D` etc.) which extend the selection, and
	 *  Ctrl+A (`\x01`) which selects the entire value.
	 *  Human-readable aliases: 'backspace', 'delete', 'left', 'right', 'home',
	 *  'end', 'shift+left', 'shift+right', 'shift+home', 'shift+end', 'ctrl+a'.
	 *  Any single printable character is inserted at the cursor position and
	 *  replaces the active selection (if any). */
	public handleKey(key: string): void {
		if (this.disabled) return;

		// Give the caller a chance to intercept before built-in logic runs.
		if (this.onKeyDown?.(key) === true) {
			this.clampScroll();
			return;
		}

		const before = this.value;

		// ── Selection-extending motion (shift + arrow / home / end) ─────────
		if (key === '\x1b[1;2D' || key === 'shift+left') {
			this.ensureAnchor();
			if (this.cursor > 0) this.cursor--;
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2C' || key === 'shift+right') {
			this.ensureAnchor();
			if (this.cursor < this.value.length) this.cursor++;
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2H' || key === 'shift+home') {
			this.ensureAnchor();
			this.cursor = 0;
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2F' || key === 'shift+end') {
			this.ensureAnchor();
			this.cursor = this.value.length;
			this.finishKey(before);
			return;
		}
		if (key === '\x01' || key === 'ctrl+a') {
			this.selectAll();
			this.finishKey(before);
			return;
		}

		switch (key) {
			case '\r': case '\n': case 'enter':
				this.onSubmit?.(this.value);
				this.clampScroll();
				return; // Enter never mutates value by itself in TextBox.
			case '\x7f': case '\b': case 'backspace':
				if (this.deleteSelection()) break;
				if (this.cursor > 0) {
					this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
					this.cursor--;
				}
				break;
			case '\x1b[3~': case 'delete':
				if (this.deleteSelection()) break;
				if (this.cursor < this.value.length) {
					this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
				}
				break;
			case '\x1b[D': case 'left':
				// Non-shift left collapses an active selection to its start.
				if (this.collapseSelection('start')) break;
				if (this.cursor > 0) this.cursor--;
				break;
			case '\x1b[C': case 'right':
				if (this.collapseSelection('end')) break;
				if (this.cursor < this.value.length) this.cursor++;
				break;
			case '\x1b[H': case 'home':
				this.selectionAnchor = null;
				this.cursor = 0;
				break;
			case '\x1b[F': case 'end':
				this.selectionAnchor = null;
				this.cursor = this.value.length;
				break;
			default:
				if (key.length === 1 && key >= ' ') {
					this.deleteSelection();
					this.value = this.value.slice(0, this.cursor) + key + this.value.slice(this.cursor);
					this.cursor++;
				}
		}
		this.finishKey(before);
	}

	/** Shared post-key housekeeping: clamp scroll, reset blink phase, fire
	 *  onChange when the value actually changed. */
	private finishKey(before: string): void {
		this.clampScroll();
		this.virtualCursor.resetPhase();
		if (this.value !== before) this.onChange?.(this.value);
	}

	/** Starts a selection at the current cursor if none is active, so that a
	 *  subsequent cursor move extends the selection. */
	private ensureAnchor(): void {
		if (this.selectionAnchor === null) this.selectionAnchor = this.cursor;
	}

	/** Removes the selected text when a selection is active; cursor is placed
	 *  at the start of the deleted range. Returns true when a deletion
	 *  happened, false otherwise. */
	private deleteSelection(): boolean {
		const sel = this.getSelection();
		if (sel === null) return false;
		this.value = this.value.slice(0, sel.start) + this.value.slice(sel.end);
		this.cursor = sel.start;
		this.selectionAnchor = null;
		return true;
	}

	/** Drops an active selection, moving the cursor to the selection's
	 *  `start` or `end` edge. Returns true when it did so. */
	private collapseSelection(edge: 'start' | 'end'): boolean {
		const sel = this.getSelection();
		if (sel === null) return false;
		this.cursor = edge === 'start' ? sel.start : sel.end;
		this.selectionAnchor = null;
		return true;
	}

	/** Rebuilds the TextBox: renders text or placeholder, draws cursor. */
	public override render(): void {
		this.clear();

		const { width } = this.getInnerSize();
		const isEmpty   = this.value === '';
		const phStyle   = this.disabled ? undefined : this.placeholderStyleId;

		if (isEmpty && !this.focused && this.placeholder !== '') {
			this.writeText(this.placeholder.slice(0, width), { style: phStyle });
		} else if (!isEmpty) {
			const visible = this.value.slice(this.scrollOffset, this.scrollOffset + width);
			this.writeText(visible, { style: this.disabled ? undefined : this.normalStyleId });
		}

		// Paint the selection highlight over any cells that fall inside the
		// active selection range — run before the cursor so the caret still
		// shows on top of the highlight.
		const sel = this.focused && !this.disabled ? this.getSelection() : null;
		if (sel !== null) {
			const base = this.normalStyleId;
			for (let i = sel.start; i < sel.end; i++) {
				const col = i - this.scrollOffset;
				if (col < 0 || col >= width) continue;
				const merged = this.registry.merge(base, this.selectionStyleId);
				const ch = this.value[i] ?? ' ';
				this.writeText(ch, { x: col, y: 0, style: merged });
			}
		}

		// Draw cursor when focused and the virtual-cursor blink says "on".
		if (this.focused && !this.disabled && this.virtualCursor.isVisible()) {
			const cursorX = this.cursor - this.scrollOffset;
			if (cursorX >= 0 && cursorX < width) {
				const useSymbol   = this.virtualCursor.hasCustomSymbol();
				// With a custom glyph we draw the glyph itself (styled with the
				// normal text style so the symbol's colours stay predictable);
				// without one we fall back to the legacy inverse-block highlight
				// painted over the character under the caret.
				const cursorChar  = useSymbol ? this.virtualCursor.getSymbol() : (this.value[this.cursor] ?? ' ');
				const cursorStyle = useSymbol
					? this.normalStyleId
					: this.registry.merge(this.normalStyleId, this.cursorStyleId);
				this.writeText(cursorChar, { x: cursorX, y: 0, style: cursorStyle });
			}
		}

		super.render();
	}

	/** Adjusts scrollOffset so the cursor stays within the visible window. */
	private clampScroll(): void {
		const { width } = this.getInnerSize();
		if (this.cursor < this.scrollOffset) {
			this.scrollOffset = this.cursor;
		} else if (this.cursor >= this.scrollOffset + width) {
			this.scrollOffset = this.cursor - width + 1;
		}
	}
}
