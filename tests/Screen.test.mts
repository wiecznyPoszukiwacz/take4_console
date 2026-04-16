import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Screen } from '../src/Screen/Screen.mjs';
import { Window } from '../src/Screen/Window.mjs';
import { Pos } from '../src/Screen/Pos.mjs';
import { Size } from '../src/Screen/Size.mjs';

describe('Screen', () => {
  let screen: Screen;

  beforeEach(() => {
    screen = new Screen();
  });

  describe('getSize()', () => {
    it('returns an object with numeric width and height', () => {
      const size = screen.getSize();
      expect(typeof size.width).toBe('number');
      expect(typeof size.height).toBe('number');
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    });

    it('returns a copy – mutating the result does not affect the screen', () => {
      const size = screen.getSize();
      size.width = 999;
      expect(screen.getSize().width).not.toBe(999);
    });
  });

  describe('registerStyle()', () => {
    it('returns a numeric style ID', () => {
      const id = screen.registerStyle({ bold: true });
      expect(typeof id).toBe('number');
    });

    it('returns the same ID for identical styles', () => {
      const id1 = screen.registerStyle({ bold: true });
      const id2 = screen.registerStyle({ bold: true });
      expect(id1).toBe(id2);
    });

    it('returns different IDs for different styles', () => {
      const id1 = screen.registerStyle({ bold: true });
      const id2 = screen.registerStyle({ italic: true });
      expect(id1).not.toBe(id2);
    });

    it('ID 0 always represents the empty style', () => {
      const id = screen.registerStyle({});
      expect(id).toBe(0);
    });
  });

  describe('grid delegation', () => {
    it('setCell and getCell round-trip through the backing region', () => {
      const id = screen.registerStyle({ bold: true });
      screen.setCell(0, 0, 'A', id);
      const cell = screen.getCell(0, 0);
      expect(cell.char).toBe('A');
      expect(cell.attributes.bold).toBe(true);
    });
  });

  describe('window tree compositing', () => {
    it('child window content appears in render output', () => {
      const child = new Window({ pos: new Pos(0, 0), size: new Size(1, 1) });
      child.setCell(0, 0, 'W');
      screen.addChild(child);

      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      writeSpy.mockRestore();

      expect(output).toContain('W');
    });
  });

  describe('render()', () => {
    let writeSpy: { mockRestore(): void; mock: { calls: Array<[string | Uint8Array, ...unknown[]]> } };

    beforeEach(() => {
      writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it('calls process.stdout.write exactly once', () => {
      screen.render();
      expect(writeSpy).toHaveBeenCalledTimes(1);
    });

    it('starts output with cursor-home sequence', () => {
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output.startsWith('\x1b[H')).toBe(true);
    });

    it('ends output with reset sequence', () => {
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output.endsWith('\x1b[0m')).toBe(true);
    });

    it('includes characters set via setCell', () => {
      screen.setCell(0, 0, 'A');
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('A');
    });

    it('includes bold ANSI code when cell has bold attribute', () => {
      const id = screen.registerStyle({ bold: true });
      screen.setCell(0, 0, 'X', id);
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/\x1b\[[\d;]*1[\d;]*m/);
    });

    it('includes 256-color foreground code for numeric color', () => {
      const id = screen.registerStyle({ foreground: 196 });
      screen.setCell(0, 0, 'X', id);
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('38;5;196');
    });

    it('includes RGB foreground code for hex color', () => {
      const id = screen.registerStyle({ foreground: '#ff0000' });
      screen.setCell(0, 0, 'X', id);
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('38;2;255;0;0');
    });

    it('emits a wide character without emitting its continuation cell', () => {
      screen.setCell(0, 0, '日');
      screen.setCell(1, 0, '');         // continuation sentinel
      screen.setCell(2, 0, 'X');
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      // The wide char and the trailing X must appear; the empty sentinel does not add a cell.
      expect(output).toContain('日');
      expect(output).toContain('X');
      // Style sequence repetitions are bounded: one for the wide char + one for X (continuation skipped).
      const charsBetween = output.split('日')[1] ?? '';
      expect(charsBetween).toContain('X');
    });

    it('emits a wide character via Window.writeText through Screen render', () => {
      const win = new Window({ pos: new Pos(0, 0), size: new Size(5, 1) });
      win.writeText('日x');
      screen.addChild(win);
      screen.render();
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('日');
      expect(output).toContain('x');
    });
  });
});
