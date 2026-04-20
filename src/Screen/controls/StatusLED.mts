import type { StatusLEDProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Size } from '../Size.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** Width of the indicator dot and trailing space ('● '). */
const DOT_WIDTH = 2;

/** A read-only status indicator rendered as a coloured dot with an optional text label.
 *  The control auto-sizes its width to fit the label when size is not provided. */
export class StatusLED extends Window {
	private state:  'ok' | 'warn' | 'error' | 'off';

	private offStyleId:   StyleId;
	private okStyleId:    StyleId;
	private warnStyleId:  StyleId;
	private errorStyleId: StyleId;
	private textStyleId:  StyleId;

	/** Creates a StatusLED from window properties and optional control-specific properties.
	 *  When wp.size is omitted, width is auto-computed as 2 + label.length.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: StatusLEDProperties) {
		const reg   = getRegistry();
		const label = wp.label ?? '';
		const size  = wp.size ?? new Size(DOT_WIDTH + label.length, 1);

		super({ ...wp, size });

		this.state = cp?.state ?? 'off';

		this.offStyleId   = reg.register({ foreground: 240 });
		this.okStyleId    = reg.register({ foreground: 76  });
		this.warnStyleId  = reg.register({ foreground: 226 });
		this.errorStyleId = reg.register({ foreground: 196 });
		this.textStyleId  = reg.register({ foreground: 252 });
	}

	/** Sets the current LED state. Call render() afterwards to update the display. */
	public setState(state: 'ok' | 'warn' | 'error' | 'off'): void {
		if (this.state === state) return;
		this.state = state;
		this.markDirty();
	}

	/** Returns the current LED state. */
	public getState(): 'ok' | 'warn' | 'error' | 'off' {
		return this.state;
	}

	public override render(): void {
		this.clear();

		const dotStyle = this.state === 'ok'    ? this.okStyleId
		               : this.state === 'warn'  ? this.warnStyleId
		               : this.state === 'error' ? this.errorStyleId
		               : this.offStyleId;

		this.writeText('●', { x: 0, y: 0, style: dotStyle });

		if (this.label.length > 0) {
			this.writeText(' ' + this.label, { x: 1, y: 0, style: this.textStyleId });
		}

		super.render();
	}
}
