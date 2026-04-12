import { describe, it, expect, beforeEach } from 'vitest';
import { Region } from '../src/Screen/Region.mjs';
import { StyleRegistry } from '../src/Screen/StyleRegistry.mjs';

describe('Region', () => {
  let region: Region;

  beforeEach(() => {
    region = new Region(20, 10);
  });

  describe('getSize()', () => {
    it('returns the dimensions passed to the constructor', () => {
      const size = region.getSize();
      expect(size.width).toBe(20);
      expect(size.height).toBe(10);
    });

    it('returns a copy – mutating the result does not affect the region', () => {
      const size = region.getSize();
      size.width = 999;
      expect(region.getSize().width).toBe(20);
    });
  });

  describe('getStyleId()', () => {
    it('returns 0 for all cells after initialization', () => {
      expect(region.getStyleId(0, 0)).toBe(0);
      expect(region.getStyleId(19, 9)).toBe(0);
    });

    it('returns a copy-safe value (no reference issues)', () => {
      region.setCell(0, 0, 'A', 5);
      expect(region.getStyleId(0, 0)).toBe(5);
    });

    it('throws RangeError for negative coordinates', () => {
      expect(() => region.getStyleId(-1, 0)).toThrow(RangeError);
      expect(() => region.getStyleId(0, -1)).toThrow(RangeError);
    });

    it('throws RangeError for coordinates outside the region', () => {
      expect(() => region.getStyleId(20, 0)).toThrow(RangeError);
      expect(() => region.getStyleId(0, 10)).toThrow(RangeError);
    });
  });

  describe('setChar()', () => {
    it('stores the character without changing the style ID', () => {
      region.setCell(1, 1, 'A', 7);
      region.setChar(1, 1, 'B');
      expect(region.getChars()[1 * 20 + 1]).toBe('B');
      expect(region.getStyleId(1, 1)).toBe(7);
    });

    it('throws RangeError for out-of-bounds coordinates', () => {
      expect(() => region.setChar(20, 0, 'X')).toThrow(RangeError);
      expect(() => region.setChar(0, 10, 'X')).toThrow(RangeError);
    });
  });

  describe('setCell()', () => {
    it('stores character and style ID', () => {
      const reg = new StyleRegistry();
      const id = reg.register({ italic: true, foreground: '#ff0000' });
      region.setCell(2, 3, 'Z', id);
      expect(region.getChars()[3 * 20 + 2]).toBe('Z');
      expect(region.getStyleId(2, 3)).toBe(id);
      expect(reg.get(id).italic).toBe(true);
      expect(reg.get(id).foreground).toBe('#ff0000');
    });

    it('replaces previous style ID entirely', () => {
      region.setCell(0, 0, 'A', 3);
      region.setCell(0, 0, 'B', 7);
      expect(region.getStyleId(0, 0)).toBe(7);
    });

    it('uses style ID 0 when none provided', () => {
      region.setCell(0, 0, 'X');
      expect(region.getStyleId(0, 0)).toBe(0);
    });
  });

  describe('setStyleId()', () => {
    it('replaces style ID without changing the character', () => {
      region.setCell(0, 0, 'Q', 2);
      region.setStyleId(0, 0, 9);
      expect(region.getChars()[0]).toBe('Q');
      expect(region.getStyleId(0, 0)).toBe(9);
    });

    it('overwrites existing style ID', () => {
      region.setCell(0, 0, 'A', 5);
      region.setStyleId(0, 0, 11);
      expect(region.getStyleId(0, 0)).toBe(11);
    });
  });

  describe('clear()', () => {
    it('resets all cells to blank space with style ID 0', () => {
      region.fill('X', 3);
      region.clear();
      const { width, height } = region.getSize();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          expect(region.getChars()[i]).toBe(' ');
          expect(region.getStyleId(x, y)).toBe(0);
        }
      }
    });
  });

  describe('fill()', () => {
    it('fills every cell with the given character', () => {
      region.fill('#');
      const { width, height } = region.getSize();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          expect(region.getChars()[y * width + x]).toBe('#');
        }
      }
    });

    it('applies provided style ID to every cell', () => {
      region.fill('.', 42);
      const { width, height } = region.getSize();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          expect(region.getStyleId(x, y)).toBe(42);
        }
      }
    });
  });

  describe('getChars() / getStyleIds()', () => {
    it('getChars returns a flat buffer of length width × height', () => {
      expect(region.getChars().length).toBe(20 * 10);
    });

    it('getStyleIds returns a flat buffer of length width × height', () => {
      expect(region.getStyleIds().length).toBe(20 * 10);
    });

    it('getChars reflects changes made via setChar', () => {
      region.setChar(0, 0, 'Z');
      expect(region.getChars()[0]).toBe('Z');
    });

    it('getStyleIds reflects changes made via setCell', () => {
      region.setCell(0, 0, 'A', 13);
      expect(region.getStyleIds()[0]).toBe(13);
    });
  });
});
