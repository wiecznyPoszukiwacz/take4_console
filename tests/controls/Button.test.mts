import { describe, it, expect } from 'vitest';
import { Button } from '../../src/Screen/controls/Button.mjs';
import { Pos } from '../../src/Screen/Pos.mjs';
import { Size } from '../../src/Screen/Size.mjs';

describe('Button', () => {
  describe('constructor / state', () => {
    it('stores the label from options', () => {
      const btn = new Button(new Pos(0, 0), new Size(20, 3), { label: 'OK' });
      expect(btn.getLabel()).toBe('OK');
    });

    it('defaults to empty label', () => {
      const btn = new Button(new Pos(0, 0), new Size(10, 3));
      expect(btn.getLabel()).toBe('');
    });

    it('defaults to not focused', () => {
      const btn = new Button(new Pos(0, 0), new Size(10, 3));
      expect(btn.isFocused()).toBe(false);
    });

    it('defaults to not disabled', () => {
      const btn = new Button(new Pos(0, 0), new Size(10, 3));
      expect(btn.isDisabled()).toBe(false);
    });

    it('setLabel / getLabel round-trip', () => {
      const btn = new Button(new Pos(0, 0), new Size(20, 3));
      btn.setLabel('Save');
      expect(btn.getLabel()).toBe('Save');
    });

    it('setFocused / isFocused round-trip', () => {
      const btn = new Button(new Pos(0, 0), new Size(10, 3));
      btn.setFocused(true);
      expect(btn.isFocused()).toBe(true);
    });

    it('setDisabled / isDisabled round-trip', () => {
      const btn = new Button(new Pos(0, 0), new Size(10, 3));
      btn.setDisabled(true);
      expect(btn.isDisabled()).toBe(true);
    });
  });

  describe('render()', () => {
    it('draws a rounded border', () => {
      const btn = new Button(new Pos(0, 0), new Size(10, 3));
      btn.render();
      expect(btn.getCell(0, 0).char).toBe('╭');
      expect(btn.getCell(9, 0).char).toBe('╮');
      expect(btn.getCell(0, 2).char).toBe('╰');
      expect(btn.getCell(9, 2).char).toBe('╯');
    });

    it('renders the label centred inside the border', () => {
      const btn = new Button(new Pos(0, 0), new Size(12, 3), { label: 'Hi' });
      btn.render();
      // inner width = 10, label len = 2, x = floor((10-2)/2) = 4, y = floor(1/2) = 0 → absolute (5,1)
      expect(btn.getCell(5, 1).char).toBe('H');
      expect(btn.getCell(6, 1).char).toBe('i');
    });

    it('focused label is bold', () => {
      const btn = new Button(new Pos(0, 0), new Size(12, 3), { label: 'X', focused: true });
      btn.render();
      const cell = btn.getCell(5, 1); // centred in 10-wide inner area: floor((10-1)/2)=4, +1 offset → abs 5
      expect(cell.attributes.bold).toBe(true);
    });

    it('disabled label is not bold', () => {
      const btn = new Button(new Pos(0, 0), new Size(12, 3), { label: 'X', disabled: true });
      btn.render();
      const cell = btn.getCell(6, 1);
      expect(cell.attributes.bold).toBeUndefined();
    });

    it('disabled button has dim border', () => {
      const btn = new Button(new Pos(0, 0), new Size(12, 3), { disabled: true });
      btn.render();
      expect(btn.getCell(0, 0).attributes.dim).toBe(true);
    });

    it('non-disabled button does not have dim border', () => {
      const btn = new Button(new Pos(0, 0), new Size(12, 3));
      btn.render();
      expect(btn.getCell(0, 0).attributes.dim).toBeUndefined();
    });
  });
});
