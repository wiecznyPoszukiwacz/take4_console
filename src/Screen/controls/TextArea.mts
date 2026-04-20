import type { TextAreaProperties, WindowProperties, StyleId } from '../types.mjs';
import { BUILTIN_TEXT_PLACEHOLDER, BUILTIN_CURSOR, BUILTIN_TEXT_SELECTION } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';
import { VirtualCursor } from '../VirtualCursor.mjs';

/** A multi-line text-input widget with 2-D cursor, scrolling, and placeholder support.
 *  Call handleKey() to feed raw terminal key strings from your input loop. */
export class TextArea extends Window {
	private lines: string[];
	private cursor: { x: number; y: number };
	/** Anchor of the active selection in 2-D coordinates, or null when no
	 *  selection is active. The selection spans from `selectionAnchor` to
	 *  `cursor` regardless of ordering. */
	private selectionAnchor: { x: number; y: number } | null;
	private scrollX: number;
	private scrollY: number;
	private placeholder: string;
	private placeholderStyleId: StyleId;
	private cursorStyleId: StyleId;
	private selectionStyleId: StyleId;
	/** Software-cursor model: blink state + glyph. */
	private virtualCursor: VirtualCursor;

	private onChange?: (value: string) => void;
	private onSubmit?: (value: string) => void;
	private onKeyDown?: (key: string) => boolean | void;
	private insertTabAsSpaces: number;
	private ctrlDDeletesForward: boolean;

	/** Creates a TextArea from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: TextAreaProperties) {
		super({
			...wp,
			defaultBorder: { top: true, right: true, bottom: true, left: true, style: 'single' },
		});

		this.lines       = (cp?.value ?? '').split('\n');
		this.placeholder = cp?.placeholder ?? '';
		this.scrollX     = 0;
		this.scrollY     = 0;

		const rawCursor = cp?.cursor ?? { x: 0, y: 0 };
		this.cursor = {
			y: Math.max(0, Math.min(rawCursor.y, this.lines.length - 1)),
			x: 0,
		};
		this.cursor.x = Math.max(0, Math.min(rawCursor.x, this.lines[this.cursor.y].length));
		this.selectionAnchor = null;

		this.onChange            = cp?.onChange;
		this.onSubmit            = cp?.onSubmit;
		this.onKeyDown           = cp?.onKeyDown;
		this.insertTabAsSpaces   = Math.max(0, cp?.insertTabAsSpaces ?? 0);
		this.ctrlDDeletesForward = cp?.ctrlDDeletesForward ?? false;

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

	/** Replaces the current value; cursor and scroll are clamped to fit. Does NOT fire onChange.
	 *  Any active selection is cleared because the old anchor no longer maps
	 *  onto the new buffer. */
	public setValue(text: string): void {
		this.lines  = text.split('\n');
		this.cursor.y = Math.min(this.cursor.y, this.lines.length - 1);
		this.cursor.x = Math.min(this.cursor.x, this.lines[this.cursor.y].length);
		this.selectionAnchor = null;
		this.clampScroll();
		this.markDirty();
	}

	/** Returns the normalized selection range `{ start, end }` in 2-D
	 *  coordinates (start always ≤ end in document order) or `null` when no
	 *  selection is active. */
	public getSelection(): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
		if (this.selectionAnchor === null) return null;
		const a = this.selectionAnchor;
		const b = this.cursor;
		if (a.x === b.x && a.y === b.y) return null;
		const aBeforeB = a.y < b.y || (a.y === b.y && a.x < b.x);
		return aBeforeB
			? { start: { ...a }, end: { ...b } }
			: { start: { ...b }, end: { ...a } };
	}

	/** Returns the currently selected substring (with embedded newlines), or
	 *  `''` when no selection is active. */
	public getSelectedText(): string {
		const sel = this.getSelection();
		if (sel === null) return '';
		const { start, end } = sel;
		if (start.y === end.y) return this.lines[start.y].slice(start.x, end.x);
		const parts: string[] = [this.lines[start.y].slice(start.x)];
		for (let y = start.y + 1; y < end.y; y++) parts.push(this.lines[y]);
		parts.push(this.lines[end.y].slice(0, end.x));
		return parts.join('\n');
	}

	/** Replaces the current selection: sets anchor and cursor, clamping both
	 *  positions into valid lines/columns. Identical positions clear the
	 *  selection. */
	public setSelection(anchor: { x: number; y: number }, cursor: { x: number; y: number }): void {
		const a = this.clampPosition(anchor);
		const c = this.clampPosition(cursor);
		this.selectionAnchor = (a.x === c.x && a.y === c.y) ? null : a;
		this.cursor = c;
		this.clampScroll();
		this.markDirty();
	}

	/** Selects every character in the buffer. No-op when the buffer holds a
	 *  single empty line. */
	public selectAll(): void {
		const lastY = this.lines.length - 1;
		const lastX = this.lines[lastY].length;
		if (lastY === 0 && lastX === 0) {
			this.selectionAnchor = null;
			return;
		}
		this.selectionAnchor = { x: 0, y: 0 };
		this.cursor = { x: lastX, y: lastY };
		this.clampScroll();
		this.markDirty();
	}

	/** Drops any active selection without moving the cursor. */
	public clearSelection(): void {
		if (this.selectionAnchor === null) return;
		this.selectionAnchor = null;
		this.markDirty();
	}

	/** Clamps a 2-D position so both components land inside the buffer. */
	private clampPosition(p: { x: number; y: number }): { x: number; y: number } {
		const y = Math.max(0, Math.min(p.y, this.lines.length - 1));
		const x = Math.max(0, Math.min(p.x, this.lines[y].length));
		return { x, y };
	}

	/** Replaces the onChange callback. */
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

	/** Opt-in to Tab interception: when `insertTabAsSpaces > 0`, the
	 *  WindowManager forwards Tab to handleKey() instead of cycling focus. */
	public capturesTab(): boolean {
		return this.insertTabAsSpaces > 0;
	}

	/** Returns the current text value (lines joined with '\n'). */
	public getValue(): string {
		return this.lines.join('\n');
	}

	/** Sets the cursor to the given position (clamped to valid range).
	 *  Any active selection is dropped — use `setSelection()` to move the
	 *  cursor while keeping an anchor. */
	public setCursor(pos: { x: number; y: number }): void {
		this.cursor.y = Math.max(0, Math.min(pos.y, this.lines.length - 1));
		this.cursor.x = Math.max(0, Math.min(pos.x, this.lines[this.cursor.y].length));
		this.selectionAnchor = null;
		this.clampScroll();
		this.markDirty();
	}

	/** Returns a copy of the current cursor position. */
	public getCursor(): { x: number; y: number } {
		return { ...this.cursor };
	}

	/** Processes a key string from the terminal input loop and updates value/cursor.
	 *  Supported special keys: backspace (\x7f), delete (\x1b[3~), arrow keys (\x1b[A/B/C/D),
	 *  home (\x1b[H), end (\x1b[F), enter (\r or \n).
	 *  Human-readable aliases: 'backspace', 'delete', 'left', 'right', 'up', 'down', 'home', 'end', 'enter'.
	 *  Any single printable character is inserted at the cursor. */
	public handleKey(key: string): void {
		if (this.disabled) return;

		// Give the caller a chance to intercept before built-in logic runs.
		if (this.onKeyDown?.(key) === true) {
			this.clampScroll();
			return;
		}

		const before = this.getValue();

		// ── Selection-extending motion (shift + arrow / home / end) ─────────
		if (key === '\x1b[1;2D' || key === 'shift+left') {
			this.ensureAnchor();
			this.moveCursorLeft();
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2C' || key === 'shift+right') {
			this.ensureAnchor();
			this.moveCursorRight();
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2A' || key === 'shift+up') {
			this.ensureAnchor();
			this.moveCursorUp();
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2B' || key === 'shift+down') {
			this.ensureAnchor();
			this.moveCursorDown();
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2H' || key === 'shift+home') {
			this.ensureAnchor();
			this.cursor.x = 0;
			this.finishKey(before);
			return;
		}
		if (key === '\x1b[1;2F' || key === 'shift+end') {
			this.ensureAnchor();
			this.cursor.x = this.lines[this.cursor.y].length;
			this.finishKey(before);
			return;
		}
		if (key === '\x01' || key === 'ctrl+a') {
			this.selectAll();
			this.finishKey(before);
			return;
		}

		// Tab → soft-tab insert when configured, otherwise pass-through.
		if ((key === '\t' || key === 'tab') && this.insertTabAsSpaces > 0) {
			this.deleteSelection();
			const spaces  = ' '.repeat(this.insertTabAsSpaces);
			const lineTab = this.lines[this.cursor.y];
			this.lines[this.cursor.y] = lineTab.slice(0, this.cursor.x) + spaces + lineTab.slice(this.cursor.x);
			this.cursor.x += spaces.length;
			this.finishKey(before);
			return;
		}
		if (key === '\t' || key === 'tab') {
			// insertTabAsSpaces === 0 → leave Tab for WindowManager focus cycling.
			return;
		}

		// Ctrl+D forward-delete when enabled — same behaviour as \x1b[3~.
		if (key === '\x04' && this.ctrlDDeletesForward) {
			if (!this.deleteSelection()) {
				const lineD = this.lines[this.cursor.y];
				if (this.cursor.x < lineD.length) {
					this.lines[this.cursor.y] = lineD.slice(0, this.cursor.x) + lineD.slice(this.cursor.x + 1);
				} else if (this.cursor.y < this.lines.length - 1) {
					this.lines[this.cursor.y] = lineD + this.lines[this.cursor.y + 1];
					this.lines.splice(this.cursor.y + 1, 1);
				}
			}
			this.finishKey(before);
			return;
		}

		// Ctrl+Enter submits without inserting a newline. In xterm this arrives
		// as '\x1b\r' (ESC + CR) or '\n' depending on terminal; we treat the
		// explicit alias 'ctrl+enter' plus '\n' (LF on its own) as the submit
		// key, keeping plain '\r' for newline insertion.
		if (key === 'ctrl+enter') {
			this.onSubmit?.(this.getValue());
			return;
		}

		switch (key) {
			case '\x7f': case '\b': case 'backspace': {
				if (this.deleteSelection()) break;
				const line = this.lines[this.cursor.y];
				if (this.cursor.x > 0) {
					this.lines[this.cursor.y] = line.slice(0, this.cursor.x - 1) + line.slice(this.cursor.x);
					this.cursor.x--;
				} else if (this.cursor.y > 0) {
					const prev = this.lines[this.cursor.y - 1];
					this.cursor.x = prev.length;
					this.lines[this.cursor.y - 1] = prev + line;
					this.lines.splice(this.cursor.y, 1);
					this.cursor.y--;
				}
				break;
			}
			case '\x1b[3~': case 'delete': {
				if (this.deleteSelection()) break;
				const line = this.lines[this.cursor.y];
				if (this.cursor.x < line.length) {
					this.lines[this.cursor.y] = line.slice(0, this.cursor.x) + line.slice(this.cursor.x + 1);
				} else if (this.cursor.y < this.lines.length - 1) {
					this.lines[this.cursor.y] = line + this.lines[this.cursor.y + 1];
					this.lines.splice(this.cursor.y + 1, 1);
				}
				break;
			}
			case '\r': case '\n': case 'enter': {
				this.deleteSelection();
				const line = this.lines[this.cursor.y];
				this.lines.splice(this.cursor.y + 1, 0, line.slice(this.cursor.x));
				this.lines[this.cursor.y] = line.slice(0, this.cursor.x);
				this.cursor.y++;
				this.cursor.x = 0;
				break;
			}
			case '\x1b[D': case 'left':
				if (this.collapseSelection('start')) break;
				this.moveCursorLeft();
				break;
			case '\x1b[C': case 'right':
				if (this.collapseSelection('end')) break;
				this.moveCursorRight();
				break;
			case '\x1b[A': case 'up':
				this.selectionAnchor = null;
				this.moveCursorUp();
				break;
			case '\x1b[B': case 'down':
				this.selectionAnchor = null;
				this.moveCursorDown();
				break;
			case '\x1b[H': case 'home':
				this.selectionAnchor = null;
				this.cursor.x = 0;
				break;
			case '\x1b[F': case 'end':
				this.selectionAnchor = null;
				this.cursor.x = this.lines[this.cursor.y].length;
				break;
			default:
				if (key.length === 1 && key >= ' ') {
					this.deleteSelection();
					const line = this.lines[this.cursor.y];
					this.lines[this.cursor.y] = line.slice(0, this.cursor.x) + key + line.slice(this.cursor.x);
					this.cursor.x++;
				}
		}
		this.finishKey(before);
	}

	/** Shared post-key housekeeping: clamp scroll, reset blink phase, fire
	 *  onChange when the value actually changed. */
	private finishKey(before: string): void {
		this.clampScroll();
		this.virtualCursor.resetPhase();
		// Every key dispatch may have moved the cursor, changed the
		// selection, or edited the buffer — flag the window dirty so the
		// next Screen.render() re-emits the composed state.
		this.markDirty();
		if (this.getValue() !== before) this.onChange?.(this.getValue());
	}

	/** Starts a selection at the current cursor if none is active. */
	private ensureAnchor(): void {
		if (this.selectionAnchor === null) this.selectionAnchor = { ...this.cursor };
	}

	/** Removes the selected text and places the cursor at the start of the
	 *  deleted range. Returns true when a deletion happened. */
	private deleteSelection(): boolean {
		const sel = this.getSelection();
		if (sel === null) return false;
		const { start, end } = sel;
		if (start.y === end.y) {
			const line = this.lines[start.y];
			this.lines[start.y] = line.slice(0, start.x) + line.slice(end.x);
		} else {
			const head = this.lines[start.y].slice(0, start.x);
			const tail = this.lines[end.y].slice(end.x);
			this.lines.splice(start.y, end.y - start.y + 1, head + tail);
		}
		this.cursor = { ...start };
		this.selectionAnchor = null;
		return true;
	}

	/** Drops an active selection, moving the cursor to the selection's
	 *  `start` or `end` edge. Returns true when it did so. */
	private collapseSelection(edge: 'start' | 'end'): boolean {
		const sel = this.getSelection();
		if (sel === null) return false;
		this.cursor = { ...(edge === 'start' ? sel.start : sel.end) };
		this.selectionAnchor = null;
		return true;
	}

	/** Moves the cursor one cell left, wrapping to the previous line end. */
	private moveCursorLeft(): void {
		if (this.cursor.x > 0) {
			this.cursor.x--;
		} else if (this.cursor.y > 0) {
			this.cursor.y--;
			this.cursor.x = this.lines[this.cursor.y].length;
		}
	}

	/** Moves the cursor one cell right, wrapping to the next line start. */
	private moveCursorRight(): void {
		const line = this.lines[this.cursor.y];
		if (this.cursor.x < line.length) {
			this.cursor.x++;
		} else if (this.cursor.y < this.lines.length - 1) {
			this.cursor.y++;
			this.cursor.x = 0;
		}
	}

	/** Moves the cursor up one line, clamping column to the new line length. */
	private moveCursorUp(): void {
		if (this.cursor.y > 0) {
			this.cursor.y--;
			this.cursor.x = Math.min(this.cursor.x, this.lines[this.cursor.y].length);
		}
	}

	/** Moves the cursor down one line, clamping column to the new line length. */
	private moveCursorDown(): void {
		if (this.cursor.y < this.lines.length - 1) {
			this.cursor.y++;
			this.cursor.x = Math.min(this.cursor.x, this.lines[this.cursor.y].length);
		}
	}

	/** Rebuilds the TextArea: renders visible lines, draws cursor. */
	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const isEmpty           = this.lines.length === 1 && this.lines[0] === '';
		const phStyle           = this.disabled ? undefined : this.placeholderStyleId;

		if (isEmpty && !this.focused && this.placeholder !== '') {
			this.writeText(this.placeholder.slice(0, width), { style: phStyle });
		} else {
			for (let row = 0; row < height; row++) {
				const lineIdx = row + this.scrollY;
				if (lineIdx >= this.lines.length) break;
				const visible = this.lines[lineIdx].slice(this.scrollX, this.scrollX + width);
				this.writeText(visible, { x: 0, y: row, style: this.disabled ? undefined : this.normalStyleId });
			}
		}

		// Paint the selection highlight over any cells that fall inside the
		// active selection range. Runs before the cursor so the caret still
		// shows on top.
		const sel = this.focused && !this.disabled ? this.getSelection() : null;
		if (sel !== null) {
			const base = this.normalStyleId;
			const merged = this.registry.merge(base, this.selectionStyleId);
			for (let y = sel.start.y; y <= sel.end.y; y++) {
				const row = y - this.scrollY;
				if (row < 0 || row >= height) continue;
				const lineText = this.lines[y];
				const fromX = y === sel.start.y ? sel.start.x : 0;
				const toX   = y === sel.end.y   ? sel.end.x   : lineText.length + 1; // +1 to paint a trailing newline cell
				for (let x = fromX; x < toX; x++) {
					const col = x - this.scrollX;
					if (col < 0 || col >= width) continue;
					const ch = lineText[x] ?? ' ';
					this.writeText(ch, { x: col, y: row, style: merged });
				}
			}
		}

		// Draw cursor when focused and the virtual-cursor blink says "on".
		if (this.focused && !this.disabled && this.virtualCursor.isVisible()) {
			const screenX = this.cursor.x - this.scrollX;
			const screenY = this.cursor.y - this.scrollY;
			if (screenX >= 0 && screenX < width && screenY >= 0 && screenY < height) {
				const useSymbol   = this.virtualCursor.hasCustomSymbol();
				const cursorChar  = useSymbol
					? this.virtualCursor.getSymbol()
					: (this.lines[this.cursor.y][this.cursor.x] ?? ' ');
				const cursorStyle = useSymbol
					? this.normalStyleId
					: this.registry.merge(this.normalStyleId, this.cursorStyleId);
				this.writeText(cursorChar, { x: screenX, y: screenY, style: cursorStyle });
			}
		}

		super.render();
	}

	/** Adjusts scrollX/scrollY so the cursor remains within the visible area. */
	private clampScroll(): void {
		const { width, height } = this.getInnerSize();
		if (this.cursor.y < this.scrollY) {
			this.scrollY = this.cursor.y;
		} else if (this.cursor.y >= this.scrollY + height) {
			this.scrollY = this.cursor.y - height + 1;
		}
		if (this.cursor.x < this.scrollX) {
			this.scrollX = this.cursor.x;
		} else if (this.cursor.x >= this.scrollX + width) {
			this.scrollX = this.cursor.x - width + 1;
		}
	}
}
