import type { CellAttributes, StyleId } from './types.mjs';

/** Central registry that maps integer style IDs to CellAttributes objects.
 *  Identical attribute sets always map to the same ID (deduplication). */
export class StyleRegistry {
	/** Styles indexed by ID. Index 0 is always the empty style {}. */
	private styles: CellAttributes[] = [{}];
	/** Serialized key → ID, for deduplication. */
	private index: Map<string, StyleId> = new Map([['{}', 0]]);

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
