import { describe, it, expect } from 'vitest';
import { Radio } from '../../src/Screen/controls/Radio.mjs';
import { Pos } from '../../src/Screen/Pos.mjs';

describe('Radio', () => {
  describe('constructor / state', () => {
    it('auto-sizes width to indicator + label', () => {
      const r = new Radio(new Pos(0, 0), 'Option');
      // indicator = 4, label = 6 → 10
      expect(r.getSize()).toEqual({ width: 10, height: 1 });
    });

    it('defaults to unchecked', () => {
      const r = new Radio(new Pos(0, 0), 'A');
      expect(r.isChecked()).toBe(false);
    });

    it('respects checked: true option', () => {
      const r = new Radio(new Pos(0, 0), 'A', { checked: true });
      expect(r.isChecked()).toBe(true);
    });

    it('setChecked / isChecked round-trip', () => {
      const r = new Radio(new Pos(0, 0), 'A');
      r.setChecked(true);
      expect(r.isChecked()).toBe(true);
    });
  });

  describe('render()', () => {
    it('unselected renders ( ) indicator', () => {
      const r = new Radio(new Pos(0, 0), 'A', { checked: false });
      r.render();
      expect(r.getCell(0, 0).char).toBe('(');
      expect(r.getCell(1, 0).char).toBe(' ');
      expect(r.getCell(2, 0).char).toBe(')');
    });

    it('selected renders (●) indicator', () => {
      const r = new Radio(new Pos(0, 0), 'A', { checked: true });
      r.render();
      expect(r.getCell(1, 0).char).toBe('●');
    });

    it('label appears after indicator', () => {
      const r = new Radio(new Pos(0, 0), 'AB');
      r.render();
      expect(r.getCell(4, 0).char).toBe('A');
      expect(r.getCell(5, 0).char).toBe('B');
    });

    it('selected indicator is blue (foreground 75)', () => {
      const r = new Radio(new Pos(0, 0), 'A', { checked: true });
      r.render();
      expect(r.getCell(1, 0).attributes.foreground).toBe(75);
    });

    it('focused label is bold', () => {
      const r = new Radio(new Pos(0, 0), 'A', { focused: true });
      r.render();
      expect(r.getCell(4, 0).attributes.bold).toBe(true);
    });

    it('disabled control is dim', () => {
      const r = new Radio(new Pos(0, 0), 'A', { disabled: true });
      r.render();
      expect(r.getCell(0, 0).attributes.dim).toBe(true);
    });
  });
});
