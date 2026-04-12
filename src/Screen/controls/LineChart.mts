import type { LineChartProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** Formats a Y-axis label value as a compact string. */
function formatYLabel(value: number): string {
	if (Number.isInteger(value)) return String(value);
	const rounded = Math.round(value * 10) / 10;
	return String(rounded);
}

/** A read-only line chart that renders a data series using box-drawing characters.
 *  Includes a labelled Y-axis on the left and an X-axis at the bottom. */
export class LineChart extends Window {
	private data:     number[];
	private minValue: number | undefined;
	private maxValue: number | undefined;

	private lineStyleId:  StyleId;
	private axisStyleId:  StyleId;
	private labelStyleId: StyleId;

	/** Creates a LineChart from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: LineChartProperties) {
		super(wp);

		this.data     = cp?.data ?? [];
		this.minValue = cp?.min;
		this.maxValue = cp?.max;

		const reg = getRegistry();
		this.lineStyleId  = reg.register({ foreground: cp?.color ?? 75 });
		this.axisStyleId  = reg.register({ foreground: 245 });
		this.labelStyleId = reg.register({ foreground: 245 });
	}

	/** Sets the data series. Call render() afterwards. */
	public setData(data: number[]): void {
		this.data = data;
	}

	/** Returns the current data series. */
	public getData(): number[] {
		return this.data;
	}

	/** Sets the minimum Y value. Pass undefined to derive from data. Call render() afterwards. */
	public setMin(min: number | undefined): void {
		this.minValue = min;
	}

	/** Returns the configured minimum Y value, or undefined if derived from data. */
	public getMin(): number | undefined {
		return this.minValue;
	}

	/** Sets the maximum Y value. Pass undefined to derive from data. Call render() afterwards. */
	public setMax(max: number | undefined): void {
		this.maxValue = max;
	}

	/** Returns the configured maximum Y value, or undefined if derived from data. */
	public getMax(): number | undefined {
		return this.maxValue;
	}

	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();

		if (width < 4 || height < 3) {
			super.render();
			return;
		}

		// ── 1. Resolve data range ───────────────────────��───────────────────────
		const dataMin   = this.minValue ?? (this.data.length > 0 ? Math.min(...this.data) : 0);
		const dataMax   = this.maxValue ?? (this.data.length > 0 ? Math.max(...this.data) : 1);
		const dataRange = dataMax - dataMin;

		// ── 2. Compute Y-axis label width ────────────────────────────────────────
		const numYLabels   = Math.min(5, Math.max(2, height - 1));
		const yLabelValues = Array.from({ length: numYLabels }, (_, k) =>
			dataMin + (k / (numYLabels - 1)) * dataRange,
		);
		const yLabelStrs   = yLabelValues.map(formatYLabel);
		const maxLabelLen  = Math.max(...yLabelStrs.map(s => s.length));
		const yLabelWidth  = maxLabelLen + 2;  // space + label + '┤'

		// ── 3. Plot dimensions ───────────────────────��───────────────────────────
		const plotW = width  - yLabelWidth;
		const plotH = height - 1;  // last row = X-axis

		if (plotW < 1 || plotH < 1) {
			super.render();
			return;
		}

		/** Maps a value to a plot row (0 = top = dataMax). */
		const valueToRow = (v: number): number => {
			if (dataRange === 0) return Math.floor((plotH - 1) / 2);
			const norm = Math.min(1, Math.max(0, (v - dataMin) / dataRange));
			return (plotH - 1) - Math.round(norm * (plotH - 1));
		};

		// ── 4. Draw Y-axis ───────────────────��────────────────────────────────────
		const yAxisAbsX = ox + yLabelWidth - 1;  // column of '┤' / '│'

		// Draw vertical line for all plot rows
		for (let row = 0; row < plotH; row++) {
			this.setCell(yAxisAbsX, oy + row, '│', this.axisStyleId);
		}

		// Overwrite with '┤' and labels at each label row
		for (let k = 0; k < numYLabels; k++) {
			// k=0 → bottom label (dataMin), k=numYLabels-1 → top label (dataMax)
			const labelValue = yLabelValues[k];
			const labelRow   = valueToRow(labelValue);
			const labelStr   = yLabelStrs[k];
			// Right-justify within maxLabelLen columns starting at ox
			const padded     = labelStr.padStart(maxLabelLen);
			this.setCell(yAxisAbsX, oy + labelRow, '┤', this.axisStyleId);
			for (let c = 0; c < padded.length; c++) {
				this.setCell(ox + c, oy + labelRow, padded[c], this.labelStyleId);
			}
		}

		// ── 5. Draw X-axis ─────────────────────────���─────────────────────────���────
		const xAxisAbsY = oy + plotH;
		for (let col = 0; col < plotW; col++) {
			const absX = ox + yLabelWidth + col;
			this.setCell(absX, xAxisAbsY, col === 0 ? '┼' : '─', this.axisStyleId);
		}
		// Y-axis bottom corner
		this.setCell(yAxisAbsX, xAxisAbsY, '┼', this.axisStyleId);

		// ── 6. Plot the line ──────────────────────────────────────────────────────
		if (this.data.length === 0) {
			super.render();
			return;
		}

		// Build an interpolated row index for every plot column. With more
		// columns than data points, this upsamples the series; with fewer,
		// it averages between adjacent samples.
		const dataRow: number[] = new Array(plotW);
		if (this.data.length === 1) {
			const r0 = valueToRow(this.data[0]);
			for (let c = 0; c < plotW; c++) dataRow[c] = r0;
		} else {
			for (let c = 0; c < plotW; c++) {
				const t    = (c / (plotW - 1)) * (this.data.length - 1);
				const i0   = Math.floor(t);
				const i1   = Math.min(i0 + 1, this.data.length - 1);
				const frac = t - i0;
				const v    = this.data[i0] * (1 - frac) + this.data[i1] * frac;
				dataRow[c] = valueToRow(v);
			}
		}

		/** Draws a single line cell in plot space. */
		const plot = (col: number, row: number, ch: string): void => {
			this.setCell(ox + yLabelWidth + col, oy + row, ch, this.lineStyleId);
		};

		// Each column either holds a flat horizontal segment or a self-contained
		// vertical step bridging the previous column's row to this column's row.
		// The first column has no incoming step.
		plot(0, dataRow[0], '─');

		for (let c = 1; c < plotW; c++) {
			const inRow  = dataRow[c - 1];
			const outRow = dataRow[c];

			if (inRow === outRow) {
				plot(c, outRow, '─');
				continue;
			}

			const top = Math.min(inRow, outRow);
			const bot = Math.max(inRow, outRow);

			if (outRow < inRow) {
				// Going up: line enters from left at the bottom, exits right at the top.
				plot(c, bot, '╯');  // LEFT + TOP
				plot(c, top, '╭');  // BOTTOM + RIGHT
			} else {
				// Going down: line enters from left at the top, exits right at the bottom.
				plot(c, top, '╮');  // LEFT + BOTTOM
				plot(c, bot, '╰');  // TOP + RIGHT
			}
			for (let row = top + 1; row < bot; row++) {
				plot(c, row, '│');
			}
		}

		super.render();
	}
}
