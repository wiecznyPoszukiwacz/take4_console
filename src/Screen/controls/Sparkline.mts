import type { SparklineOptions, StyleId } from '../types.mjs';
import { BUILTIN_WINDOW_BG } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

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

	/** Creates a Sparkline at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: SparklineOptions, registry?: StyleRegistry) {
		const reg  = registry ?? new StyleRegistry();
		const bgId = options?.background
			?? reg.getNamed(BUILTIN_WINDOW_BG)
			?? reg.register({ background: 237 });

		super(pos, size, {
			background: bgId,
			border:     options?.border,
			active:     options?.active,
		}, reg);

		this.data     = options?.data ?? [];
		this.minValue = options?.min;
		this.maxValue = options?.max;

		this.glyphStyleId = reg.register({ foreground: options?.color ?? 75 });
	}

	/** Sets the data series. Call render() afterwards. */
	public setData(data: number[]): void {
		this.data = data;
	}

	/** Returns the current data series. */
	public getData(): number[] {
		return this.data;
	}

	/** Sets the minimum value. Pass undefined to derive from data. Call render() afterwards. */
	public setMin(min: number | undefined): void {
		this.minValue = min;
	}

	/** Returns the configured minimum value, or undefined if derived from data. */
	public getMin(): number | undefined {
		return this.minValue;
	}

	/** Sets the maximum value. Pass undefined to derive from data. Call render() afterwards. */
	public setMax(max: number | undefined): void {
		this.maxValue = max;
	}

	/** Returns the configured maximum value, or undefined if derived from data. */
	public getMax(): number | undefined {
		return this.maxValue;
	}

	/** Sparkline is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; Sparkline cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** Sparkline cannot be disabled — always returns false. */
	public isDisabled(): boolean {
		return false;
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
