import type { CellAttributes, StyleId, Color } from './types.mjs';
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
	BUILTIN_TEXT_SELECTION,
} from './types.mjs';

/** Central registry that maps integer style IDs to CellAttributes objects.
 *  Identical attribute sets always map to the same ID (deduplication). */
export class StyleRegistry {
	/** Styles indexed by ID. Index 0 is always the empty style {}. */
	private styles: CellAttributes[] = [{}];
	/** Serialized key → ID, for deduplication. */
	private index: Map<string, StyleId> = new Map([['{}', 0]]);
	/** Name → ID map for built-in and user-defined named styles. */
	private named: Map<string, StyleId> = new Map();

	/** Creates a new StyleRegistry with built-in named styles pre-registered. */
	public constructor() {
		this.registerNamed(BUILTIN_WINDOW_BG,        { background: 237 });
		this.registerNamed(BUILTIN_BORDER,           { foreground: 240 });
		this.registerNamed(BUILTIN_BORDER_FOCUSED,   { foreground: 75 });
		this.registerNamed(BUILTIN_BORDER_DISABLED,  { foreground: 238 });
		this.registerNamed(BUILTIN_TEXT,             { foreground: 252 });
		this.registerNamed(BUILTIN_TEXT_FOCUSED,     { foreground: 255, bold: true });
		this.registerNamed(BUILTIN_TEXT_DISABLED,    { foreground: 245, dim: true });
		this.registerNamed(BUILTIN_TEXT_PLACEHOLDER, { foreground: 242, italic: true });
		this.registerNamed(BUILTIN_TEXT_CHECKED,     { foreground: 76, bold: true });
		this.registerNamed(BUILTIN_CURSOR,           { inverse: true });
		this.registerNamed(BUILTIN_TEXT_SELECTION,   { background: 24, foreground: 231 });
	}

	/** Registers a CellAttributes object and returns its stable ID.
	 *  If an identical style was registered before, returns the existing ID. */
	public register(attrs: CellAttributes): StyleId {
		const key = this.makeKey(attrs);
		const existing = this.index.get(key);
		if (existing !== undefined) return existing;
		const id = this.styles.length;
		this.styles.push({ ...attrs });
		this.index.set(key, id);
		return id;
	}

	/** Registers a CellAttributes object under a given name and returns its stable ID.
	 *  Calling with the same name again replaces the previous association. */
	public registerNamed(name: string, attrs: CellAttributes): StyleId {
		const id = this.register(attrs);
		this.named.set(name, id);
		return id;
	}

	/** Returns the StyleId associated with the given name, or undefined if not registered. */
	public getNamed(name: string): StyleId | undefined {
		return this.named.get(name);
	}

	/** Returns the foreground Color of a named style, or the fallback value if the name is
	 *  not registered or the style has no foreground attribute. */
	public getNamedForeground(name: string, fallback: Color): Color {
		const id = this.named.get(name);
		if (id === undefined) return fallback;
		return this.styles[id]?.foreground ?? fallback;
	}

	/** Returns the CellAttributes for the given style ID. Returns {} for unknown IDs. */
	public get(id: StyleId): CellAttributes {
		return this.styles[id] ?? {};
	}

	/** Merges two styles and returns the ID of the result.
	 *  The `over` style takes precedence over `base` for conflicting keys. */
	public merge(baseId: StyleId, overId: StyleId): StyleId {
		if (overId === 0) return baseId;
		if (baseId === 0) return overId;
		return this.register({ ...this.get(baseId), ...this.get(overId) });
	}

	/** Produces a deterministic JSON key for deduplication. */
	private makeKey(attrs: CellAttributes): string {
		const keys = Object.keys(attrs).sort() as (keyof CellAttributes)[];
		if (keys.length === 0) return '{}';
		const sorted: Partial<CellAttributes> = {};
		for (const k of keys) {
			(sorted as Record<string, unknown>)[k] = attrs[k];
		}
		return JSON.stringify(sorted);
	}
}
