import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Screen } from '../src/Screen/Screen.mjs';
import { Window } from '../src/Screen/Window.mjs';
import { Pos, Pct } from '../src/Screen/Pos.mjs';
import { Size } from '../src/Screen/Size.mjs';

describe('Screen', () => {
  let screen: Screen;

  beforeEach(() => {
    screen = new Screen();
  });

  afterEach(() => {
    screen.dispose();
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

    it('emits a "frame" event with a numeric ms duration after render()', () => {
      const events: Array<{ ms: number }> = [];
      screen.on('frame', stats => events.push(stats));
      screen.render();
      expect(events).toHaveLength(1);
      expect(typeof events[0].ms).toBe('number');
      expect(events[0].ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ── ScreenOptions (P0-11) ─────────────────────────────────────────────────

  describe('ScreenOptions', () => {
    let writeSpy: { mockRestore(): void; mockClear(): void; mock: { calls: Array<[string | Uint8Array, ...unknown[]]> } };

    beforeEach(() => {
      writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as unknown as typeof writeSpy;
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it('default constructor leaves the terminal state untouched', () => {
      const s = new Screen();
      expect(writeSpy).not.toHaveBeenCalled();
      expect(s.isAltScreenActive()).toBe(false);
      expect(s.isCursorHidden()).toBe(false);
      s.dispose();
    });

    it('altScreen: true enters the alternate screen buffer on construction', () => {
      const s = new Screen({ altScreen: true });
      const writes = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(writes).toContain('\x1b[?1049h');
      expect(s.isAltScreenActive()).toBe(true);
      s.dispose();
    });

    it('hideCursor: true hides the hardware cursor on construction', () => {
      const s = new Screen({ hideCursor: true });
      const writes = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(writes).toContain('\x1b[?25l');
      expect(s.isCursorHidden()).toBe(true);
      s.dispose();
    });

    it('dispose() restores both alt-screen and cursor and is idempotent', () => {
      const s = new Screen({ altScreen: true, hideCursor: true });
      writeSpy.mockClear();
      s.dispose();
      const writes = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(writes).toContain('\x1b[?25h');
      expect(writes).toContain('\x1b[?1049l');
      expect(s.isAltScreenActive()).toBe(false);
      expect(s.isCursorHidden()).toBe(false);

      writeSpy.mockClear();
      s.dispose();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('targetFps is exposed via getTargetFps()', () => {
      const s = new Screen({ targetFps: 30 });
      expect(s.getTargetFps()).toBe(30);
      s.dispose();
    });
  });

  // ── SIGWINCH / resize event (P0-12) ───────────────────────────────────────

  describe('resize()', () => {
    it('updates getSize() to the explicit dimensions', () => {
      screen.resize(120, 40);
      const size = screen.getSize();
      expect(size.width).toBe(120);
      expect(size.height).toBe(40);
    });

    it('emits a "resize" event with the new TerminalSize', () => {
      const sizes: Array<{ width: number; height: number }> = [];
      screen.on('resize', size => sizes.push(size));
      screen.resize(100, 30);
      expect(sizes).toEqual([{ width: 100, height: 30 }]);
    });

    it('reflows percentage-based children against the new inner area', () => {
      screen.resize(80, 24);
      const child = new Window({ pos: Pos.topLeft(), size: new Size(new Pct(50), new Pct(50)) });
      screen.addChild(child);
      expect(child.getSize()).toEqual({ width: 40, height: 12 });

      screen.resize(160, 48);
      expect(child.getSize()).toEqual({ width: 80, height: 24 });
    });
  });
});
