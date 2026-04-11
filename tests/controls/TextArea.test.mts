import { describe, it, expect } from 'vitest';
import { TextArea } from '../../src/Screen/controls/TextArea.mjs';
import { Pos } from '../../src/Screen/Pos.mjs';
import { Size } from '../../src/Screen/Size.mjs';

/** Helper: create a 12×6 TextArea (inner 10×4). */
function make(opts?: ConstructorParameters<typeof TextArea>[2]): TextArea {
  return new TextArea(new Pos(0, 0), new Size(12, 6), opts);
}

describe('TextArea', () => {
  describe('constructor / state', () => {
    it('defaults to empty value', () => {
      expect(make().getValue()).toBe('');
    });

    it('stores initial multi-line value', () => {
      const ta = make({ value: 'A\nB\nC' });
      expect(ta.getValue()).toBe('A\nB\nC');
    });

    it('setCursor / getCursor round-trip', () => {
      const ta = make({ value: 'AB\nCD' });
      ta.setCursor({ x: 1, y: 1 });
      expect(ta.getCursor()).toEqual({ x: 1, y: 1 });
    });

    it('getCursor returns a copy (not a live reference)', () => {
      const ta = make({ value: 'AB' });
      const c = ta.getCursor();
      c.x = 99;
      expect(ta.getCursor().x).toBe(0);
    });

    it('setCursor clamps x to line length', () => {
      const ta = make({ value: 'AB\nCD' });
      ta.setCursor({ x: 100, y: 0 });
      expect(ta.getCursor().x).toBe(2);
    });

    it('setCursor clamps y to last line', () => {
      const ta = make({ value: 'AB\nCD' });
      ta.setCursor({ x: 0, y: 99 });
      expect(ta.getCursor().y).toBe(1);
    });
  });

  describe('handleKey()', () => {
    it('inserts printable char at cursor', () => {
      const ta = make({ value: 'AC', cursor: { x: 1, y: 0 } });
      ta.handleKey('B');
      expect(ta.getValue()).toBe('ABC');
      expect(ta.getCursor()).toEqual({ x: 2, y: 0 });
    });

    it('enter splits the line', () => {
      const ta = make({ value: 'AB', cursor: { x: 1, y: 0 } });
      ta.handleKey('enter');
      expect(ta.getValue()).toBe('A\nB');
      expect(ta.getCursor()).toEqual({ x: 0, y: 1 });
    });

    it('backspace merges lines when cursor is at line start', () => {
      const ta = make({ value: 'A\nB', cursor: { x: 0, y: 1 } });
      ta.handleKey('backspace');
      expect(ta.getValue()).toBe('AB');
      expect(ta.getCursor()).toEqual({ x: 1, y: 0 });
    });

    it('backspace deletes char within line', () => {
      const ta = make({ value: 'ABC', cursor: { x: 2, y: 0 } });
      ta.handleKey('backspace');
      expect(ta.getValue()).toBe('AC');
    });

    it('delete at end of line merges next line', () => {
      const ta = make({ value: 'A\nB', cursor: { x: 1, y: 0 } });
      ta.handleKey('delete');
      expect(ta.getValue()).toBe('AB');
    });

    it('arrow up moves cursor up', () => {
      const ta = make({ value: 'A\nB', cursor: { x: 0, y: 1 } });
      ta.handleKey('up');
      expect(ta.getCursor().y).toBe(0);
    });

    it('arrow down moves cursor down', () => {
      const ta = make({ value: 'A\nB', cursor: { x: 0, y: 0 } });
      ta.handleKey('down');
      expect(ta.getCursor().y).toBe(1);
    });

    it('left at line start wraps to previous line end', () => {
      const ta = make({ value: 'AB\nCD', cursor: { x: 0, y: 1 } });
      ta.handleKey('left');
      expect(ta.getCursor()).toEqual({ x: 2, y: 0 });
    });

    it('right at line end wraps to next line start', () => {
      const ta = make({ value: 'AB\nCD', cursor: { x: 2, y: 0 } });
      ta.handleKey('right');
      expect(ta.getCursor()).toEqual({ x: 0, y: 1 });
    });

    it('home moves to start of line', () => {
      const ta = make({ value: 'ABC', cursor: { x: 3, y: 0 } });
      ta.handleKey('home');
      expect(ta.getCursor().x).toBe(0);
    });

    it('end moves to end of current line', () => {
      const ta = make({ value: 'ABC', cursor: { x: 0, y: 0 } });
      ta.handleKey('end');
      expect(ta.getCursor().x).toBe(3);
    });

    it('disabled TextArea ignores key input', () => {
      const ta = make({ value: 'x', disabled: true });
      ta.handleKey('a');
      expect(ta.getValue()).toBe('x');
    });
  });

  describe('render()', () => {
    it('draws a single-line border', () => {
      const ta = make();
      ta.render();
      expect(ta.getCell(0, 0).char).toBe('┌');
      expect(ta.getCell(11, 5).char).toBe('┘');
    });

    it('text lines appear inside the border', () => {
      const ta = make({ value: 'Hi\nBye' });
      ta.render();
      expect(ta.getCell(1, 1).char).toBe('H');
      expect(ta.getCell(1, 2).char).toBe('B');
    });

    it('placeholder shown when unfocused and value is empty', () => {
      const ta = make({ placeholder: 'Enter text...' });
      ta.render();
      expect(ta.getCell(1, 1).char).toBe('E');
    });

    it('placeholder hidden when focused', () => {
      const ta = make({ placeholder: 'Enter text...', focused: true });
      ta.render();
      expect(ta.getCell(1, 1).char).toBe(' ');
    });

    it('cursor cell has inverse attribute when focused', () => {
      const ta = make({ value: 'Hi', cursor: { x: 0, y: 0 }, focused: true });
      ta.render();
      // cursor inner (0,0) → absolute (1,1)
      expect(ta.getCell(1, 1).attributes.inverse).toBe(true);
    });

    it('scrolls vertically to keep cursor visible', () => {
      // inner height = 4; create 6 lines, move cursor to last
      const ta = make({ value: 'L1\nL2\nL3\nL4\nL5\nL6', focused: true });
      ta.setCursor({ x: 0, y: 5 });
      ta.render();
      // lines 3–6 (0-indexed 2–5) should be visible
      expect(ta.getCell(1, 1).char).toBe('L');
      // first visible line should be L3 (scrollY = 2)
      const firstLineSecondChar = ta.getCell(2, 1).char;
      expect(firstLineSecondChar).toBe('3');
    });
  });
});
