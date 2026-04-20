import type { SparklineProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** Eight-level block character ramp from empty → full. */
const RAMP = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

/** A one-row inline sparkline chart using block-character glyphs. Ideal for
 *  tucking a live trend indicator into status bars, table rows, or tight
 *  spaces where a full LineChart would be overkill. The control can be any
 *  height, but only the last row is used for the glyphs. */
export class Sparkline extends Window {
	private data:     number[];
	private minValue: number | undefined;
	private maxValue: number | undefined;

	private glyphStyleId: StyleId;

	/** Creates a Sparkline from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: SparklineProperties) {
		super(wp);

		this.data     = cp?.data ?? [];
		this.minValue = cp?.min;
		this.maxValue = cp?.max;

		this.glyphStyleId = getRegistry().register({ foreground: cp?.color ?? 75 });
	}

	/** Sets the data series. Call render() afterwards. */
	public setData(data: number[]): void {
		this.data = data;
		this.markDirty();
	}

	/** Returns the current data series. */
	public getData(): number[] {
		return this.data;
	}

	/** Sets the minimum value. Pass undefined to derive from data. Call render() afterwards. */
	public setMin(min: number | undefined): void {
		this.minValue = min;
		this.markDirty();
	}

	/** Returns the configured minimum value, or undefined if derived from data. */
	public getMin(): number | undefined {
		return this.minValue;
	}

	/** Sets the maximum value. Pass undefined to derive from data. Call render() afterwards. */
	public setMax(max: number | undefined): void {
		this.maxValue = max;
		this.markDirty();
	}

	/** Returns the configured maximum value, or undefined if derived from data. */
	public getMax(): number | undefined {
		return this.maxValue;
	}

	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();

		if (width < 1 || height < 1 || this.data.length === 0) {
			super.render();
			return;
		}

		const dataMin = this.minValue ?? Math.min(...this.data);
		const dataMax = this.maxValue ?? Math.max(...this.data);
		const range   = dataMax - dataMin;

		// Glyphs live on the bottom-most row of the inner area; any rows above
		// remain blank (useful when the caller wants the sparkline aligned to
		// the baseline of a taller container).
		const row = oy + height - 1;

		for (let c = 0; c < width; c++) {
			// Map column → fractional data index so that width != data.length still works.
			let value: number;
			if (this.data.length === 1) {
				value = this.data[0];
			} else {
				const t    = (c / Math.max(1, width - 1)) * (this.data.length - 1);
				const i0   = Math.floor(t);
				const i1   = Math.min(i0 + 1, this.data.length - 1);
				const frac = t - i0;
				value      = this.data[i0] * (1 - frac) + this.data[i1] * frac;
			}

			const norm  = range > 0 ? Math.min(1, Math.max(0, (value - dataMin) / range)) : 0.5;
			const level = Math.round(norm * (RAMP.length - 1));
			this.setCell(ox + c, row, RAMP[level], this.glyphStyleId);
		}

		super.render();
	}
}
