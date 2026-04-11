import type { TextAreaOptions, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

const BORDER_NORMAL   = 240;
const BORDER_FOCUSED  = 75;
const BORDER_DISABLED = 238;

/** A multi-line text-input widget with 2-D cursor, scrolling, and placeholder support.
 *  Call handleKey() to feed raw terminal key strings from your input loop. */
export class TextArea extends Window {
	private lines: string[];
	private cursor: { x: number; y: number };
	private scrollX: number;
	private scrollY: number;
	private placeholder: string;
	private focused: boolean;
	private disabled: boolean;
	private textStyleId: StyleId;
	private placeholderStyleId: StyleId;
	private cursorStyleId: StyleId;
	private disabledStyleId: StyleId;

	/** Creates a TextArea at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: TextAreaOptions, registry?: StyleRegistry) {
		super(pos, size, {
			background: options?.background ?? 237,
			border: {
				top: true, right: true, bottom: true, left: true,
				style: 'single',
				color: options?.disabled ? BORDER_DISABLED : BORDER_NORMAL,
			},
			active: !(options?.disabled ?? false),
		}, registry);

		this.lines       = (options?.value ?? '').split('\n');
		this.placeholder = options?.placeholder ?? '';
		this.focused     = options?.focused      ?? false;
		this.disabled    = options?.disabled     ?? false;
		this.scrollX     = 0;
		this.scrollY     = 0;

		const rawCursor = options?.cursor ?? { x: 0, y: 0 };
		this.cursor = {
			y: Math.max(0, Math.min(rawCursor.y, this.lines.length - 1)),
			x: 0,
		};
		this.cursor.x = Math.max(0, Math.min(rawCursor.x, this.lines[this.cursor.y].length));

		this.textStyleId        = this.registry.register({ foreground: 252 });
		this.placeholderStyleId = this.registry.register({ foreground: 242, italic: true });
		this.cursorStyleId      = this.registry.register({ inverse: true });
		this.disabledStyleId    = this.registry.register({ foreground: 245, dim: true });

		this.clampScroll();
	}

	/** Replaces the current value; cursor and scroll are clamped to fit. */
	public setValue(text: string): void {
		this.lines  = text.split('\n');
		this.cursor.y = Math.min(this.cursor.y, this.lines.length - 1);
		this.cursor.x = Math.min(this.cursor.x, this.lines[this.cursor.y].length);
		this.clampScroll();
	}

	/** Returns the current text value (lines joined with '\n'). */
	public getValue(): string {
		return this.lines.join('\n');
	}

	/** Sets the cursor to the given position (clamped to valid range). */
	public setCursor(pos: { x: number; y: number }): void {
		this.cursor.y = Math.max(0, Math.min(pos.y, this.lines.length - 1));
		this.cursor.x = Math.max(0, Math.min(pos.x, this.lines[this.cursor.y].length));
		this.clampScroll();
	}

	/** Returns a copy of the current cursor position. */
	public getCursor(): { x: number; y: number } {
		return { ...this.cursor };
	}

	/** Sets the focused state; affects border colour and cursor visibility on next render(). */
	public setFocused(focused: boolean): void {
		this.focused = focused;
	}

	/** Returns whether the TextArea currently has focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state; dims the control on next render(). */
	public setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether the TextArea is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
	}

	/** Processes a key string from the terminal input loop and updates value/cursor.
	 *  Supported special keys: backspace (\x7f), delete (\x1b[3~), arrow keys (\x1b[A/B/C/D),
	 *  home (\x1b[H), end (\x1b[F), enter (\r or \n).
	 *  Human-readable aliases: 'backspace', 'delete', 'left', 'right', 'up', 'down', 'home', 'end', 'enter'.
	 *  Any single printable character is inserted at the cursor. */
	public handleKey(key: string): void {
		if (this.disabled) return;
		const line = this.lines[this.cursor.y];
		switch (key) {
			case '\x7f': case '\b': case 'backspace':
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
			case '\x1b[3~': case 'delete':
				if (this.cursor.x < line.length) {
					this.lines[this.cursor.y] = line.slice(0, this.cursor.x) + line.slice(this.cursor.x + 1);
				} else if (this.cursor.y < this.lines.length - 1) {
					this.lines[this.cursor.y] = line + this.lines[this.cursor.y + 1];
					this.lines.splice(this.cursor.y + 1, 1);
				}
				break;
			case '\r': case '\n': case 'enter':
				this.lines.splice(this.cursor.y + 1, 0, line.slice(this.cursor.x));
				this.lines[this.cursor.y] = line.slice(0, this.cursor.x);
				this.cursor.y++;
				this.cursor.x = 0;
				break;
			case '\x1b[D': case 'left':
				if (this.cursor.x > 0) {
					this.cursor.x--;
				} else if (this.cursor.y > 0) {
					this.cursor.y--;
					this.cursor.x = this.lines[this.cursor.y].length;
				}
				break;
			case '\x1b[C': case 'right':
				if (this.cursor.x < line.length) {
					this.cursor.x++;
				} else if (this.cursor.y < this.lines.length - 1) {
					this.cursor.y++;
					this.cursor.x = 0;
				}
				break;
			case '\x1b[A': case 'up':
				if (this.cursor.y > 0) {
					this.cursor.y--;
					this.cursor.x = Math.min(this.cursor.x, this.lines[this.cursor.y].length);
				}
				break;
			case '\x1b[B': case 'down':
				if (this.cursor.y < this.lines.length - 1) {
					this.cursor.y++;
					this.cursor.x = Math.min(this.cursor.x, this.lines[this.cursor.y].length);
				}
				break;
			case '\x1b[H': case 'home':
				this.cursor.x = 0;
				break;
			case '\x1b[F': case 'end':
				this.cursor.x = this.lines[this.cursor.y].length;
				break;
			default:
				if (key.length === 1 && key >= ' ') {
					this.lines[this.cursor.y] = line.slice(0, this.cursor.x) + key + line.slice(this.cursor.x);
					this.cursor.x++;
				}
		}
		this.clampScroll();
	}

	/** Rebuilds the TextArea: updates border colour, renders visible lines, draws cursor. */
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

		const { width, height } = this.getInnerSize();
		const isEmpty           = this.lines.length === 1 && this.lines[0] === '';
		const textStyle         = this.disabled ? this.disabledStyleId : this.textStyleId;
		const phStyle           = this.disabled ? this.disabledStyleId : this.placeholderStyleId;

		if (isEmpty && !this.focused && this.placeholder !== '') {
			this.writeText(this.placeholder.slice(0, width), { style: phStyle });
		} else {
			for (let row = 0; row < height; row++) {
				const lineIdx = row + this.scrollY;
				if (lineIdx >= this.lines.length) break;
				const visible = this.lines[lineIdx].slice(this.scrollX, this.scrollX + width);
				this.writeText(visible, { x: 0, y: row, style: textStyle });
			}
		}

		// Draw cursor when focused.
		if (this.focused && !this.disabled) {
			const screenX = this.cursor.x - this.scrollX;
			const screenY = this.cursor.y - this.scrollY;
			if (screenX >= 0 && screenX < width && screenY >= 0 && screenY < height) {
				const cursorChar  = this.lines[this.cursor.y][this.cursor.x] ?? ' ';
				const cursorStyle = this.registry.merge(textStyle, this.cursorStyleId);
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
