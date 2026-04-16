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

		this.onChange  = cp?.onChange;
		this.onSubmit  = cp?.onSubmit;
		this.onKeyDown = cp?.onKeyDown;

		const reg = getRegistry();
		this.placeholderStyleId = reg.getNamed(BUILTIN_TEXT_PLACEHOLDER)!;
		this.cursorStyleId      = reg.getNamed(BUILTIN_CURSOR)!;

		this.clampScroll();
	}

	/** Replaces the current value; clamps cursor and scroll to fit. Does NOT fire onChange. */
	public setValue(value: string): void {
		this.value  = value;
		this.cursor = Math.min(this.cursor, value.length);
		this.clampScroll();
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

		// Give the caller a chance to intercept before built-in logic runs.
		if (this.onKeyDown?.(key) === true) {
			this.clampScroll();
			return;
		}

		const before = this.value;
		switch (key) {
			case '\r': case '\n': case 'enter':
				this.onSubmit?.(this.value);
				this.clampScroll();
				return; // Enter never mutates value by itself in TextBox.
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
		if (this.value !== before) this.onChange?.(this.value);
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
