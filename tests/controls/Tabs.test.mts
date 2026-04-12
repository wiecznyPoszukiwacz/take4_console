import { describe, it, expect } from 'vitest';
import { Tabs }   from '../../src/Screen/controls/Tabs.mjs';
import { Window } from '../../src/Screen/Window.mjs';
import { Pos }    from '../../src/Screen/Pos.mjs';
import { Size }   from '../../src/Screen/Size.mjs';

describe('Tabs', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to empty titles and activeIndex 0', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10));
		expect(t.getTitles()).toEqual([]);
		expect(t.getActiveIndex()).toBe(0);
	});

	it('accepts initial titles and activeIndex', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B', 'C'], activeIndex: 2 });
		expect(t.getTitles()).toEqual(['A', 'B', 'C']);
		expect(t.getActiveIndex()).toBe(2);
	});

	it('clamps initial activeIndex into range', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B'], activeIndex: 99 });
		expect(t.getActiveIndex()).toBe(1);
	});

	it('setTitles clamps active index', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B', 'C'], activeIndex: 2 });
		t.setTitles(['X', 'Y']);
		expect(t.getTitles()).toEqual(['X', 'Y']);
		expect(t.getActiveIndex()).toBe(1);
	});

	it('setActiveIndex clamps into range', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B', 'C'] });
		t.setActiveIndex(10);
		expect(t.getActiveIndex()).toBe(2);
		t.setActiveIndex(-5);
		expect(t.getActiveIndex()).toBe(0);
	});

	it('setActiveIndex fires onChange when the index changes', () => {
		let received: [number, string] | null = null;
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), {
			titles: ['A', 'B', 'C'],
			onChange: (i, s) => { received = [i, s]; },
		});
		t.setActiveIndex(1);
		expect(received).toEqual([1, 'B']);
	});

	it('setActiveIndex does not fire onChange when the index stays the same', () => {
		let calls = 0;
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), {
			titles: ['A', 'B'],
			onChange: () => { calls++; },
		});
		t.setActiveIndex(0);
		expect(calls).toBe(0);
	});

	// ── Focus / disabled ────────────────────────────────────────────────────────

	it('setFocused / isFocused round-trip', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10));
		expect(t.isFocused()).toBe(false);
		t.setFocused(true);
		expect(t.isFocused()).toBe(true);
	});

	it('setDisabled / isDisabled round-trip', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10));
		t.setDisabled(true);
		expect(t.isDisabled()).toBe(true);
	});

	// ── handleKey ───────────────────────────────────────────────────────────────

	it('right arrow advances the active tab', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B', 'C'] });
		t.handleKey('\x1b[C');
		expect(t.getActiveIndex()).toBe(1);
	});

	it('left arrow moves the active tab back', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B', 'C'], activeIndex: 2 });
		t.handleKey('\x1b[D');
		expect(t.getActiveIndex()).toBe(1);
	});

	it('arrow keys do not wrap around', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B'] });
		t.handleKey('\x1b[D'); // already at 0
		expect(t.getActiveIndex()).toBe(0);
		t.handleKey('\x1b[C');
		t.handleKey('\x1b[C'); // past end
		expect(t.getActiveIndex()).toBe(1);
	});

	it('disabled Tabs ignores keys', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B'], disabled: true });
		t.handleKey('\x1b[C');
		expect(t.getActiveIndex()).toBe(0);
	});

	// ── addChildToTab ───────────────────────────────────────────────────────────

	it('addChildToTab adds the child and tags it with its tab index', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B'] });
		const w = new Window(new Pos(0, 1), new Size(5, 3));
		t.addChildToTab(1, w);
		// Child is present regardless of tab state.
		w.setCell(0, 0, 'x');
		expect(w.getCell(0, 0).char).toBe('x');
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('does not crash with no tabs', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10));
		expect(() => t.render()).not.toThrow();
	});

	it('renders tab titles on the header row', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['One', 'Two'] });
		t.render();
		const { x: ox, y: oy } = t.getInnerOffset();
		// Expected layout: " One │ Two "
		expect(t.getCell(ox + 1, oy + 0).char).toBe(' ');
		expect(t.getCell(ox + 2, oy + 0).char).toBe('O');
		expect(t.getCell(ox + 3, oy + 0).char).toBe('n');
		expect(t.getCell(ox + 4, oy + 0).char).toBe('e');
	});

	it('renders the vertical separator between tab titles', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['One', 'Two'] });
		t.render();
		const { x: ox, y: oy } = t.getInnerOffset();
		// After " One " (5 chars, cols 1..5) comes the separator at col 6.
		expect(t.getCell(ox + 6, oy + 0).char).toBe('│');
	});

	it('active tab text is bold', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['One', 'Two'], activeIndex: 1 });
		t.render();
		const { x: ox, y: oy } = t.getInnerOffset();
		// "Two" starts at col 8 (" One │ Two "): 1(space) + 5(" One ") + 1(sep) + 1(space before Two)
		expect(t.getCell(ox + 8, oy + 0).attributes.bold).toBe(true);
	});

	it('only tagged children matching active tab are composited', () => {
		const t = new Tabs(new Pos(0, 0), new Size(30, 10), { titles: ['A', 'B'] });
		const wA = new Window(new Pos(2, 2), new Size(3, 1));
		const wB = new Window(new Pos(2, 2), new Size(3, 1));
		wA.setCell(0, 0, 'A');
		wB.setCell(0, 0, 'B');
		t.addChildToTab(0, wA);
		t.addChildToTab(1, wB);

		t.render();
		const { x: ox, y: oy } = t.getInnerOffset();
		expect(t.getCell(ox + 2, oy + 2).char).toBe('A');

		t.setActiveIndex(1);
		t.render();
		expect(t.getCell(ox + 2, oy + 2).char).toBe('B');
	});
});
