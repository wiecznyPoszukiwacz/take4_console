import { describe, it, expect } from 'vitest';
import { TextBox } from '../../src/Screen/controls/TextBox.mjs';
import { Pos } from '../../src/Screen/Pos.mjs';
import { Size } from '../../src/Screen/Size.mjs';

/** Helper: create a 12×3 TextBox (inner width = 10). */
function make(opts?: ConstructorParameters<typeof TextBox>[2]): TextBox {
  return new TextBox(new Pos(0, 0), new Size(12, 3), opts);
}

describe('TextBox', () => {
  describe('constructor / state', () => {
    it('defaults to empty value', () => {
      expect(make().getValue()).toBe('');
    });

    it('stores initial value and positions cursor at end', () => {
      const tb = make({ value: 'hello' });
      expect(tb.getValue()).toBe('hello');
      expect(tb.getCursor()).toBe(5);
    });

    it('respects explicit cursor option', () => {
      const tb = make({ value: 'hello', cursor: 2 });
      expect(tb.getCursor()).toBe(2);
    });

    it('setValue / getValue round-trip', () => {
      const tb = make();
      tb.setValue('world');
      expect(tb.getValue()).toBe('world');
    });

    it('setCursor / getCursor round-trip', () => {
      const tb = make({ value: 'abc' });
      tb.setCursor(1);
      expect(tb.getCursor()).toBe(1);
    });

    it('setCursor clamps to value length', () => {
      const tb = make({ value: 'ab' });
      tb.setCursor(100);
      expect(tb.getCursor()).toBe(2);
    });
  });

  describe('handleKey()', () => {
    it('printable char inserts at cursor', () => {
      const tb = make({ value: 'ac', cursor: 1 });
      tb.handleKey('b');
      expect(tb.getValue()).toBe('abc');
      expect(tb.getCursor()).toBe(2);
    });

    it('backspace deletes char before cursor', () => {
      const tb = make({ value: 'abc', cursor: 2 });
      tb.handleKey('backspace');
      expect(tb.getValue()).toBe('ac');
      expect(tb.getCursor()).toBe(1);
    });

    it('backspace at position 0 does nothing', () => {
      const tb = make({ value: 'x', cursor: 0 });
      tb.handleKey('backspace');
      expect(tb.getValue()).toBe('x');
    });

    it('delete removes char at cursor', () => {
      const tb = make({ value: 'abc', cursor: 1 });
      tb.handleKey('delete');
      expect(tb.getValue()).toBe('ac');
      expect(tb.getCursor()).toBe(1);
    });

    it('left moves cursor left', () => {
      const tb = make({ value: 'abc', cursor: 2 });
      tb.handleKey('left');
      expect(tb.getCursor()).toBe(1);
    });

    it('right moves cursor right', () => {
      const tb = make({ value: 'abc', cursor: 1 });
      tb.handleKey('right');
      expect(tb.getCursor()).toBe(2);
    });

    it('home moves cursor to 0', () => {
      const tb = make({ value: 'abc', cursor: 3 });
      tb.handleKey('home');
      expect(tb.getCursor()).toBe(0);
    });

    it('end moves cursor to end', () => {
      const tb = make({ value: 'abc', cursor: 0 });
      tb.handleKey('end');
      expect(tb.getCursor()).toBe(3);
    });

    it('disabled TextBox ignores key input', () => {
      const tb = make({ value: 'x', disabled: true });
      tb.handleKey('a');
      expect(tb.getValue()).toBe('x');
    });

    it('accepts ANSI escape sequences for backspace', () => {
      const tb = make({ value: 'ab', cursor: 2 });
      tb.handleKey('\x7f');
      expect(tb.getValue()).toBe('a');
    });
  });

  describe('render()', () => {
    it('draws a single-line border', () => {
      const tb = make();
      tb.render();
      expect(tb.getCell(0, 0).char).toBe('┌');
      expect(tb.getCell(11, 0).char).toBe('┐');
    });

    it('text appears inside the border on row 1', () => {
      const tb = make({ value: 'Hi' });
      tb.render();
      expect(tb.getCell(1, 1).char).toBe('H');
      expect(tb.getCell(2, 1).char).toBe('i');
    });

    it('placeholder shown when unfocused and value is empty', () => {
      const tb = make({ placeholder: 'Type...' });
      tb.render();
      expect(tb.getCell(1, 1).char).toBe('T');
    });

    it('placeholder hidden when focused', () => {
      const tb = make({ placeholder: 'Type...', focused: true });
      tb.render();
      expect(tb.getCell(1, 1).char).toBe(' ');
    });

    it('cursor cell has inverse attribute when focused', () => {
      const tb = make({ value: 'abc', cursor: 0, focused: true });
      tb.render();
      // cursor at inner (0,0) → absolute (1,1)
      expect(tb.getCell(1, 1).attributes.inverse).toBe(true);
    });

    it('no cursor when not focused', () => {
      const tb = make({ value: 'abc', cursor: 0, focused: false });
      tb.render();
      expect(tb.getCell(1, 1).attributes.inverse).toBeUndefined();
    });

    it('scrolls so cursor stays visible', () => {
      // inner width = 10; type 12 chars
      const tb = new TextBox(new Pos(0, 0), new Size(12, 3), { focused: true });
      'ABCDEFGHIJKL'.split('').forEach(k => tb.handleKey(k));
      // cursor is at 12, scroll should show last 10 chars
      tb.render();
      // cursor=12, width=10 → scrollOffset=3 → first visible char is 'D' (index 3)
      expect(tb.getCell(1, 1).char).toBe('D');
      expect(tb.getCell(9, 1).char).toBe('L');
    });
  });
});
