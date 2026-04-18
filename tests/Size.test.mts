import { describe, it, expect } from 'vitest';
import { Size, FlexDim, ContentDim, flex, content } from '../src/Screen/Size.mjs';
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

  describe('flex() factory', () => {
    it('returns a FlexDim with the provided grow / shrink / basis', () => {
      const d = flex(2, 3, 10);
      expect(d).toBeInstanceOf(FlexDim);
      expect(d.grow).toBe(2);
      expect(d.shrink).toBe(3);
      expect(d.basis).toBe(10);
    });

    it('defaults grow=1, shrink=1, basis=0', () => {
      const d = flex();
      expect(d.grow).toBe(1);
      expect(d.shrink).toBe(1);
      expect(d.basis).toBe(0);
    });
  });

  describe('content() factory', () => {
    it('returns the ContentDim singleton', () => {
      expect(content()).toBeInstanceOf(ContentDim);
      expect(content()).toBe(content());
    });
  });

  describe('Size with flex/content dimensions', () => {
    it('Size(flex(), 10) produces flex width spec, abs height spec', () => {
      const s = new Size(flex(2, 0, 5), 10);
      expect(s.getWidthSpec() ).toEqual({ mode: 'flex', grow: 2, shrink: 0, basis: { kind: 'abs', value: 5 } });
      expect(s.getHeightSpec()).toEqual({ mode: 'abs', value: 10 });
    });

    it('flex basis supports Pct', () => {
      const s = new Size(flex(1, 1, pct(30)), 10);
      expect(s.getWidthSpec()).toEqual({ mode: 'flex', grow: 1, shrink: 1, basis: { kind: 'pct', value: 30 } });
    });

    it('content() produces content mode on both axes', () => {
      const s = new Size(content(), content());
      expect(s.getWidthSpec().mode ).toBe('content');
      expect(s.getHeightSpec().mode).toBe('content');
    });

    it('Size.flex() is a shorthand for flex on both axes', () => {
      const s = Size.flex(2);
      expect(s.getWidthSpec().mode ).toBe('flex');
      expect(s.getHeightSpec().mode).toBe('flex');
      expect((s.getWidthSpec()  as { grow: number }).grow).toBe(2);
    });

    it('Size.content() is a shorthand for content on both axes', () => {
      const s = Size.content();
      expect(s.getWidthSpec().mode ).toBe('content');
      expect(s.getHeightSpec().mode).toBe('content');
    });

    it('isAbsolute() is false when any axis is flex or content', () => {
      expect(new Size(flex(),   10).isAbsolute()).toBe(false);
      expect(new Size(content(), 10).isAbsolute()).toBe(false);
      expect(Size.flex().isAbsolute()            ).toBe(false);
      expect(Size.content().isAbsolute()         ).toBe(false);
    });

    it('resolve() falls back to flex basis for flex dims', () => {
      expect(new Size(flex(1, 1, 8), flex(1, 1, pct(50))).resolve(100, 50)).toEqual({ w: 8, h: 25 });
    });

    it('resolve() falls back to 1 for content dims', () => {
      expect(Size.content().resolve(100, 50)).toEqual({ w: 1, h: 1 });
    });
  });
});
