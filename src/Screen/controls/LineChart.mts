import type { LineChartOptions, StyleId } from '../types.mjs';
import { BUILTIN_WINDOW_BG } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** Direction of the line segment relative to the current data point. */
type Direction = 'up' | 'down' | 'flat';

/** Maps (enter direction, exit direction) to a box-drawing character. */
function selectLineChar(enter: Direction, exit: Direction): string {
	if (enter === 'flat'  && exit === 'flat')  return '─';
	if (enter === 'flat'  && exit === 'up')    return '╭';
	if (enter === 'flat'  && exit === 'down')  return '╰';
	if (enter === 'up'    && exit === 'flat')  return '╯';
	if (enter === 'down'  && exit === 'flat')  return '╮';
	if (enter === 'up'    && exit === 'up')    return '│';
	if (enter === 'down'  && exit === 'down')  return '│';
	// Peak (up→down) or valley (down→up): render as horizontal pass
	return '─';
}

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

	/** Creates a LineChart at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: LineChartOptions, registry?: StyleRegistry) {
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

		this.lineStyleId  = reg.register({ foreground: options?.color ?? 75 });
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

	/** LineChart is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; LineChart cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** LineChart cannot be disabled — always returns false. */
	public isDisabled(): boolean {
		return false;
	}

	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();

		if (width < 4 || height < 3) {
			super.render();
			return;
		}

		// ── 1. Resolve data range ───────────────────────────────────────────────
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

		// ── 3. Plot dimensions ───────────────────────────────────────────────────
		const plotW = width  - yLabelWidth;
		const plotH = height - 1;  // last row = X-axis

		if (plotW < 1 || plotH < 1) {
			super.render();
			return;
		}

		// ── 4. Map data points to (col, row) in plot space ────────────────────────
		/** Maps a value to a plot row (0 = top = dataMax). */
		const valueToRow = (v: number): number => {
			if (dataRange === 0) return Math.floor(plotH / 2);
			const norm = Math.min(1, Math.max(0, (v - dataMin) / dataRange));
			return (plotH - 1) - Math.round(norm * (plotH - 1));
		};

		/** Maps a data index to a plot column. */
		const indexToCol = (i: number): number => {
			if (this.data.length <= 1) return 0;
			return Math.round((i / (this.data.length - 1)) * (plotW - 1));
		};

		// Group by column (last point wins on collision)
		const colToRow = new Map<number, number>();
		for (let i = 0; i < this.data.length; i++) {
			colToRow.set(indexToCol(i), valueToRow(this.data[i]));
		}

		// ── 5. Draw Y-axis ────────────────────────────────────────────────────────
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

		// ── 6. Draw X-axis ────────────────────────────────────────────────────────
		const xAxisAbsY = oy + plotH;
		for (let col = 0; col < plotW; col++) {
			const absX = ox + yLabelWidth + col;
			this.setCell(absX, xAxisAbsY, col === 0 ? '┼' : '─', this.axisStyleId);
		}
		// Y-axis bottom corner
		this.setCell(yAxisAbsX, xAxisAbsY, '┼', this.axisStyleId);

		// ── 7. Draw line segments ────────────────────────────────────────────────
		if (this.data.length === 0) {
			super.render();
			return;
		}

		const sortedCols = [...colToRow.keys()].sort((a, b) => a - b);

		for (let idx = 0; idx < sortedCols.length; idx++) {
			const c     = sortedCols[idx];
			const r     = colToRow.get(c)!;
			const rPrev = idx > 0                      ? colToRow.get(sortedCols[idx - 1])! : r;
			const rNext = idx < sortedCols.length - 1  ? colToRow.get(sortedCols[idx + 1])! : r;

			// Entry direction (from previous column to current row)
			const enter: Direction = rPrev > r ? 'up' : rPrev < r ? 'down' : 'flat';
			// Exit direction (from current row to next column)
			const exit:  Direction = rNext < r ? 'up' : rNext > r ? 'down' : 'flat';

			const ch    = selectLineChar(enter, exit);
			const absX  = ox + yLabelWidth + c;
			const absY  = oy + r;
			this.setCell(absX, absY, ch, this.lineStyleId);

			// Fill vertical segment in this column for the exit direction
			if (idx < sortedCols.length - 1) {
				const rN  = colToRow.get(sortedCols[idx + 1])!;
				const top = Math.min(r, rN) + 1;
				const bot = Math.max(r, rN) - 1;
				for (let row = top; row <= bot; row++) {
					this.setCell(ox + yLabelWidth + c, oy + row, '│', this.lineStyleId);
				}
			}
		}

		super.render();
	}
}
