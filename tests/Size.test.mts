import { describe, it, expect } from 'vitest';
import { Size } from '../src/Screen/Size.mjs';
import { pct } from '../src/Screen/Pos.mjs';

describe('Size', () => {
  describe('constructor – absolute', () => {
    it('resolves to the given pixel dimensions', () => {
      expect(new Size(30, 10).resolve(100, 50)).toEqual({ w: 30, h: 10 });
    });

    it('isAbsolute() returns true', () => {
      expect(new Size(30, 10).isAbsolute()).toBe(true);
    });

    it('resolve() ignores parent size for absolute dimensions', () => {
      expect(new Size(30, 10).resolve(0, 0)).toEqual({ w: 30, h: 10 });
    });
  });

  describe('constructor – percentage', () => {
    it('resolves to the correct fraction of parent dimensions', () => {
      // w: floor(100 * 50 / 100) = 50,  h: floor(50 * 100 / 100) = 50
      expect(new Size(pct(50), pct(100)).resolve(100, 50)).toEqual({ w: 50, h: 50 });
    });

    it('isAbsolute() returns false', () => {
      expect(new Size(pct(50), 10).isAbsolute()).toBe(false);
    });

    it('floors fractional results', () => {
      // w: floor(100 * 33 / 100) = 33,  h: floor(50 * 33 / 100) = 16
      expect(new Size(pct(33), pct(33)).resolve(100, 50)).toEqual({ w: 33, h: 16 });
    });
  });

  describe('constructor – mixed', () => {
    it('supports absolute width with percentage height', () => {
      expect(new Size(20, pct(50)).resolve(100, 80)).toEqual({ w: 20, h: 40 });
    });

    it('isAbsolute() returns false for mixed', () => {
      expect(new Size(20, pct(50)).isAbsolute()).toBe(false);
    });
  });

  describe('Size.fill()', () => {
    it('resolves to the full parent dimensions', () => {
      expect(Size.fill().resolve(100, 50)).toEqual({ w: 100, h: 50 });
    });

    it('isAbsolute() returns false', () => {
      expect(Size.fill().isAbsolute()).toBe(false);
    });
  });

  describe('Size.fillWidth(h)', () => {
    it('resolves width to 100% of parent, height from argument', () => {
      expect(Size.fillWidth(10).resolve(100, 50)).toEqual({ w: 100, h: 10 });
    });

    it('accepts percentage height', () => {
      expect(Size.fillWidth(pct(50)).resolve(100, 80)).toEqual({ w: 100, h: 40 });
    });
  });

  describe('Size.fillHeight(w)', () => {
    it('resolves height to 100% of parent, width from argument', () => {
      expect(Size.fillHeight(30).resolve(100, 50)).toEqual({ w: 30, h: 50 });
    });

    it('accepts percentage width', () => {
      expect(Size.fillHeight(pct(25)).resolve(100, 50)).toEqual({ w: 25, h: 50 });
    });
  });
});
