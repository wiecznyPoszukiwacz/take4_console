import { describe, it, expect } from 'vitest';
import { Pos, Pct, pct } from '../src/Screen/Pos.mjs';

describe('Pct / pct()', () => {
  it('pct() returns a Pct instance with the given value', () => {
    const p = pct(50);
    expect(p).toBeInstanceOf(Pct);
    expect(p.value).toBe(50);
  });
});

describe('Pos', () => {
  describe('constructor – absolute (positive)', () => {
    it('resolves to the given coordinates', () => {
      expect(new Pos(5, 3).resolve(100, 50, 10, 4)).toEqual({ x: 5, y: 3 });
    });

    it('isAbsolute() returns true', () => {
      expect(new Pos(5, 3).isAbsolute()).toBe(true);
    });

    it('resolveAbsolute() returns the same values', () => {
      expect(new Pos(5, 3).resolveAbsolute()).toEqual({ x: 5, y: 3 });
    });
  });

  describe('constructor – from-end (negative)', () => {
    it('resolves right/bottom edge at the given distance from parent edge', () => {
      // x: 100 - 10 - 5 = 85,  y: 50 - 4 - 3 = 43
      expect(new Pos(-5, -3).resolve(100, 50, 10, 4)).toEqual({ x: 85, y: 43 });
    });

    it('isAbsolute() returns false', () => {
      expect(new Pos(-1, 0).isAbsolute()).toBe(false);
    });

    it('zero distance means flush to the edge', () => {
      // Pos(-0, -0) is same as Pos(0, 0) — negative zero check
      const p = Pos.bottomRight();
      // x: 100 - 10 - 0 = 90,  y: 50 - 4 - 0 = 46
      expect(p.resolve(100, 50, 10, 4)).toEqual({ x: 90, y: 46 });
    });
  });

  describe('constructor – percentage', () => {
    it('resolves to the percentage of parent size', () => {
      // x: floor(100 * 50 / 100) = 50,  y: floor(50 * 25 / 100) = 12
      expect(new Pos(pct(50), pct(25)).resolve(100, 50, 0, 0)).toEqual({ x: 50, y: 12 });
    });

    it('isAbsolute() returns false', () => {
      expect(new Pos(pct(50), 0).isAbsolute()).toBe(false);
    });
  });

  describe('Pos.topLeft()', () => {
    it('resolves to (0, 0)', () => {
      expect(Pos.topLeft().resolve(100, 50, 10, 4)).toEqual({ x: 0, y: 0 });
    });

    it('isAbsolute() returns true', () => {
      expect(Pos.topLeft().isAbsolute()).toBe(true);
    });
  });

  describe('Pos.topRight()', () => {
    it('aligns the right edge with the parent right, top edge at 0', () => {
      // x: 100 - 10 - 0 = 90,  y: 0
      expect(Pos.topRight().resolve(100, 50, 10, 4)).toEqual({ x: 90, y: 0 });
    });
  });

  describe('Pos.bottomLeft()', () => {
    it('aligns the bottom edge with the parent bottom, left edge at 0', () => {
      // x: 0,  y: 50 - 4 - 0 = 46
      expect(Pos.bottomLeft().resolve(100, 50, 10, 4)).toEqual({ x: 0, y: 46 });
    });
  });

  describe('Pos.bottomRight()', () => {
    it('aligns both edges with parent edges', () => {
      // x: 90,  y: 46
      expect(Pos.bottomRight().resolve(100, 50, 10, 4)).toEqual({ x: 90, y: 46 });
    });
  });

  describe('Pos.center()', () => {
    it('centers the window within the parent', () => {
      // x: floor((100 - 10) / 2) = 45,  y: floor((50 - 4) / 2) = 23
      expect(Pos.center().resolve(100, 50, 10, 4)).toEqual({ x: 45, y: 23 });
    });

    it('isAbsolute() returns false', () => {
      expect(Pos.center().isAbsolute()).toBe(false);
    });
  });

  describe('Pos.left(y)', () => {
    it('left edge at x=0, y from given value', () => {
      expect(Pos.left(5).resolve(100, 50, 10, 4)).toEqual({ x: 0, y: 5 });
    });

    it('defaults to y=0', () => {
      expect(Pos.left().resolve(100, 50, 10, 4)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('Pos.right(y)', () => {
    it('right edge flush, y from given value', () => {
      // x: 90,  y: 5
      expect(Pos.right(5).resolve(100, 50, 10, 4)).toEqual({ x: 90, y: 5 });
    });

    it('defaults to y=0', () => {
      expect(Pos.right().resolve(100, 50, 10, 4)).toEqual({ x: 90, y: 0 });
    });
  });

  describe('Pos.top(x)', () => {
    it('top edge at y=0, x from given value', () => {
      expect(Pos.top(7).resolve(100, 50, 10, 4)).toEqual({ x: 7, y: 0 });
    });
  });

  describe('Pos.bottom(x)', () => {
    it('bottom edge flush, x from given value', () => {
      // x: 7,  y: 50 - 4 - 0 = 46
      expect(Pos.bottom(7).resolve(100, 50, 10, 4)).toEqual({ x: 7, y: 46 });
    });
  });

  describe('Pos.flex(order)', () => {
    it('resolve() falls back to (0, 0) because layout engine overwrites child.x/y', () => {
      expect(Pos.flex(3).resolve(100, 50, 10, 4)).toEqual({ x: 0, y: 0 });
    });

    it('isAbsolute() returns false so addChild does not short-circuit', () => {
      expect(Pos.flex().isAbsolute()).toBe(false);
    });

    it('getFlexOrder() returns the provided order', () => {
      expect(Pos.flex(7).getFlexOrder()).toBe(7);
    });

    it('getFlexOrder() defaults to 0', () => {
      expect(Pos.flex().getFlexOrder()).toBe(0);
    });

    it('getFlexOrder() returns undefined for non-flex positions', () => {
      expect(new Pos(0, 0).getFlexOrder()).toBeUndefined();
      expect(Pos.center().getFlexOrder()).toBeUndefined();
      expect(Pos.topLeft().getFlexOrder()).toBeUndefined();
    });
  });
});
