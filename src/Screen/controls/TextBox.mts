import type { TextBoxOptions, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** ANSI 256-colour IDs used for border states. */
const BORDER_NORMAL   = 240;
const BORDER_FOCUSED  = 75;
const BORDER_DISABLED = 238;

/** A single-line text-input widget with scrolling, cursor display, and placeholder support.
 *  Wraps content area inside a single-line border (total height 3 by default).
 *  Call handleKey() to feed raw terminal key strings from your input loop. */
export class TextBox extends Window {
	private value: string;
	private cursor: number;
	private scrollOffset: number;
	private placeholder: string;
	private focused: boolean;
	private disabled: boolean;
	private textStyleId: StyleId;
	private placeholderStyleId: StyleId;
	private cursorStyleId: StyleId;
	private disabledStyleId: StyleId;

	/** Creates a TextBox at the given position and size (recommended height: 3 for single border).
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: TextBoxOptions, registry?: StyleRegistry) {
		super(pos, size, {
			background: options?.background ?? 237,
			border: {
				top: true, right: true, bottom: true, left: true,
				style: 'single',
				color: options?.disabled ? BORDER_DISABLED : BORDER_NORMAL,
			},
			active: !(options?.disabled ?? false),
		}, registry);

		this.value       = options?.value       ?? '';
		this.placeholder = options?.placeholder ?? '';
		this.focused     = options?.focused      ?? false;
		this.disabled    = options?.disabled     ?? false;
		this.scrollOffset = 0;
		this.cursor      = options?.cursor !== undefined
			? Math.max(0, Math.min(options.cursor, this.value.length))
			: this.value.length;

		this.textStyleId        = this.registry.register({ foreground: 252 });
		this.placeholderStyleId = this.registry.register({ foreground: 242, italic: true });
		this.cursorStyleId      = this.registry.register({ inverse: true });
		this.disabledStyleId    = this.registry.register({ foreground: 245, dim: true });

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

	/** Sets the focused state; affects border colour and cursor visibility on next render(). */
	public setFocused(focused: boolean): void {
		this.focused = focused;
	}

	/** Returns whether the TextBox currently has focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state; dims the control on next render(). */
	public setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether the TextBox is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
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

	/** Rebuilds the TextBox: updates border colour, renders text or placeholder, draws cursor. */
	public override render(): void {
		this.clear();

		const borderColor = this.disabled ? BORDER_DISABLED
		                  : this.focused  ? BORDER_FOCUSED
		                  : BORDER_NORMAL;
		this.updateBorder({
			top: true, right: true, bottom: true, left: true,
			style: 'single',
			color: borderColor,
		});

		const { width } = this.getInnerSize();
		const isEmpty   = this.value === '';
		const textStyle = this.disabled ? this.disabledStyleId : this.textStyleId;
		const phStyle   = this.disabled ? this.disabledStyleId : this.placeholderStyleId;

		if (isEmpty && !this.focused && this.placeholder !== '') {
			this.writeText(this.placeholder.slice(0, width), { style: phStyle });
		} else if (!isEmpty) {
			const visible = this.value.slice(this.scrollOffset, this.scrollOffset + width);
			this.writeText(visible, { style: textStyle });
		}

		// Draw cursor when focused.
		if (this.focused && !this.disabled) {
			const cursorX = this.cursor - this.scrollOffset;
			if (cursorX >= 0 && cursorX < width) {
				const cursorChar  = this.value[this.cursor] ?? ' ';
				const cursorStyle = this.registry.merge(textStyle, this.cursorStyleId);
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
