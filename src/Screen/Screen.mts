import type { CellAttributes, StyleId } from './types.mjs';
import {
	BUILTIN_WINDOW_BG,
	BUILTIN_BORDER,
	BUILTIN_BORDER_FOCUSED,
	BUILTIN_BORDER_DISABLED,
	BUILTIN_TEXT,
	BUILTIN_TEXT_FOCUSED,
	BUILTIN_TEXT_DISABLED,
	BUILTIN_TEXT_PLACEHOLDER,
	BUILTIN_TEXT_CHECKED,
	BUILTIN_CURSOR,
} from './types.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { Window } from './Window.mjs';
import { Pos } from './Pos.mjs';
import { Size } from './Size.mjs';

export class Screen extends Window {
	private ownRegistry: StyleRegistry;

	/** Initializes the root window sized to the current terminal dimensions.
	 *  Pre-registers the built-in named styles used by all controls. */
	public constructor() {
		const width    = process.stdout.columns ?? 80;
		const height   = process.stdout.rows    ?? 24;
		const registry = new StyleRegistry();
		super(Pos.topLeft(), new Size(width, height), undefined, registry);
		this.ownRegistry = registry;
		this.registerBuiltinDefaults();
	}

	/** Registers a CellAttributes object in the screen's style registry and returns its stable ID. */
	public registerStyle(attrs: CellAttributes): StyleId {
		return this.ownRegistry.register(attrs);
	}

	/** Returns the screen's StyleRegistry so child Windows can share the same ID space. */
	public getStyleRegistry(): StyleRegistry {
		return this.ownRegistry;
	}

	/** Overrides a built-in named style (or registers any named style) and returns its new ID.
	 *  Controls will use the updated style on their next render() call. */
	public setBuiltinStyle(name: string, attrs: CellAttributes): StyleId {
		return this.ownRegistry.registerNamed(name, attrs);
	}

	/** Registers default CellAttributes for all built-in style names. */
	private registerBuiltinDefaults(): void {
		this.ownRegistry.registerNamed(BUILTIN_WINDOW_BG,        { background: 237 });
		this.ownRegistry.registerNamed(BUILTIN_BORDER,           { foreground: 240 });
		this.ownRegistry.registerNamed(BUILTIN_BORDER_FOCUSED,   { foreground: 75 });
		this.ownRegistry.registerNamed(BUILTIN_BORDER_DISABLED,  { foreground: 238 });
		this.ownRegistry.registerNamed(BUILTIN_TEXT,             { foreground: 252 });
		this.ownRegistry.registerNamed(BUILTIN_TEXT_FOCUSED,     { foreground: 255, bold: true });
		this.ownRegistry.registerNamed(BUILTIN_TEXT_DISABLED,    { foreground: 245, dim: true });
		this.ownRegistry.registerNamed(BUILTIN_TEXT_PLACEHOLDER, { foreground: 242, italic: true });
		this.ownRegistry.registerNamed(BUILTIN_TEXT_CHECKED,     { foreground: 76, bold: true });
		this.ownRegistry.registerNamed(BUILTIN_CURSOR,           { inverse: true });
	}

	/**
	 * Composites the full window tree, then writes the result to stdout as a single ANSI string.
	 */
	public override render(): void {
		super.render();

		const chars    = this.region.getChars();
		const styleIds = this.region.getStyleIds();
		let output = '\x1b[H';
		for (let i = 0; i < chars.length; i++) {
			output += this.buildAnsiSequence(this.ownRegistry.get(styleIds[i]));
			output += chars[i];
		}
		output += '\x1b[0m';
		process.stdout.write(output);
	}

	/** Converts cell attributes into an ANSI escape sequence (always resets first). */
	private buildAnsiSequence(attrs: CellAttributes): string {
		const codes: number[] = [0];

		if (attrs.bold)          codes.push(1);
		if (attrs.dim)           codes.push(2);
		if (attrs.italic)        codes.push(3);
		if (attrs.underline)     codes.push(4);
		if (attrs.blink)         codes.push(5);
		if (attrs.inverse)       codes.push(7);
		if (attrs.strikethrough) codes.push(9);

		if (attrs.foreground !== undefined) {
			if (typeof attrs.foreground === 'number') {
				codes.push(38, 5, attrs.foreground);
			} else {
				const [r, g, b] = this.hexToRgb(attrs.foreground);
				codes.push(38, 2, r, g, b);
			}
		}

		if (attrs.background !== undefined) {
			if (typeof attrs.background === 'number') {
				codes.push(48, 5, attrs.background);
			} else {
				const [r, g, b] = this.hexToRgb(attrs.background);
				codes.push(48, 2, r, g, b);
			}
		}

		return `\x1b[${codes.join(';')}m`;
	}

	/** Parses a hex color string (#rrggbb or #rgb) into [r, g, b] components. */
	private hexToRgb(hex: string): [number, number, number] {
		const clean = hex.replace('#', '');
		if (clean.length === 3) {
			return [
				parseInt(clean[0] + clean[0], 16),
				parseInt(clean[1] + clean[1], 16),
				parseInt(clean[2] + clean[2], 16),
			];
		}
		return [
			parseInt(clean.slice(0, 2), 16),
			parseInt(clean.slice(2, 4), 16),
			parseInt(clean.slice(4, 6), 16),
		];
	}
}
