import type { CheckboxProperties, WindowProperties, StyleId } from '../types.mjs';
import { BUILTIN_TEXT_CHECKED } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Size } from '../Size.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** Width of the indicator prefix: `[✓] ` = 4 columns. */
const INDICATOR_WIDTH = 4;

/** A toggle control that renders `[✓] label` (checked) or `[ ] label` (unchecked).
 *  Width is derived automatically from the label length when size is not provided.
 *  Use setChecked() / setFocused() / setDisabled() to update state. */
export class Checkbox extends Window {
	private checked: boolean;
	private onChange?: (checked: boolean) => void;
	private checkedStyleId: StyleId;

	/** Creates a Checkbox from window properties and optional control-specific properties.
	 *  When wp.size is omitted, width is computed from wp.label automatically.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: CheckboxProperties) {
		const label = wp.label ?? '';
		const size  = wp.size ?? new Size(INDICATOR_WIDTH + label.length, 1);
		super({ ...wp, size });

		this.checked  = cp?.checked  ?? false;
		this.onChange = cp?.onChange;

		this.checkedStyleId = getRegistry().getNamed(BUILTIN_TEXT_CHECKED)!;
	}

	/** Toggles or sets the checked state. */
	public setChecked(checked: boolean): void {
		if (this.checked === checked) return;
		this.checked = checked;
		this.markDirty();
	}

	/** Returns the current checked state. */
	public isChecked(): boolean {
		return this.checked;
	}

	/** Processes a key press; Space toggles the checked state and fires onChange. */
	public handleKey(key: string): void {
		if (this.disabled) return;
		if (key === ' ' || key === 'space') {
			this.checked = !this.checked;
			this.markDirty();
			this.onChange?.(this.checked);
		}
	}

	/** Rebuilds the checkbox: draws indicator and label with appropriate styles. */
	public override render(): void {
		this.clear();

		const indicator      = this.checked ? '[✓]' : '[ ]';
		// For indicator: use checkedStyleId when checked (and not disabled); auto-pick otherwise.
		const indicatorStyle = (!this.disabled && this.checked) ? this.checkedStyleId : undefined;

		// Write indicator (first 3 chars) and label separately to allow distinct colouring.
		// Label uses auto-style (disabled/focused/normal via writeText).
		this.writeText(indicator, { style: indicatorStyle });
		this.writeText(` ${this.label}`, { x: INDICATOR_WIDTH - 1 });

		super.render();
	}
}
