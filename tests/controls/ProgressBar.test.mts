import { describe, it, expect } from 'vitest';
import { ProgressBar } from '../../src/Screen/controls/ProgressBar.mjs';
import { Pos }         from '../../src/Screen/Pos.mjs';
import { Size }        from '../../src/Screen/Size.mjs';

describe('ProgressBar', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to value 0', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1));
		expect(pb.getValue()).toBe(0);
	});

	it('defaults to max 100', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1));
		expect(pb.getMax()).toBe(100);
	});

	it('accepts initial value and max', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { value: 40, max: 200 });
		expect(pb.getValue()).toBe(40);
		expect(pb.getMax()).toBe(200);
	});

	it('clamps initial value to max', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { value: 999, max: 50 });
		expect(pb.getValue()).toBe(50);
	});

	it('setValue / getValue round-trip', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { max: 100 });
		pb.setValue(75);
		expect(pb.getValue()).toBe(75);
	});

	it('setValue clamps below 0', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1));
		pb.setValue(-5);
		expect(pb.getValue()).toBe(0);
	});

	it('setValue clamps above max', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { max: 50 });
		pb.setValue(100);
		expect(pb.getValue()).toBe(50);
	});

	it('setMax / getMax round-trip', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1));
		pb.setMax(200);
		expect(pb.getMax()).toBe(200);
	});

	it('isFocused always returns false', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1));
		expect(pb.isFocused()).toBe(false);
	});

	it('isDisabled always returns false', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1));
		expect(pb.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('all cells are empty chars when value is 0', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(5, 1), { value: 0, showLabel: false });
		pb.render();
		for (let x = 0; x < 5; x++) {
			expect(pb.getCell(x, 0).char).toBe('░');
		}
	});

	it('all cells are filled chars when value equals max', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(5, 1), { value: 100, max: 100, showLabel: false });
		pb.render();
		for (let x = 0; x < 5; x++) {
			expect(pb.getCell(x, 0).char).toBe('█');
		}
	});

	it('half the bar is filled at 50%', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { value: 50, max: 100, showLabel: false });
		pb.render();
		// first 5 cells filled, last 5 empty
		expect(pb.getCell(0, 0).char).toBe('█');
		expect(pb.getCell(4, 0).char).toBe('█');
		expect(pb.getCell(5, 0).char).toBe('░');
		expect(pb.getCell(9, 0).char).toBe('░');
	});

	it('filled cells have the configured fillColor background', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(6, 1), { value: 100, max: 100, fillColor: 82, showLabel: false });
		pb.render();
		expect(pb.getCell(0, 0).attributes.background).toBe(82);
	});

	it('empty cells have the configured emptyColor background', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(6, 1), { value: 0, max: 100, emptyColor: 236, showLabel: false });
		pb.render();
		expect(pb.getCell(0, 0).attributes.background).toBe(236);
	});

	it('default fillColor is 75', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(4, 1), { value: 100, showLabel: false });
		pb.render();
		expect(pb.getCell(0, 0).attributes.background).toBe(75);
	});

	it('percentage label is centred when showLabel is true', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { value: 0, showLabel: true });
		pb.render();
		// "0%" is 2 chars; centre of 10 = offset 4
		const labelX = Math.max(0, Math.floor((10 - 2) / 2));
		expect(pb.getCell(labelX, 0).char).toBe('0');
	});

	it('no label chars when showLabel is false', () => {
		const pb = new ProgressBar(new Pos(0, 0), new Size(10, 1), { value: 0, showLabel: false });
		pb.render();
		// With value=0 and showLabel=false, all chars must be '░'
		for (let x = 0; x < 10; x++) {
			expect(pb.getCell(x, 0).char).toBe('░');
		}
	});
});
