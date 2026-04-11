import type { StatusLEDOptions, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** Width of the indicator dot and trailing space ('● '). */
const DOT_WIDTH = 2;

/** A read-only status indicator rendered as a coloured dot with an optional text label.
 *  The control auto-sizes its width to fit the label at construction time. */
export class StatusLED extends Window {
	private state:  'ok' | 'warn' | 'error' | 'off';
	private label:  string;

	private offStyleId:   StyleId;
	private okStyleId:    StyleId;
	private warnStyleId:  StyleId;
	private errorStyleId: StyleId;
	private textStyleId:  StyleId;

	/** Creates a StatusLED at the given position.
	 *  Width is auto-computed as 2 + label.length. An optional StyleRegistry may be shared. */
	public constructor(pos: Pos, options?: StatusLEDOptions, registry?: StyleRegistry) {
		const reg   = registry ?? new StyleRegistry();
		const label = options?.label ?? '';
		const width = DOT_WIDTH + label.length;

		super(pos, new Size(width, 1), {
			background: options?.background,
			border:     options?.border,
			active:     options?.active,
		}, reg);

		this.state = options?.state ?? 'off';
		this.label = label;

		this.offStyleId   = reg.register({ foreground: 240 });
		this.okStyleId    = reg.register({ foreground: 76  });
		this.warnStyleId  = reg.register({ foreground: 226 });
		this.errorStyleId = reg.register({ foreground: 196 });
		this.textStyleId  = reg.register({ foreground: 252 });
	}

	/** Sets the current LED state. Call render() afterwards to update the display. */
	public setState(state: 'ok' | 'warn' | 'error' | 'off'): void {
		this.state = state;
	}

	/** Returns the current LED state. */
	public getState(): 'ok' | 'warn' | 'error' | 'off' {
		return this.state;
	}

	/** Sets the label text. Note: does not resize the control — size is fixed at construction.
	 *  Call render() afterwards to update the display. */
	public setLabel(label: string): void {
		this.label = label;
	}

	/** Returns the current label text. */
	public getLabel(): string {
		return this.label;
	}

	/** StatusLED is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; StatusLED cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** StatusLED cannot be disabled — always returns false. */
	public isDisabled(): boolean {
		return false;
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
