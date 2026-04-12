import type { StyleId, TerminalSize } from './types.mjs';

export class Region {
	private chars: string[];
	private styleIds: number[];
	private size: TerminalSize;

	/** Allocates a cell buffer for the given dimensions. All cells start with style ID 0 (empty). */
	public constructor(width: number, height: number) {
		this.size = { width, height };
		const len = width * height;
		this.chars    = Array(len).fill(' ');
		this.styleIds = new Array(len).fill(0);
	}

	/** Returns the region dimensions (columns × rows). */
	public getSize(): TerminalSize {
		return { ...this.size };
	}

	/** Returns the style ID stored at (x, y). Throws RangeError if out of bounds. */
	public getStyleId(x: number, y: number): StyleId {
		this.assertBounds(x, y);
		return this.styleIds[this.index(x, y)];
	}

	/** Sets only the character at (x, y) without modifying the style ID. Throws RangeError if out of bounds. */
	public setChar(x: number, y: number, char: string): void {
		this.assertBounds(x, y);
		this.chars[this.index(x, y)] = char;
	}

	/** Sets the character and style ID at (x, y). Throws RangeError if out of bounds. */
	public setCell(x: number, y: number, char: string, styleId: StyleId = 0): void {
		this.assertBounds(x, y);
		const i = this.index(x, y);
		this.chars[i]    = char;
		this.styleIds[i] = styleId;
	}

	/** Replaces only the style ID at (x, y) without changing the character. Throws RangeError if out of bounds. */
	public setStyleId(x: number, y: number, styleId: StyleId): void {
		this.assertBounds(x, y);
		this.styleIds[this.index(x, y)] = styleId;
	}

	/** Resets every cell to a blank space with style ID 0. */
	public clear(): void {
		const len = this.chars.length;
		for (let i = 0; i < len; i++) {
			this.chars[i]    = ' ';
			this.styleIds[i] = 0;
		}
	}

	/** Fills every cell with the given character and style ID. */
	public fill(char: string, styleId: StyleId = 0): void {
		const len = this.chars.length;
		for (let i = 0; i < len; i++) {
			this.chars[i]    = char;
			this.styleIds[i] = styleId;
		}
	}

	/** Returns a readonly view of the character buffer for rendering. */
	public getChars(): readonly string[] {
		return this.chars;
	}

	/** Returns a readonly view of the style-ID buffer for rendering. */
	public getStyleIds(): readonly number[] {
		return this.styleIds;
	}

	/** Returns the flat buffer index for the given (x, y) coordinates. */
	private index(x: number, y: number): number {
		return y * this.size.width + x;
	}

	/** Throws RangeError if the coordinates (x, y) are outside the region boundaries. */
	private assertBounds(x: number, y: number): void {
		if (x < 0 || x >= this.size.width || y < 0 || y >= this.size.height) {
			throw new RangeError(
				`Cell (${x}, ${y}) is out of bounds for region ${this.size.width}×${this.size.height}`
			);
		}
	}
}
