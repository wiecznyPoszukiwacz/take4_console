import type { CheckboxOptions, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** Width of the indicator prefix: `[✓] ` = 4 columns. */
const INDICATOR_WIDTH = 4;

/** A toggle control that renders `[✓] label` (checked) or `[ ] label` (unchecked).
 *  Width is derived automatically from the label length.
 *  Use setChecked() / setFocused() / setDisabled() to update state. */
export class Checkbox extends Window {
	private label: string;
	private checked: boolean;
	private focused: boolean;
	private disabled: boolean;
	private onChange?: (checked: boolean) => void;
	private normalStyleId: StyleId;
	private focusedStyleId: StyleId;
	private checkedStyleId: StyleId;
	private disabledStyleId: StyleId;

	/** Creates a Checkbox at the given position. Width is computed from the label automatically.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, label: string, options?: CheckboxOptions, registry?: StyleRegistry) {
		super(pos, new Size(INDICATOR_WIDTH + label.length, 1), {
			active: !(options?.disabled ?? false),
		}, registry);

		this.label    = label;
		this.checked  = options?.checked  ?? false;
		this.focused  = options?.focused  ?? false;
		this.disabled = options?.disabled ?? false;
		this.onChange = options?.onChange;

		this.normalStyleId   = this.registry.register({ foreground: 252 });
		this.focusedStyleId  = this.registry.register({ foreground: 255, bold: true });
		this.checkedStyleId  = this.registry.register({ foreground: 76, bold: true });
		this.disabledStyleId = this.registry.register({ foreground: 245, dim: true });
	}

	/** Toggles or sets the checked state. */
	public setChecked(checked: boolean): void {
		this.checked = checked;
	}

	/** Returns the current checked state. */
	public isChecked(): boolean {
		return this.checked;
	}

	/** Sets the focused state; affects label style on next render(). */
	public setFocused(focused: boolean): void {
		this.focused = focused;
	}

	/** Returns whether the checkbox currently has focus. */
	public isFocused(): boolean {
		return this.focused;
	}

	/** Sets the disabled state; dims the control on next render(). */
	public setDisabled(disabled: boolean): void {
		this.disabled = disabled;
		this.setActive(!disabled);
	}

	/** Returns whether the checkbox is currently disabled. */
	public isDisabled(): boolean {
		return this.disabled;
	}

	/** Processes a key press; Space toggles the checked state and fires onChange. */
	public handleKey(key: string): void {
		if (this.disabled) return;
		if (key === ' ' || key === 'space') {
			this.checked = !this.checked;
			this.onChange?.(this.checked);
		}
	}

	/** Rebuilds the checkbox: draws indicator and label with appropriate styles. */
	public override render(): void {
		this.clear();

		const indicator = this.checked ? '[✓]' : '[ ]';

		const indicatorStyle = this.disabled ? this.disabledStyleId
		                     : this.checked  ? this.checkedStyleId
		                     : this.normalStyleId;
		const labelStyle     = this.disabled ? this.disabledStyleId
		                     : this.focused  ? this.focusedStyleId
		                     : this.normalStyleId;

		// Write indicator (first 3 chars) and label separately to allow distinct colouring.
		this.writeText(indicator, { style: indicatorStyle });
		this.writeText(` ${this.label}`, { x: INDICATOR_WIDTH - 1, style: labelStyle });

		super.render();
	}
}
