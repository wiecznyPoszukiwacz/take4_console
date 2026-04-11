import { describe, it, expect } from 'vitest';
import { BarChart } from '../../src/Screen/controls/BarChart.mjs';
import { Pos }      from '../../src/Screen/Pos.mjs';
import { Size }     from '../../src/Screen/Size.mjs';

describe('BarChart', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to empty data', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		expect(bc.getData()).toEqual([]);
	});

	it('defaults to empty labels', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		expect(bc.getLabels()).toEqual([]);
	});

	it('getMax returns undefined when not configured', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		expect(bc.getMax()).toBeUndefined();
	});

	it('setData / getData round-trip', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		bc.setData([10, 20, 30]);
		expect(bc.getData()).toEqual([10, 20, 30]);
	});

	it('setLabels / getLabels round-trip', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		bc.setLabels(['A', 'B', 'C']);
		expect(bc.getLabels()).toEqual(['A', 'B', 'C']);
	});

	it('setMax / getMax round-trip', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		bc.setMax(50);
		expect(bc.getMax()).toBe(50);
	});

	it('isFocused always returns false', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		expect(bc.isFocused()).toBe(false);
	});

	it('isDisabled always returns false', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(20, 8));
		expect(bc.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('does not crash with empty data', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(10, 5));
		expect(() => bc.render()).not.toThrow();
	});

	it('bar at 100% fills the full plot height from the bottom', () => {
		// Height=5, plotH=4 (label row), barWidth=1, single bar value=100, max=100
		const bc = new BarChart(new Pos(0, 0), new Size(5, 5), { data: [100], max: 100 });
		bc.render();
		// Rows 0..3 (plotH=4) should all be '█'
		for (let row = 0; row < 4; row++) {
			expect(bc.getCell(0, row).char).toBe('█');
		}
	});

	it('bar at 0% is all empty (spaces)', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(5, 5), { data: [0], max: 100 });
		bc.render();
		for (let row = 0; row < 4; row++) {
			expect(bc.getCell(0, row).char).toBe(' ');
		}
	});

	it('filled cells have the configured barColor foreground', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(5, 5), { data: [100], max: 100, barColor: 82 });
		bc.render();
		expect(bc.getCell(0, 3).attributes.foreground).toBe(82);
	});

	it('default barColor is 75', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(5, 5), { data: [100], max: 100 });
		bc.render();
		expect(bc.getCell(0, 3).attributes.foreground).toBe(75);
	});

	it('label char appears in the last row at bar column', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(10, 5), { data: [50], labels: ['X'], max: 100 });
		bc.render();
		// Last row (row 4) at col 0 should be 'X'
		expect(bc.getCell(0, 4).char).toBe('X');
	});

	it('space between bars is empty', () => {
		// barWidth=1, barStep=2: bar0 at col 0, bar1 at col 2, space at col 1
		const bc = new BarChart(new Pos(0, 0), new Size(10, 5), {
			data: [100, 100], max: 100, barWidth: 1,
		});
		bc.render();
		// col 1 (spacing) should be ' ' in all plot rows
		for (let row = 0; row < 4; row++) {
			expect(bc.getCell(1, row).char).toBe(' ');
		}
	});

	it('second bar appears at correct column offset', () => {
		const bc = new BarChart(new Pos(0, 0), new Size(10, 5), {
			data: [100, 100], max: 100, barWidth: 1,
		});
		bc.render();
		// Second bar at col 2 (barStep = 2)
		expect(bc.getCell(2, 4 - 1).char).toBe('█');
	});
});
