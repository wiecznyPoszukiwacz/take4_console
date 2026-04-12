import { describe, it, expect } from 'vitest';
import { Checkbox } from '../../src/Screen/controls/Checkbox.mjs';
import { Pos } from '../../src/Screen/Pos.mjs';

describe('Checkbox', () => {
  describe('constructor / state', () => {
    it('auto-sizes width to indicator + label', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'Enable' });
      // indicator = 4, label = 6 → 10
      expect(cb.getSize()).toEqual({ width: 10, height: 1 });
    });

    it('defaults to unchecked', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X' });
      expect(cb.isChecked()).toBe(false);
    });

    it('respects checked: true option', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X' }, { checked: true });
      expect(cb.isChecked()).toBe(true);
    });

    it('setChecked / isChecked round-trip', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X' });
      cb.setChecked(true);
      expect(cb.isChecked()).toBe(true);
      cb.setChecked(false);
      expect(cb.isChecked()).toBe(false);
    });

    it('setFocused / isFocused round-trip', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X' });
      cb.setFocused(true);
      expect(cb.isFocused()).toBe(true);
    });

    it('setDisabled / isDisabled round-trip', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X' });
      cb.setDisabled(true);
      expect(cb.isDisabled()).toBe(true);
    });
  });

  describe('render()', () => {
    it('unchecked renders [ ] indicator', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'Go' }, { checked: false });
      cb.render();
      expect(cb.getCell(0, 0).char).toBe('[');
      expect(cb.getCell(1, 0).char).toBe(' ');
      expect(cb.getCell(2, 0).char).toBe(']');
    });

    it('checked renders [✓] indicator', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'Go' }, { checked: true });
      cb.render();
      expect(cb.getCell(1, 0).char).toBe('✓');
    });

    it('label appears after indicator', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'Go' });
      cb.render();
      expect(cb.getCell(4, 0).char).toBe('G');
      expect(cb.getCell(5, 0).char).toBe('o');
    });

    it('checked indicator is green (foreground 76)', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X' }, { checked: true });
      cb.render();
      expect(cb.getCell(1, 0).attributes.foreground).toBe(76);
    });

    it('focused label is bold', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X', focused: true });
      cb.render();
      expect(cb.getCell(4, 0).attributes.bold).toBe(true);
    });

    it('disabled control is dim', () => {
      const cb = new Checkbox({ pos: new Pos(0, 0), label: 'X', disabled: true });
      cb.render();
      expect(cb.getCell(0, 0).attributes.dim).toBe(true);
      expect(cb.getCell(4, 0).attributes.dim).toBe(true);
    });
  });
});
