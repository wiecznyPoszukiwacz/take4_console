import { describe, it, expect } from 'vitest';
import { ProgressBarV } from '../../src/Screen/controls/ProgressBarV.mjs';
import { Pos }          from '../../src/Screen/Pos.mjs';
import { Size }         from '../../src/Screen/Size.mjs';

describe('ProgressBarV', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to value 0', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) });
		expect(pb.getValue()).toBe(0);
	});

	it('defaults to max 100', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) });
		expect(pb.getMax()).toBe(100);
	});

	it('clamps initial value to max', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) }, { value: 999, max: 50 });
		expect(pb.getValue()).toBe(50);
	});

	it('setValue clamps below 0', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) });
		pb.setValue(-1);
		expect(pb.getValue()).toBe(0);
	});

	it('setValue clamps above max', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) }, { max: 50 });
		pb.setValue(200);
		expect(pb.getValue()).toBe(50);
	});

	it('isFocused always returns false', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) });
		expect(pb.isFocused()).toBe(false);
	});

	it('isDisabled always returns false', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 6) });
		expect(pb.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('all cells are empty chars when value is 0', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(2, 4) }, { value: 0 });
		pb.render();
		for (let row = 0; row < 4; row++) {
			expect(pb.getCell(0, row).char).toBe('░');
		}
	});

	it('all cells are filled chars when value equals max', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(2, 4) }, { value: 100, max: 100 });
		pb.render();
		for (let row = 0; row < 4; row++) {
			expect(pb.getCell(0, row).char).toBe('█');
		}
	});

	it('fills from the bottom upward', () => {
		// Height=4, value=50% → bottom 2 rows filled, top 2 rows empty
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(1, 4) }, { value: 50, max: 100 });
		pb.render();
		expect(pb.getCell(0, 0).char).toBe('░');  // top row empty
		expect(pb.getCell(0, 1).char).toBe('░');  // second row empty
		expect(pb.getCell(0, 2).char).toBe('█');  // third row filled
		expect(pb.getCell(0, 3).char).toBe('█');  // bottom row filled
	});

	it('filled cells have the configured fillColor background', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(1, 2) }, { value: 100, fillColor: 82 });
		pb.render();
		expect(pb.getCell(0, 1).attributes.background).toBe(82);
	});

	it('empty cells have the configured emptyColor background', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(1, 2) }, { value: 0, emptyColor: 236 });
		pb.render();
		expect(pb.getCell(0, 0).attributes.background).toBe(236);
	});

	it('default fillColor is 75', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(1, 2) }, { value: 100, max: 100 });
		pb.render();
		expect(pb.getCell(0, 1).attributes.background).toBe(75);
	});

	it('fills all columns when width > 1', () => {
		const pb = new ProgressBarV({ pos: new Pos(0, 0), size: new Size(3, 2) }, { value: 100, max: 100 });
		pb.render();
		for (let col = 0; col < 3; col++) {
			expect(pb.getCell(col, 1).char).toBe('█');
		}
	});
});
