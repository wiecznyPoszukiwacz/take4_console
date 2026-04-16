import { describe, it, expect, afterEach } from 'vitest';
import { charWidth, stringWidth, setPuaWidth, getPuaWidth } from '../src/Screen/textWidth.mjs';

describe('textWidth', () => {
  afterEach(() => {
    // Restore default PUA width so cross-test ordering is irrelevant.
    setPuaWidth(1);
  });

  describe('charWidth()', () => {
    it('returns 1 for ASCII printable characters', () => {
      expect(charWidth(0x20)).toBe(1);          // space
      expect(charWidth('A'.codePointAt(0)!)).toBe(1);
      expect(charWidth('z'.codePointAt(0)!)).toBe(1);
      expect(charWidth('~'.codePointAt(0)!)).toBe(1);
    });

    it('returns 0 for C0 control characters', () => {
      expect(charWidth(0x00)).toBe(0);
      expect(charWidth(0x09)).toBe(0);
      expect(charWidth(0x1F)).toBe(0);
    });

    it('returns 0 for DEL and C1 control range', () => {
      expect(charWidth(0x7F)).toBe(0);
      expect(charWidth(0x9F)).toBe(0);
    });

    it('returns 0 for combining diacritical marks', () => {
      expect(charWidth(0x0301)).toBe(0); // combining acute accent
      expect(charWidth(0x036F)).toBe(0);
    });

    it('returns 0 for variation selectors', () => {
      expect(charWidth(0xFE0F)).toBe(0);
      expect(charWidth(0xE0100)).toBe(0);
    });

    it('returns 0 for zero-width joiners and BOM', () => {
      expect(charWidth(0x200B)).toBe(0);
      expect(charWidth(0x200D)).toBe(0);
      expect(charWidth(0xFEFF)).toBe(0);
    });

    it('returns 2 for CJK Unified Ideographs', () => {
      expect(charWidth(0x4E00)).toBe(2);  // 一
      expect(charWidth(0x9FFF)).toBe(2);
      expect(charWidth('漢'.codePointAt(0)!)).toBe(2);
    });

    it('returns 2 for Hangul syllables', () => {
      expect(charWidth(0xAC00)).toBe(2); // 가
      expect(charWidth(0xD7A3)).toBe(2);
    });

    it('returns 2 for fullwidth ASCII variants', () => {
      expect(charWidth(0xFF21)).toBe(2); // Ａ
      expect(charWidth(0xFF5A)).toBe(2);
    });

    it('returns 2 for emoji in supplementary plane', () => {
      expect(charWidth(0x1F600)).toBe(2);  // 😀
      expect(charWidth(0x1F680)).toBe(2);  // 🚀
      expect(charWidth(0x1F9D1)).toBe(2);  // 🧑
    });

    it('returns 2 for CJK Extension B (supplementary plane)', () => {
      expect(charWidth(0x20000)).toBe(2);
      expect(charWidth(0x2FFFD)).toBe(2);
    });

    it('returns the configured PUA width for U+E000–F8FF', () => {
      expect(getPuaWidth()).toBe(1);
      expect(charWidth(0xE000)).toBe(1);
      expect(charWidth(0xF8FF)).toBe(1);
      setPuaWidth(2);
      expect(charWidth(0xE000)).toBe(2);
      expect(charWidth(0xF000)).toBe(2);
    });

    it('returns the configured PUA width for supplementary PUA planes', () => {
      setPuaWidth(2);
      expect(charWidth(0xF0000)).toBe(2);
      expect(charWidth(0x100000)).toBe(2);
    });

    it('returns 1 for non-CJK Latin extended characters', () => {
      expect(charWidth('ą'.codePointAt(0)!)).toBe(1);
      expect(charWidth('ñ'.codePointAt(0)!)).toBe(1);
      expect(charWidth('Ω'.codePointAt(0)!)).toBe(1); // Greek Omega
    });
  });

  describe('stringWidth()', () => {
    it('returns 0 for empty string', () => {
      expect(stringWidth('')).toBe(0);
    });

    it('counts ASCII characters as 1 cell each', () => {
      expect(stringWidth('hello')).toBe(5);
      expect(stringWidth('a b c')).toBe(5);
    });

    it('counts CJK characters as 2 cells each', () => {
      expect(stringWidth('日本語')).toBe(6);
    });

    it('counts emoji as 2 cells each', () => {
      expect(stringWidth('😀')).toBe(2);
      expect(stringWidth('🚀🛸')).toBe(4);
    });

    it('mixes narrow and wide characters', () => {
      expect(stringWidth('a日b')).toBe(4);
      expect(stringWidth('foo 漢字 bar')).toBe(12);
    });

    it('ignores zero-width combining marks', () => {
      // 'e' + combining acute accent → still 1 cell wide visually
      expect(stringWidth('e\u0301')).toBe(1);
    });

    it('ignores zero-width joiners and variation selectors', () => {
      expect(stringWidth('\u200D')).toBe(0);
      expect(stringWidth('a\uFE0Fb')).toBe(2);
    });

    it('counts PUA glyphs according to setPuaWidth()', () => {
      const nerdGlyph = '\uF005'; // example PUA glyph
      expect(stringWidth(nerdGlyph)).toBe(1);
      setPuaWidth(2);
      expect(stringWidth(nerdGlyph)).toBe(2);
    });
  });
});
