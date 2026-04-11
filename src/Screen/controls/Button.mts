import type { ButtonOptions, StyleId } from '../types.mjs';
import {
	BUILTIN_WINDOW_BG,
	BUILTIN_BORDER,
	BUILTIN_BORDER_FOCUSED,
	BUILTIN_BORDER_DISABLED,
	BUILTIN_TEXT,
	BUILTIN_TEXT_FOCUSED,
	BUILTIN_TEXT_DISABLED,
} from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** A clickable button that renders a centred label inside a rounded border.
 *  Visual state (normal / focused / disabled) is controlled via setters.
 *  Appearance can be customised by overriding the built-in named styles via Screen.setBuiltinStyle(). */
export class Button extends Window {
	private label: string;
	private focused: boolean;
	private disabled: boolean;
	private onPress?: () => void;
	private normalStyleId: StyleId;
	private focusedStyleId: StyleId;
	private disabledStyleId: StyleId;

	/** Creates a Button at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: ButtonOptions, registry?: StyleRegistry) {
		const reg   = registry ?? new StyleRegistry();
		const bgId  = options?.background
			?? reg.getNamed(BUILTIN_WINDOW_BG)
			?? reg.register({ background: 237 });
		const borderColor = options?.disabled
			? reg.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
			: reg.getNamedForeground(BUILTIN_BORDER, 240);
		super(pos, size, {
			background: bgId,
			border: {
				top: true, right: true, bottom: true, left: true,
				style: 'rounded',
				color: borderColor,
			},
			active: !(options?.disabled ?? false),
		}, reg);

		this.label    = options?.label    ?? '';
		this.focused  = options?.focused  ?? false;
		this.disabled = options?.disabled ?? false;
		this.onPress  = options?.onPress;

		this.normalStyleId   = reg.getNamed(BUILTIN_TEXT)          ?? reg.register({ foreground: 252 });
		this.focusedStyleId  = reg.getNamed(BUILTIN_TEXT_FOCUSED)  ?? reg.register({ foreground: 255, bold: true });
		this.disabledStyleId = reg.getNamed(BUILTIN_TEXT_DISABLED) ?? reg.register({ foreground: 245, dim: true });
	}

	/** Sets the label text displayed on the button. */
	public setLabel(label: string): void {
		this.label = label;
	}

	/** Returns the current label text. */
	public getLabel(): string {
		return this.label;
	}

	/** Sets the focused state; affects border colour and label style on next render(). */
	public setFocused(focused: boolean): void {
		this.focused = focused;
	}

	/** Returns whether the button currently has focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state; affects border colour and dims the label on next render(). */
	public setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether the button is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
	}

	/** Processes a key press; Enter or Space triggers the onPress callback. */
	public handleKey(key: string): void {
		if (this.disabled) return;
		if (key === '\r' || key === '\n' || key === ' ' || key === 'enter' || key === 'space') {
			this.onPress?.();
		}
	}

	/** Rebuilds the button: updates border colour, writes centred label, then composites. */
	public override render(): void {
		this.clear();

		const borderColor = this.disabled
			? this.registry.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
			: this.focused
				? this.registry.getNamedForeground(BUILTIN_BORDER_FOCUSED, 75)
				: this.registry.getNamedForeground(BUILTIN_BORDER, 240);
		this.updateBorder({
			top: true, right: true, bottom: true, left: true,
			style: 'rounded',
			color: borderColor,
		});

		const { width, height } = this.getInnerSize();
		const labelX = Math.max(0, Math.floor((width - this.label.length) / 2));
		const labelY = Math.floor(height / 2);
		const style  = this.disabled ? this.disabledStyleId
		             : this.focused  ? this.focusedStyleId
		             : this.normalStyleId;
		this.writeText(this.label, { x: labelX, y: labelY, style });

		super.render();
	}
}
