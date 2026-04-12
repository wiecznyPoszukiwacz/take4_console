import type { TextBoxProperties, WindowProperties, StyleId } from '../types.mjs';
import { BUILTIN_TEXT_PLACEHOLDER, BUILTIN_CURSOR } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** A single-line text-input widget with scrolling, cursor display, and placeholder support.
 *  Wraps content area inside a single-line border (total height 3 by default).
 *  Call handleKey() to feed raw terminal key strings from your input loop. */
export class TextBox extends Window {
	private value: string;
	private cursor: number;
	private scrollOffset: number;
	private placeholder: string;
	private placeholderStyleId: StyleId;
	private cursorStyleId: StyleId;

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

		const reg = getRegistry();
		this.placeholderStyleId = reg.getNamed(BUILTIN_TEXT_PLACEHOLDER)!;
		this.cursorStyleId      = reg.getNamed(BUILTIN_CURSOR)!;

		this.clampScroll();
	}

	/** Replaces the current value; clamps cursor and scroll to fit. */
	public setValue(value: string): void {
		this.value  = value;
		this.cursor = Math.min(this.cursor, value.length);
		this.clampScroll();
	}

	/** Returns the current text value. */
	public getValue(): string {
		return this.value;
	}

	/** Sets the cursor to the given character index (clamped to valid range). */
	public setCursor(pos: number): void {
		this.cursor = Math.max(0, Math.min(pos, this.value.length));
		this.clampScroll();
	}

	/** Returns the current cursor character index. */
	public getCursor(): number {
		return this.cursor;
	}

	/** Processes a key string from the terminal input loop and updates value/cursor.
	 *  Supported special keys: backspace (\x7f), delete (\x1b[3~), left (\x1b[D),
	 *  right (\x1b[C), home (\x1b[H), end (\x1b[F).
	 *  Human-readable aliases: 'backspace', 'delete', 'left', 'right', 'home', 'end'.
	 *  Any single printable character is inserted at the cursor position. */
	public handleKey(key: string): void {
		if (this.disabled) return;
		switch (key) {
			case '\x7f': case '\b': case 'backspace':
				if (this.cursor > 0) {
					this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
					this.cursor--;
				}
				break;
			case '\x1b[3~': case 'delete':
				if (this.cursor < this.value.length) {
					this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
				}
				break;
			case '\x1b[D': case 'left':
				if (this.cursor > 0) this.cursor--;
				break;
			case '\x1b[C': case 'right':
				if (this.cursor < this.value.length) this.cursor++;
				break;
			case '\x1b[H': case 'home':
				this.cursor = 0;
				break;
			case '\x1b[F': case 'end':
				this.cursor = this.value.length;
				break;
			default:
				if (key.length === 1 && key >= ' ') {
					this.value = this.value.slice(0, this.cursor) + key + this.value.slice(this.cursor);
					this.cursor++;
				}
		}
		this.clampScroll();
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

		// Draw cursor when focused.
		if (this.focused && !this.disabled) {
			const cursorX = this.cursor - this.scrollOffset;
			if (cursorX >= 0 && cursorX < width) {
				const cursorChar  = this.value[this.cursor] ?? ' ';
				const cursorStyle = this.registry.merge(this.normalStyleId, this.cursorStyleId);
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
