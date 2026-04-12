import type { ProgressBarProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** Character used for the filled portion of the bar. */
const CHAR_FILL  = '█';
/** Character used for the empty portion of the bar. */
const CHAR_EMPTY = '░';

/** A horizontal read-only progress bar that fills left-to-right using block characters.
 *  Displays an optional centred percentage label over the bar. */
export class ProgressBar extends Window {
	private value:     number;
	private max:       number;
	private showLabel: boolean;

	private fillStyleId:  StyleId;
	private emptyStyleId: StyleId;
	private labelStyleId: StyleId;

	/** Creates a ProgressBar from window properties and optional control-specific properties.
	 *  Recommended height: 1 (no border) or 3 (with border).
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: ProgressBarProperties) {
		super(wp);

		this.max       = Math.max(1, cp?.max ?? 100);
		this.value     = Math.max(0, Math.min(cp?.value ?? 0, this.max));
		this.showLabel = cp?.showLabel ?? true;

		const reg = getRegistry();
		this.fillStyleId  = reg.register({ background: cp?.fillColor  ?? 75  });
		this.emptyStyleId = reg.register({ background: cp?.emptyColor ?? 237 });
		this.labelStyleId = reg.register({ foreground: 255, bold: true });
	}

	/** Sets the current value (clamped to 0–max). Call render() afterwards. */
	public setValue(value: number): void {
		this.value = Math.max(0, Math.min(value, this.max));
	}

	/** Returns the current value. */
	public getValue(): number {
		return this.value;
	}

	/** Sets the maximum value (minimum 1). Call render() afterwards. */
	public setMax(max: number): void {
		this.max   = Math.max(1, max);
		this.value = Math.min(this.value, this.max);
	}

	/** Returns the maximum value. */
	public getMax(): number {
		return this.max;
	}

	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();

		if (width < 1 || height < 1) {
			super.render();
			return;
		}

		const ratio      = this.max > 0 ? Math.min(1, Math.max(0, this.value / this.max)) : 0;
		const filledCols = Math.round(ratio * width);
		const barRow     = Math.floor(height / 2);

		for (let x = 0; x < width; x++) {
			const isFilled = x < filledCols;
			this.setCell(ox + x, oy + barRow, isFilled ? CHAR_FILL : CHAR_EMPTY,
				isFilled ? this.fillStyleId : this.emptyStyleId);
		}

		if (this.showLabel) {
			const pct    = Math.round(ratio * 100);
			const text   = `${pct}%`;
			const labelX = Math.max(0, Math.floor((width - text.length) / 2));
			this.writeText(text, { x: labelX, y: barRow, style: this.labelStyleId });
		}

		super.render();
	}
}
