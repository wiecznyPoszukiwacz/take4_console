// Unicode display width for monospace terminals.
//
// Maps a codepoint to its visible cell width (0, 1 or 2). Used by
// Window.writeText so wide characters (CJK, emoji, NerdFonts double-width)
// occupy two consecutive cells in the buffer, and by Window.getTextWidth /
// stringWidth() so consumers can size labels correctly.
//
// The internal tables are derived from the Unicode East Asian Width data
// (W and F categories) plus a curated set of zero-width / control / combining
// ranges. They are intentionally compact rather than exhaustive — the goal is
// "good enough for labels and log output", not full Unicode normalization.

/** Configurable display width for the Private Use Area (NerdFonts glyphs).
 *  Most NerdFonts ship single-cell glyphs but some patched fonts use 2 cells. */
let puaWidth: 1 | 2 = 1;

/** Sets the display width used for codepoints in the Unicode Private Use Areas
 *  (U+E000–F8FF, U+F0000–FFFFD, U+100000–10FFFD). NerdFonts glyphs typically
 *  render as one cell; some patched fonts render them as two cells. Default: 1. */
export const setPuaWidth = (width: 1 | 2): void => {
	puaWidth = width;
};

/** Returns the currently configured Private Use Area width. */
export const getPuaWidth = (): 1 | 2 => puaWidth;

/** Zero-width ranges: control characters, combining marks, format characters,
 *  variation selectors, joiners. Sorted by start codepoint for binary search. */
const ZERO_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x0000,  0x001F],
	[0x007F,  0x009F],
	[0x00AD,  0x00AD],
	[0x0300,  0x036F],
	[0x0483,  0x0489],
	[0x0591,  0x05BD],
	[0x05BF,  0x05BF],
	[0x05C1,  0x05C2],
	[0x05C4,  0x05C5],
	[0x05C7,  0x05C7],
	[0x0610,  0x061A],
	[0x061C,  0x061C],
	[0x064B,  0x065F],
	[0x0670,  0x0670],
	[0x06D6,  0x06DC],
	[0x06DF,  0x06E4],
	[0x06E7,  0x06E8],
	[0x06EA,  0x06ED],
	[0x0711,  0x0711],
	[0x0730,  0x074A],
	[0x07A6,  0x07B0],
	[0x07EB,  0x07F3],
	[0x07FD,  0x07FD],
	[0x0816,  0x0819],
	[0x081B,  0x0823],
	[0x0825,  0x0827],
	[0x0829,  0x082D],
	[0x0859,  0x085B],
	[0x08D3,  0x08E1],
	[0x08E3,  0x0902],
	[0x093A,  0x093A],
	[0x093C,  0x093C],
	[0x0941,  0x0948],
	[0x094D,  0x094D],
	[0x0951,  0x0957],
	[0x0962,  0x0963],
	[0x180B,  0x180E],
	[0x200B,  0x200F],
	[0x202A,  0x202E],
	[0x2060,  0x2064],
	[0x2066,  0x206F],
	[0xFE00,  0xFE0F],
	[0xFEFF,  0xFEFF],
	[0xE0100, 0xE01EF],
];

/** Wide (W or F) ranges: characters that occupy two terminal cells. */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x1100,  0x115F],
	[0x231A,  0x231B],
	[0x2329,  0x232A],
	[0x23E9,  0x23EC],
	[0x23F0,  0x23F0],
	[0x23F3,  0x23F3],
	[0x25FD,  0x25FE],
	[0x2614,  0x2615],
	[0x2648,  0x2653],
	[0x267F,  0x267F],
	[0x2693,  0x2693],
	[0x26A1,  0x26A1],
	[0x26AA,  0x26AB],
	[0x26BD,  0x26BE],
	[0x26C4,  0x26C5],
	[0x26CE,  0x26CE],
	[0x26D4,  0x26D4],
	[0x26EA,  0x26EA],
	[0x26F2,  0x26F3],
	[0x26F5,  0x26F5],
	[0x26FA,  0x26FA],
	[0x26FD,  0x26FD],
	[0x2705,  0x2705],
	[0x270A,  0x270B],
	[0x2728,  0x2728],
	[0x274C,  0x274C],
	[0x274E,  0x274E],
	[0x2753,  0x2755],
	[0x2757,  0x2757],
	[0x2795,  0x2797],
	[0x27B0,  0x27B0],
	[0x27BF,  0x27BF],
	[0x2B1B,  0x2B1C],
	[0x2B50,  0x2B50],
	[0x2B55,  0x2B55],
	[0x2E80,  0x303E],
	[0x3041,  0x33FF],
	[0x3400,  0x4DBF],
	[0x4E00,  0x9FFF],
	[0xA000,  0xA4CF],
	[0xA960,  0xA97F],
	[0xAC00,  0xD7A3],
	[0xF900,  0xFAFF],
	[0xFE10,  0xFE19],
	[0xFE30,  0xFE6F],
	[0xFF00,  0xFF60],
	[0xFFE0,  0xFFE6],
	[0x16FE0, 0x16FE4],
	[0x17000, 0x187F7],
	[0x18800, 0x18AFF],
	[0x1B000, 0x1B11F],
	[0x1F004, 0x1F004],
	[0x1F0CF, 0x1F0CF],
	[0x1F18E, 0x1F18E],
	[0x1F191, 0x1F19A],
	[0x1F200, 0x1F320],
	[0x1F330, 0x1F335],
	[0x1F337, 0x1F37C],
	[0x1F380, 0x1F39F],
	[0x1F3A0, 0x1F3FA],
	[0x1F400, 0x1F4FD],
	[0x1F500, 0x1F53D],
	[0x1F549, 0x1F54E],
	[0x1F550, 0x1F567],
	[0x1F57A, 0x1F57A],
	[0x1F595, 0x1F596],
	[0x1F5A4, 0x1F5A4],
	[0x1F5FB, 0x1F64F],
	[0x1F680, 0x1F6FF],
	[0x1F900, 0x1F9FF],
	[0x1FA70, 0x1FAFF],
	[0x20000, 0x2FFFD],
	[0x30000, 0x3FFFD],
];

/** Binary search: returns true when codepoint lies inside any [start, end] interval. */
const inRanges = (cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean => {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		const r   = ranges[mid];
		if (cp < r[0])      hi = mid - 1;
		else if (cp > r[1]) lo = mid + 1;
		else                return true;
	}
	return false;
};

/** Returns the display width (0, 1 or 2 cells) of a single Unicode codepoint. */
export const charWidth = (codepoint: number): 0 | 1 | 2 => {
	// Private Use Areas — checked first because they overlap with neither
	// zero nor wide tables and we want the configured width to win.
	if (codepoint >= 0xE000   && codepoint <= 0xF8FF)   return puaWidth;
	if (codepoint >= 0xF0000  && codepoint <= 0xFFFFD)  return puaWidth;
	if (codepoint >= 0x100000 && codepoint <= 0x10FFFD) return puaWidth;
	if (inRanges(codepoint, ZERO_RANGES)) return 0;
	if (inRanges(codepoint, WIDE_RANGES)) return 2;
	return 1;
};

/** Returns the total display width of a string in monospace terminal cells.
 *  Iterates by codepoint, so surrogate pairs are counted once with their
 *  combined width (typically 2 for emoji and supplementary CJK). */
export const stringWidth = (str: string): number => {
	let total = 0;
	for (const ch of str) total += charWidth(ch.codePointAt(0)!);
	return total;
};
