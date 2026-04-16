import { describe, it, expect } from 'vitest';
import { ListBox } from '../../src/Screen/controls/ListBox.mjs';
import { Screen }  from '../../src/Screen/Screen.mjs';
import { Pos }     from '../../src/Screen/Pos.mjs';
import { Size }    from '../../src/Screen/Size.mjs';
import type { ListBoxRenderContext, ListBoxRowSegments } from '../../src/Screen/types.mjs';

describe('ListBox', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to empty items and -1 selection', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lb.getItems()).toEqual([]);
		expect(lb.getSelectedIndex()).toBe(-1);
		expect(lb.getSelectedItem()).toBeUndefined();
	});

	it('defaults to index 0 when items are provided', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'] });
		expect(lb.getSelectedIndex()).toBe(0);
		expect(lb.getSelectedItem()).toBe('a');
	});

	it('accepts an explicit selectedIndex', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'], selectedIndex: 2 });
		expect(lb.getSelectedIndex()).toBe(2);
		expect(lb.getSelectedItem()).toBe('c');
	});

	it('setItems resets selection to 0 when non-empty', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b'], selectedIndex: 1 });
		lb.setItems(['x', 'y', 'z']);
		expect(lb.getItems()).toEqual(['x', 'y', 'z']);
		expect(lb.getSelectedIndex()).toBe(0);
	});

	it('setItems sets selection to -1 when empty', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a'] });
		lb.setItems([]);
		expect(lb.getSelectedIndex()).toBe(-1);
	});

	it('setSelectedIndex clamps into range', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'] });
		lb.setSelectedIndex(10);
		expect(lb.getSelectedIndex()).toBe(2);
		lb.setSelectedIndex(-5);
		expect(lb.getSelectedIndex()).toBe(0);
	});

	// ── Focus / disabled ────────────────────────────────────────────────────────

	it('setFocused / isFocused round-trip', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lb.isFocused()).toBe(false);
		lb.setFocused(true);
		expect(lb.isFocused()).toBe(true);
	});

	it('setDisabled / isDisabled round-trip', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(lb.isDisabled()).toBe(false);
		lb.setDisabled(true);
		expect(lb.isDisabled()).toBe(true);
	});

	// ── handleKey ───────────────────────────────────────────────────────────────

	it('down arrow advances selection', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'] });
		lb.handleKey('\x1b[B');
		expect(lb.getSelectedIndex()).toBe(1);
	});

	it('up arrow moves selection back', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'], selectedIndex: 2 });
		lb.handleKey('\x1b[A');
		expect(lb.getSelectedIndex()).toBe(1);
	});

	it('arrow keys clamp to valid range', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b'] });
		lb.handleKey('\x1b[A'); // already at 0
		expect(lb.getSelectedIndex()).toBe(0);
		lb.handleKey('\x1b[B');
		lb.handleKey('\x1b[B'); // past end
		expect(lb.getSelectedIndex()).toBe(1);
	});

	it('Home jumps to first item', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'], selectedIndex: 2 });
		lb.handleKey('\x1b[H');
		expect(lb.getSelectedIndex()).toBe(0);
	});

	it('End jumps to last item', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['a', 'b', 'c'] });
		lb.handleKey('\x1b[F');
		expect(lb.getSelectedIndex()).toBe(2);
	});

	it('PageDown advances by visible height', () => {
		const items = Array.from({ length: 20 }, (_, i) => `item${i}`);
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items }); // height 8, border → 6 visible
		lb.handleKey('\x1b[6~');
		expect(lb.getSelectedIndex()).toBe(6);
	});

	it('onChange fires when selection changes', () => {
		let received: [number, string] | null = null;
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, {
			items: ['a', 'b', 'c'],
			onChange: (i, s) => { received = [i, s]; },
		});
		lb.handleKey('\x1b[B');
		expect(received).toEqual([1, 'b']);
	});

	it('onChange does not fire when selection does not change', () => {
		let calls = 0;
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, {
			items: ['a', 'b'],
			onChange: () => { calls++; },
		});
		lb.handleKey('\x1b[A'); // already at 0
		expect(calls).toBe(0);
	});

	it('disabled ListBox ignores keys', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8), disabled: true }, { items: ['a', 'b', 'c'] });
		lb.handleKey('\x1b[B');
		expect(lb.getSelectedIndex()).toBe(0);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('does not crash with empty items', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) });
		expect(() => lb.render()).not.toThrow();
	});

	it('renders visible item text inside the inner area', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items: ['hello', 'world'] });
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('h');
		expect(lb.getCell(ox + 4, oy + 0).char).toBe('o');
		expect(lb.getCell(ox + 0, oy + 1).char).toBe('w');
	});

	it('truncates long items to inner width', () => {
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(6, 4) }, { items: ['abcdefghij'] });
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		const { width } = lb.getInnerSize();
		// Last visible column must be within the truncated prefix.
		expect(lb.getCell(ox + width - 1, oy + 0).char).toBe('abcdefghij'[width - 1]);
	});

	it('scrolls to keep selection visible after PageDown', () => {
		const items = Array.from({ length: 20 }, (_, i) => `i${i}`);
		const lb = new ListBox({ pos: new Pos(0, 0), size: new Size(20, 8) }, { items });
		lb.handleKey('\x1b[6~');
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		// After PgDn to index 6 with 6 visible rows, scrollTop = 1 so top row is i1.
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('i');
		expect(lb.getCell(ox + 1, oy + 0).char).toBe('1');
	});

	// ── Generic / custom rendering (P0-1) ──────────────────────────────────────

	it('is generic over item type T', () => {
		interface Row { id: number; label: string }
		const rows: Row[] = [{ id: 1, label: 'one' }, { id: 2, label: 'two' }];
		const lb = new ListBox<Row>({ pos: new Pos(0, 0), size: new Size(20, 8) }, {
			items: rows,
			renderItem: (r) => r.label,
		});
		const sel: Row | undefined = lb.getSelectedItem();
		expect(sel?.id).toBe(1);
	});

	it('onChange receives the generic item type', () => {
		interface Row { id: number }
		let received: Row | null = null;
		const lb = new ListBox<Row>({ pos: new Pos(0, 0), size: new Size(20, 8) }, {
			items: [{ id: 10 }, { id: 20 }, { id: 30 }],
			onChange: (_i, row) => { received = row; },
			renderItem: (r) => `#${r.id}`,
		});
		lb.handleKey('\x1b[B');
		expect(received).toEqual({ id: 20 });
	});

	it('renderItem returning a plain string is left-aligned', () => {
		// Screen must be instantiated so BUILTIN_* styles exist in the global registry.
		new Screen();
		const lb = new ListBox<{ label: string }>({ pos: new Pos(0, 0), size: new Size(20, 8) }, {
			items: [{ label: 'hello' }],
			renderItem: (r) => r.label,
		});
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('h');
		expect(lb.getCell(ox + 4, oy + 0).char).toBe('o');
	});

	it('renderItem with right-aligned segment flushes to the right edge', () => {
		new Screen();
		const lb = new ListBox<number>({ pos: new Pos(0, 0), size: new Size(20, 4) }, {
			items: [1],
			renderItem: (n): ListBoxRowSegments => [
				{ text: 'L', align: 'left' },
				{ text: `R${n}`, align: 'right' },
			],
		});
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		const { width } = lb.getInnerSize();
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('L');
		expect(lb.getCell(ox + width - 2, oy + 0).char).toBe('R');
		expect(lb.getCell(ox + width - 1, oy + 0).char).toBe('1');
	});

	it('fill segment occupies the gap between left and right', () => {
		new Screen();
		const lb = new ListBox<string>({ pos: new Pos(0, 0), size: new Size(12, 4) }, {
			items: ['x'],
			renderItem: (): ListBoxRowSegments => [
				{ text: 'L', align: 'left' },
				{ text: '-', align: 'fill' },
				{ text: 'R', align: 'right' },
			],
		});
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		const { width } = lb.getInnerSize();
		expect(lb.getCell(ox + 0,           oy + 0).char).toBe('L');
		// Fill segment is truncated/padded to width-2; first fill cell holds the literal '-'.
		expect(lb.getCell(ox + 1,           oy + 0).char).toBe('-');
		expect(lb.getCell(ox + width - 1,   oy + 0).char).toBe('R');
	});

	it('renderItem receives ctx with focused/selected/width/index', () => {
		new Screen();
		const ctxSeen: ListBoxRenderContext[] = [];
		const lb = new ListBox<string>({ pos: new Pos(0, 0), size: new Size(10, 4) }, {
			items: ['a', 'b'],
			renderItem: (item, ctx) => { ctxSeen.push({ ...ctx }); return item; },
		});
		lb.setFocused(true);
		lb.render();
		expect(ctxSeen.length).toBe(2);
		expect(ctxSeen[0].index).toBe(0);
		expect(ctxSeen[0].selected).toBe(true);
		expect(ctxSeen[0].focused).toBe(true);
		expect(ctxSeen[1].selected).toBe(false);
		// Width matches inner width (10 - 2 borders = 8)
		expect(ctxSeen[0].width).toBe(lb.getInnerSize().width);
	});

	it('rowHeight reserves N rows per item slot', () => {
		new Screen();
		const lb = new ListBox<string>({ pos: new Pos(0, 0), size: new Size(10, 8) }, {
			items: ['a', 'b'],
			rowHeight: 2,
			renderItem: (s) => s,
		});
		lb.render();
		expect(lb.getRowHeight()).toBe(2);
		const { x: ox, y: oy } = lb.getInnerOffset();
		// Item 'a' renders at inner row 0; item 'b' renders at inner row 2 (rowHeight=2).
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('a');
		expect(lb.getCell(ox + 0, oy + 2).char).toBe('b');
		// Row between the two items is blank (part of the first slot).
		expect(lb.getCell(ox + 0, oy + 1).char).toBe(' ');
	});

	it('PageDown uses rowHeight-aware visible count', () => {
		new Screen();
		const items = Array.from({ length: 30 }, (_, i) => `i${i}`);
		// Inner height = 6 after border; with rowHeight=2 that's 3 visible slots.
		const lb = new ListBox<string>({ pos: new Pos(0, 0), size: new Size(10, 8) }, { items, rowHeight: 2 });
		lb.handleKey('\x1b[6~');
		expect(lb.getSelectedIndex()).toBe(3);
	});

	it('keyFn exposes a stable key via getItemKey()', () => {
		interface Row { id: number }
		const lb = new ListBox<Row>({ pos: new Pos(0, 0), size: new Size(10, 4) }, {
			items: [{ id: 7 }],
			keyFn: (r) => `row-${r.id}`,
		});
		expect(lb.getItemKey({ id: 7 })).toBe('row-7');
	});

	it('setRenderItem installs a renderer after construction', () => {
		new Screen();
		const lb = new ListBox<string>({ pos: new Pos(0, 0), size: new Size(10, 4) }, { items: ['abc'] });
		lb.setRenderItem(() => 'XYZ');
		lb.render();
		const { x: ox, y: oy } = lb.getInnerOffset();
		expect(lb.getCell(ox + 0, oy + 0).char).toBe('X');
		expect(lb.getCell(ox + 2, oy + 0).char).toBe('Z');
	});
});
