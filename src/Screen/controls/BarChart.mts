import type { BarChartProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

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

	/** Creates a BarChart from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: BarChartProperties) {
		super(wp);

		this.data     = cp?.data    ?? [];
		this.labels   = cp?.labels  ?? [];
		this.max      = cp?.max;
		this.barWidth = Math.max(1, cp?.barWidth ?? 1);

		const reg = getRegistry();
		this.barStyleId   = reg.register({ foreground: cp?.barColor ?? 75 });
		this.labelStyleId = reg.register({ foreground: 245 });
	}

	/** Sets the data values. Call render() afterwards. */
	public setData(data: number[]): void {
		this.data = data;
		this.markDirty();
	}

	/** Returns the current data values. */
	public getData(): number[] {
		return this.data;
	}

	/** Sets the bar labels. Call render() afterwards. */
	public setLabels(labels: string[]): void {
		this.labels = labels;
		this.markDirty();
	}

	/** Returns the current bar labels. */
	public getLabels(): string[] {
		return this.labels;
	}

	/** Sets the maximum Y value. Pass undefined to derive from data. Call render() afterwards. */
	public setMax(max: number | undefined): void {
		this.max = max;
		this.markDirty();
	}

	/** Returns the configured maximum Y value, or undefined if derived from data. */
	public getMax(): number | undefined {
		return this.max;
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
