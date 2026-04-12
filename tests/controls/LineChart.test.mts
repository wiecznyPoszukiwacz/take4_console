import { describe, it, expect } from 'vitest';
import { LineChart } from '../../src/Screen/controls/LineChart.mjs';
import { Pos }       from '../../src/Screen/Pos.mjs';
import { Size }      from '../../src/Screen/Size.mjs';

describe('LineChart', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to empty data', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lc.getData()).toEqual([]);
	});

	it('setData / getData round-trip', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		lc.setData([1, 2, 3]);
		expect(lc.getData()).toEqual([1, 2, 3]);
	});

	it('setMin / getMin round-trip', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		lc.setMin(5);
		expect(lc.getMin()).toBe(5);
	});

	it('setMax / getMax round-trip', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		lc.setMax(50);
		expect(lc.getMax()).toBe(50);
	});

	it('getMin returns undefined by default', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lc.getMin()).toBeUndefined();
	});

	it('isFocused always returns false', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lc.isFocused()).toBe(false);
	});

	it('isDisabled always returns false', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lc.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('does not crash with empty data', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(() => lc.render()).not.toThrow();
	});

	it('does not crash with a single data point', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) }, { data: [5] });
		expect(() => lc.render()).not.toThrow();
	});

	it('flat series renders horizontal dash chars on the line row', () => {
		// All values identical → flat line at the middle row
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) }, { data: [5, 5, 5, 5] });
		lc.render();
		const { width, height } = lc.getInnerSize();
		const { x: ox, y: oy } = lc.getInnerOffset();
		// The line row is plotH/2 for a flat series
		// At least one '─' char must appear in the plot area
		let found = false;
		for (let row = 0; row < height - 1; row++) {
			for (let col = 0; col < width; col++) {
				if (lc.getCell(ox + col, oy + row).char === '─') {
					found = true;
					break;
				}
			}
		}
		expect(found).toBe(true);
	});

	it('X-axis row contains "─" and "┼" characters', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) }, { data: [1, 2, 3] });
		lc.render();
		const { width, height } = lc.getInnerSize();
		const { x: ox, y: oy } = lc.getInnerOffset();
		const axisRow = oy + height - 1;
		const rowChars = Array.from({ length: width }, (_, x) => lc.getCell(ox + x, axisRow).char);
		expect(rowChars).toContain('─');
		expect(rowChars).toContain('┼');
	});

	it('Y-axis column contains "┤" at label positions', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) }, { data: [0, 50, 100] });
		lc.render();
		const { width, height } = lc.getInnerSize();
		const { x: ox, y: oy } = lc.getInnerOffset();
		let found = false;
		for (let row = 0; row < height; row++) {
			for (let col = 0; col < width; col++) {
				if (lc.getCell(ox + col, oy + row).char === '┤') {
					found = true;
					break;
				}
			}
		}
		expect(found).toBe(true);
	});

	it('ascending series contains corner chars ╭ or ╯', () => {
		// Two points: 0 → 100 — line goes up
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) }, { data: [0, 100] });
		lc.render();
		const { width, height } = lc.getInnerSize();
		const { x: ox, y: oy } = lc.getInnerOffset();
		const allChars = Array.from({ length: height }, (_, y) =>
			Array.from({ length: width }, (__, x) => lc.getCell(ox + x, oy + y).char),
		).flat();
		const hasCorner = allChars.includes('╭') || allChars.includes('╯');
		expect(hasCorner).toBe(true);
	});

	it('line cells have the default colour (75)', () => {
		const lc = new LineChart({ pos: new Pos(0, 0), size: new Size(20, 8) }, { data: [5, 5, 5] });
		lc.render();
		const { width, height } = lc.getInnerSize();
		const { x: ox, y: oy } = lc.getInnerOffset();
		// Find a line char (─) in the plot area and check its foreground
		for (let row = 0; row < height - 1; row++) {
			for (let col = 0; col < width; col++) {
				if (lc.getCell(ox + col, oy + row).char === '─') {
					expect(lc.getCell(ox + col, oy + row).attributes.foreground).toBe(75);
					return;
				}
			}
		}
	});
});
