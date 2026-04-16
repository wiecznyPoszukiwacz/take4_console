import type { CellAttributes, StyleId } from './types.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { getRegistry, setRegistry } from './RegistryHolder.mjs';
import { Window } from './Window.mjs';
import { Pos } from './Pos.mjs';
import { Size } from './Size.mjs';

export class Screen extends Window {
	/** Initializes the root window sized to the current terminal dimensions.
	 *  Creates a fresh StyleRegistry (with built-in styles pre-registered)
	 *  and installs it as the global singleton. */
	public constructor() {
		const width    = process.stdout.columns ?? 80;
		const height   = process.stdout.rows    ?? 24;
		const registry = new StyleRegistry();
		setRegistry(registry);
		super({ pos: Pos.topLeft(), size: new Size(width, height), background: 0 });
	}

	/** Registers a CellAttributes object in the global style registry and returns its stable ID. */
	public registerStyle(attrs: CellAttributes): StyleId {
		return getRegistry().register(attrs);
	}

	/** Returns the global StyleRegistry. */
	public getStyleRegistry(): StyleRegistry {
		return getRegistry();
	}

	/** Overrides a built-in named style (or registers any named style) and returns its new ID.
	 *  Controls will use the updated style on their next render() call. */
	public setBuiltinStyle(name: string, attrs: CellAttributes): StyleId {
		return getRegistry().registerNamed(name, attrs);
	}

	/**
	 * Composites the full window tree, then writes the result to stdout as a single ANSI string.
	 */
	public override render(): void {
		super.render();

		const reg      = getRegistry();
		const chars    = this.region.getChars();
		const styleIds = this.region.getStyleIds();
		let output = '\x1b[H';
		for (let i = 0; i < chars.length; i++) {
			const ch = chars[i];
			// Empty-string sentinel = continuation cell of a wide character;
			// terminal cursor was already advanced by 2 when its left half was emitted.
			if (ch === '') continue;
			output += this.buildAnsiSequence(reg.get(styleIds[i]));
			output += ch;
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
