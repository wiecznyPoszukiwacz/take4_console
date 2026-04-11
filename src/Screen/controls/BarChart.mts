import type { BarChartOptions, StyleId } from '../types.mjs';
import { BUILTIN_WINDOW_BG } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** Character used for bar cells. */
const CHAR_BAR = '█';

/** A read-only vertical bar chart. Each bar fills from the bottom upward using block characters.
 *  The last row of the inner area is reserved for single-character bar labels. */
export class BarChart extends Window {
	private data:     number[];
	private labels:   string[];
	private max:      number | undefined;
	private barWidth: number;

	private barStyleId:   StyleId;
	private labelStyleId: StyleId;

	/** Creates a BarChart at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: BarChartOptions, registry?: StyleRegistry) {
		const reg  = registry ?? new StyleRegistry();
		const bgId = options?.background
			?? reg.getNamed(BUILTIN_WINDOW_BG)
			?? reg.register({ background: 237 });

		super(pos, size, {
			background: bgId,
			border:     options?.border,
			active:     options?.active,
		}, reg);

		this.data     = options?.data    ?? [];
		this.labels   = options?.labels  ?? [];
		this.max      = options?.max;
		this.barWidth = Math.max(1, options?.barWidth ?? 1);

		this.barStyleId   = reg.register({ foreground: options?.barColor ?? 75 });
		this.labelStyleId = reg.register({ foreground: 245 });
	}

	/** Sets the data values. Call render() afterwards. */
	public setData(data: number[]): void {
		this.data = data;
	}

	/** Returns the current data values. */
	public getData(): number[] {
		return this.data;
	}

	/** Sets the bar labels. Call render() afterwards. */
	public setLabels(labels: string[]): void {
		this.labels = labels;
	}

	/** Returns the current bar labels. */
	public getLabels(): string[] {
		return this.labels;
	}

	/** Sets the maximum Y value. Pass undefined to derive from data. Call render() afterwards. */
	public setMax(max: number | undefined): void {
		this.max = max;
	}

	/** Returns the configured maximum Y value, or undefined if derived from data. */
	public getMax(): number | undefined {
		return this.max;
	}

	/** BarChart is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; BarChart cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** BarChart cannot be disabled — always returns false. */
	public isDisabled(): boolean {
		return false;
	}

	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();

		if (this.data.length === 0 || width < 1 || height < 2) {
			super.render();
			return;
		}

		const dataMax  = this.max ?? Math.max(...this.data, 0);
		const plotH    = height - 1;  // last row is label row
		const barStep  = this.barWidth + 1;

		for (let i = 0; i < this.data.length; i++) {
			const startCol = i * barStep;
			if (startCol + this.barWidth > width) break;

			const norm       = dataMax > 0 ? Math.min(1, Math.max(0, this.data[i] / dataMax)) : 0;
			const filledRows = Math.round(norm * plotH);

			// Draw bar cells
			for (let row = 0; row < plotH; row++) {
				const isFilled = row >= (plotH - filledRows);
				for (let col = 0; col < this.barWidth; col++) {
					const absX = ox + startCol + col;
					if (absX - ox >= width) break;
					this.setCell(absX, oy + row, isFilled ? CHAR_BAR : ' ',
						isFilled ? this.barStyleId : 0);
				}
			}

			// Draw label in the bottom row (truncated to barWidth)
			const rawLabel = this.labels[i] ?? '';
			for (let col = 0; col < this.barWidth; col++) {
				const absX = ox + startCol + col;
				if (absX - ox >= width) break;
				const ch = col < rawLabel.length ? rawLabel[col] : ' ';
				this.setCell(absX, oy + plotH, ch, this.labelStyleId);
			}
		}

		super.render();
	}
}
