import type { ButtonProperties, WindowProperties } from '../types.mjs';
import { Window } from '../Window.mjs';

/** A clickable button that renders a centred label inside a rounded border.
 *  Visual state (normal / focused / disabled) is controlled via setters.
 *  Appearance can be customised by overriding the built-in named styles via Screen.setBuiltinStyle(). */
export class Button extends Window {
	private onPress?: () => void;

	/** Creates a Button from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: ButtonProperties) {
		super({
			...wp,
			defaultBorder: { top: true, right: true, bottom: true, left: true, style: 'rounded' },
		});

		this.onPress = cp?.onPress;
	}

	/** Processes a key press; Enter or Space triggers the onPress callback. */
	public handleKey(key: string): void {
		if (this.disabled) return;
		if (key === '\r' || key === '\n' || key === ' ' || key === 'enter' || key === 'space') {
			this.onPress?.();
		}
	}

	/** Rebuilds the button: writes centred label with appropriate style, then composites. */
	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const labelX = Math.max(0, Math.floor((width - this.label.length) / 2));
		const labelY = Math.floor(height / 2);
		this.writeText(this.label, { x: labelX, y: labelY });

		super.render();
	}
}
