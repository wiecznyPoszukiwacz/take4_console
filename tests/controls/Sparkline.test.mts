import { describe, it, expect } from 'vitest';
import { Sparkline } from '../../src/Screen/controls/Sparkline.mjs';
import { Pos }       from '../../src/Screen/Pos.mjs';
import { Size }      from '../../src/Screen/Size.mjs';

describe('Sparkline', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to empty data', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		expect(s.getData()).toEqual([]);
	});

	it('setData / getData round-trip', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		s.setData([1, 2, 3]);
		expect(s.getData()).toEqual([1, 2, 3]);
	});

	it('setMin / getMin round-trip', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		s.setMin(0);
		expect(s.getMin()).toBe(0);
	});

	it('setMax / getMax round-trip', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		s.setMax(100);
		expect(s.getMax()).toBe(100);
	});

	it('isFocused always returns false', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		expect(s.isFocused()).toBe(false);
	});

	it('isDisabled always returns false', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		expect(s.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('does not crash with empty data', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) });
		expect(() => s.render()).not.toThrow();
	});

	it('does not crash with a single data point', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(10, 1) }, { data: [5] });
		expect(() => s.render()).not.toThrow();
	});

	it('renders block-character glyphs across the row', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(8, 1) }, { data: [0, 25, 50, 75, 100] });
		s.render();
		const validGlyphs = new Set([' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']);
		for (let c = 0; c < 8; c++) {
			expect(validGlyphs.has(s.getCell(c, 0).char)).toBe(true);
		}
	});

	it('leftmost column reflects the lowest value (empty glyph)', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(8, 1) }, { data: [0, 50, 100] });
		s.render();
		expect(s.getCell(0, 0).char).toBe(' ');
	});

	it('rightmost column reflects the highest value (full block)', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(8, 1) }, { data: [0, 50, 100] });
		s.render();
		expect(s.getCell(7, 0).char).toBe('█');
	});

	it('flat data maps to a mid-height glyph', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(6, 1) }, { data: [5, 5, 5, 5] });
		s.render();
		// Flat → normalized 0.5 → level 4 → '▄'
		expect(s.getCell(3, 0).char).toBe('▄');
	});

	it('glyph foreground matches requested color', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(6, 1) }, { data: [1, 2, 3], color: 196 });
		s.render();
		expect(s.getCell(0, 0).attributes.foreground).toBe(196);
	});

	it('renders on the bottom row when height > 1', () => {
		const s = new Sparkline({ pos: new Pos(0, 0), size: new Size(6, 3) }, { data: [0, 50, 100] });
		s.render();
		// Top rows should be empty (background fill), bottom row carries the glyphs.
		expect(s.getCell(0, 2).char).toBe(' ');      // "empty" glyph at min
		expect(s.getCell(5, 2).char).toBe('█');
	});
});
