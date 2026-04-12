import { describe, it, expect } from 'vitest';
import { ListBox } from '../../src/Screen/controls/ListBox.mjs';
import { Pos }     from '../../src/Screen/Pos.mjs';
import { Size }    from '../../src/Screen/Size.mjs';

describe('ListBox', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to empty items and -1 selection', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8));
		expect(lb.getItems()).toEqual([]);
		expect(lb.getSelectedIndex()).toBe(-1);
		expect(lb.getSelectedItem()).toBeUndefined();
	});

	it('defaults to index 0 when items are provided', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'] });
		expect(lb.getSelectedIndex()).toBe(0);
		expect(lb.getSelectedItem()).toBe('a');
	});

	it('accepts an explicit selectedIndex', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'], selectedIndex: 2 });
		expect(lb.getSelectedIndex()).toBe(2);
		expect(lb.getSelectedItem()).toBe('c');
	});

	it('setItems resets selection to 0 when non-empty', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b'], selectedIndex: 1 });
		lb.setItems(['x', 'y', 'z']);
		expect(lb.getItems()).toEqual(['x', 'y', 'z']);
		expect(lb.getSelectedIndex()).toBe(0);
	});

	it('setItems sets selection to -1 when empty', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a'] });
		lb.setItems([]);
		expect(lb.getSelectedIndex()).toBe(-1);
	});

	it('setSelectedIndex clamps into range', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'] });
		lb.setSelectedIndex(10);
		expect(lb.getSelectedIndex()).toBe(2);
		lb.setSelectedIndex(-5);
		expect(lb.getSelectedIndex()).toBe(0);
	});

	// ── Focus / disabled ────────────────────────────────────────────────────────

	it('setFocused / isFocused round-trip', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8));
		expect(lb.isFocused()).toBe(false);
		lb.setFocused(true);
		expect(lb.isFocused()).toBe(true);
	});

	it('setDisabled / isDisabled round-trip', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8));
		expect(lb.isDisabled()).toBe(false);
		lb.setDisabled(true);
		expect(lb.isDisabled()).toBe(true);
	});

	// ── handleKey ───────────────────────────────────────────────────────────────

	it('down arrow advances selection', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'] });
		lb.handleKey('\x1b[B');
		expect(lb.getSelectedIndex()).toBe(1);
	});

	it('up arrow moves selection back', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'], selectedIndex: 2 });
		lb.handleKey('\x1b[A');
		expect(lb.getSelectedIndex()).toBe(1);
	});

	it('arrow keys clamp to valid range', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b'] });
		lb.handleKey('\x1b[A'); // already at 0
		expect(lb.getSelectedIndex()).toBe(0);
		lb.handleKey('\x1b[B');
		lb.handleKey('\x1b[B'); // past end
		expect(lb.getSelectedIndex()).toBe(1);
	});

	it('Home jumps to first item', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'], selectedIndex: 2 });
		lb.handleKey('\x1b[H');
		expect(lb.getSelectedIndex()).toBe(0);
	});

	it('End jumps to last item', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'] });
		lb.handleKey('\x1b[F');
		expect(lb.getSelectedIndex()).toBe(2);
	});

	it('PageDown advances by visible height', () => {
		const items = Array.from({ length: 20 }, (_, i) => `item${i}`);
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items }); // height 8, border → 6 visible
		lb.handleKey('\x1b[6~');
		expect(lb.getSelectedIndex()).toBe(6);
	});

	it('onChange fires when selection changes', () => {
		let received: [number, string] | null = null;
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), {
			items: ['a', 'b', 'c'],
			onChange: (i, s) => { received = [i, s]; },
		});
		lb.handleKey('\x1b[B');
		expect(received).toEqual([1, 'b']);
	});

	it('onChange does not fire when selection does not change', () => {
		let calls = 0;
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), {
			items: ['a', 'b'],
			onChange: () => { calls++; },
		});
		lb.handleKey('\x1b[A'); // already at 0
		expect(calls).toBe(0);
	});

	it('disabled ListBox ignores keys', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['a', 'b', 'c'], disabled: true });
		lb.handleKey('\x1b[B');
		expect(lb.getSelectedIndex()).toBe(0);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('does not crash with empty items', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8));
		expect(() => lb.render()).not.toThrow();
	});

	it('renders visible item text inside the inner area', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items: ['hello', 'world'] });
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('h');
		expect(lb.getCell(ox + 4, oy + 0).char).toBe('o');
		expect(lb.getCell(ox + 0, oy + 1).char).toBe('w');
	});

	it('truncates long items to inner width', () => {
		const lb = new ListBox(new Pos(0, 0), new Size(6, 4), { items: ['abcdefghij'] });
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		const { width } = lb.getInnerSize();
		// Last visible column must be within the truncated prefix.
		expect(lb.getCell(ox + width - 1, oy + 0).char).toBe('abcdefghij'[width - 1]);
	});

	it('scrolls to keep selection visible after PageDown', () => {
		const items = Array.from({ length: 20 }, (_, i) => `i${i}`);
		const lb = new ListBox(new Pos(0, 0), new Size(20, 8), { items });
		lb.handleKey('\x1b[6~');
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		// After PgDn to index 6 with 6 visible rows, scrollTop = 1 so top row is i1.
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('i');
		expect(lb.getCell(ox + 1, oy + 0).char).toBe('1');
	});
});
