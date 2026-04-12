import type { AxisSpec } from './types.mjs';

/** Wraps a percentage value (0–100) for use in Pos and Size constructors. */
export class Pct {
	public constructor(public readonly value: number) {}
}

/** Creates a Pct instance representing the given percentage. */
export function pct(value: number): Pct {
	return new Pct(value);
}

/** Converts a user-supplied coordinate to an internal AxisSpec. */
function toAxisSpec(v: number | Pct): AxisSpec {
	if (v instanceof Pct) return { mode: 'pct', value: v.value };
	if (v < 0)           return { mode: 'end', value: -v };
	return { mode: 'start', value: v };
}

/** Resolves a single axis spec to a pixel offset. */
function resolveAxis(spec: AxisSpec, parentSize: number, ownSize: number): number {
	switch (spec.mode) {
		case 'start':  return spec.value;
		case 'end':    return parentSize - ownSize - spec.value;
		case 'pct':    return Math.floor(parentSize * spec.value / 100);
		case 'center': return Math.floor((parentSize - ownSize) / 2);
	}
}

/** Encodes a window position. Supports absolute coordinates, edge-relative (negative),
 *  percentage-based, center alignment, and named edge presets. */
export class Pos {
	private xSpec: AxisSpec;
	private ySpec: AxisSpec;

	/** Creates a position.
	 *  - Positive number: absolute distance from left/top.
	 *  - Negative number: own right/bottom edge at that distance from parent's right/bottom.
	 *  - Pct instance: percentage of parent dimension from left/top. */
	public constructor(x: number | Pct, y: number | Pct) {
		this.xSpec = toAxisSpec(x);
		this.ySpec = toAxisSpec(y);
	}

	/** Builds a Pos directly from raw AxisSpec values (used by static factories). */
	private static fromSpecs(x: AxisSpec, y: AxisSpec): Pos {
		const p  = Object.create(Pos.prototype) as Pos;
		p.xSpec  = x;
		p.ySpec  = y;
		return p;
	}

	/** Aligns the top-left corner with the parent's top-left corner (0, 0). */
	public static topLeft(): Pos {
		return Pos.fromSpecs({ mode: 'start', value: 0 }, { mode: 'start', value: 0 });
	}

	/** Aligns the top-right corner with the parent's top-right corner. */
	public static topRight(): Pos {
		return Pos.fromSpecs({ mode: 'end', value: 0 }, { mode: 'start', value: 0 });
	}

	/** Aligns the bottom-left corner with the parent's bottom-left corner. */
	public static bottomLeft(): Pos {
		return Pos.fromSpecs({ mode: 'start', value: 0 }, { mode: 'end', value: 0 });
	}

	/** Aligns the bottom-right corner with the parent's bottom-right corner. */
	public static bottomRight(): Pos {
		return Pos.fromSpecs({ mode: 'end', value: 0 }, { mode: 'end', value: 0 });
	}

	/** Centers the window within the parent on both axes. */
	public static center(): Pos {
		return Pos.fromSpecs({ mode: 'center' }, { mode: 'center' });
	}

	/** Aligns the top edge with the parent's top edge; x sets horizontal position. */
	public static top(x: number | Pct = 0): Pos {
		return Pos.fromSpecs(toAxisSpec(x), { mode: 'start', value: 0 });
	}

	/** Aligns the left edge with the parent's left edge; y sets vertical position. */
	public static left(y: number | Pct = 0): Pos {
		return Pos.fromSpecs({ mode: 'start', value: 0 }, toAxisSpec(y));
	}

	/** Aligns the right edge with the parent's right edge; y sets vertical position. */
	public static right(y: number | Pct = 0): Pos {
		return Pos.fromSpecs({ mode: 'end', value: 0 }, toAxisSpec(y));
	}

	/** Aligns the bottom edge with the parent's bottom edge; x sets horizontal position. */
	public static bottom(x: number | Pct = 0): Pos {
		return Pos.fromSpecs(toAxisSpec(x), { mode: 'end', value: 0 });
	}

	/** Returns true when both axes are absolute-from-start values (no parent/own-size needed). */
	public isAbsolute(): boolean {
		return this.xSpec.mode === 'start' && this.ySpec.mode === 'start';
	}

	/** Resolves absolute position without needing parent or own dimensions.
	 *  Only call when isAbsolute() returns true. */
	public resolveAbsolute(): { x: number; y: number } {
		return {
			x: (this.xSpec as { mode: 'start'; value: number }).value,
			y: (this.ySpec as { mode: 'start'; value: number }).value,
		};
	}

	/** Resolves this position to pixel coordinates given parent and own dimensions. */
	public resolve(parentW: number, parentH: number, ownW: number, ownH: number): { x: number; y: number } {
		return {
			x: resolveAxis(this.xSpec, parentW, ownW),
			y: resolveAxis(this.ySpec, parentH, ownH),
		};
	}
}
