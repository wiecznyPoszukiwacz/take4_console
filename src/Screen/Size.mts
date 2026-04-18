import type { DimSpec, FlexBasis } from './types.mjs';
import { Pct } from './Pos.mjs';

/** Value object describing a flex dimension — `grow` shares positive leftover
 *  space between siblings, `shrink` soaks up negative leftover, `basis` is the
 *  starting main-axis size before distribution. Produced via the `flex()`
 *  factory and accepted anywhere a `Size` constructor expects a dimension. */
export class FlexDim {
	public readonly grow:   number;
	public readonly shrink: number;
	public readonly basis:  number | Pct;

	public constructor(grow: number = 1, shrink: number = 1, basis: number | Pct = 0) {
		this.grow   = grow;
		this.shrink = shrink;
		this.basis  = basis;
	}
}

/** Singleton marker for content-sized dimensions. Produced via the `content()`
 *  factory; the layout engine measures the child's natural size (current
 *  Region dimensions) at layout time. */
export class ContentDim {
	public static readonly INSTANCE: ContentDim = new ContentDim();
	private constructor() {}
}

/** Factory for a flex dimension — shorthand for `new FlexDim(grow, shrink, basis)`. */
export function flex(grow: number = 1, shrink: number = 1, basis: number | Pct = 0): FlexDim {
	return new FlexDim(grow, shrink, basis);
}

/** Factory for a content-sized dimension. Always returns the singleton. */
export function content(): ContentDim {
	return ContentDim.INSTANCE;
}

/** Accepted user-supplied values for a single Size dimension. */
export type DimValue = number | Pct | FlexDim | ContentDim;

/** Converts a basis literal to the internal FlexBasis representation. */
function toFlexBasis(v: number | Pct): FlexBasis {
	if (v instanceof Pct) return { kind: 'pct', value: v.value };
	return { kind: 'abs', value: v };
}

/** Converts a user-supplied dimension value to an internal DimSpec. */
function toDimSpec(v: DimValue): DimSpec {
	if (v instanceof Pct)        return { mode: 'pct', value: v.value };
	if (v instanceof FlexDim)    return { mode: 'flex', grow: v.grow, shrink: v.shrink, basis: toFlexBasis(v.basis) };
	if (v instanceof ContentDim) return { mode: 'content' };
	return { mode: 'abs', value: v };
}

/** Resolves a single dimension spec to a pixel value. For modes whose final
 *  size is determined by the parent's layout engine (`flex`, `content`) this
 *  returns a safe fallback that keeps the region non-empty until the layout
 *  pass overwrites it — `flex` falls back to its basis, `content` to 1. */
function resolveDim(spec: DimSpec, parentSize: number): number {
	switch (spec.mode) {
		case 'abs':     return spec.value;
		case 'pct':     return Math.floor(parentSize * spec.value / 100);
		case 'flex':    return spec.basis.kind === 'pct'
			? Math.floor(parentSize * spec.basis.value / 100)
			: spec.basis.value;
		case 'content': return 1;
	}
}

/** Encodes window dimensions. Supports absolute pixel values, percentages of
 *  the parent, flex slots (`flex(grow, shrink, basis)`), and content-sized
 *  dimensions (`content()`). Flex and content modes only take effect inside a
 *  flex-layout parent (`WindowProperties.layout` set to 'row', 'column', or
 *  'grid'); in 'absolute' layout they degrade to the fallback resolution. */
export class Size {
	private wSpec: DimSpec;
	private hSpec: DimSpec;

	/** Creates a size from width and height values.
	 *  Accepts plain numbers (absolute pixels), `Pct` (percentage of parent),
	 *  `FlexDim` (via `flex()` factory), or `ContentDim` (via `content()`). */
	public constructor(w: DimValue, h: DimValue) {
		this.wSpec = toDimSpec(w);
		this.hSpec = toDimSpec(h);
	}

	/** Creates a size that fills 100% of the parent in both dimensions. */
	public static fill(): Size {
		return new Size(new Pct(100), new Pct(100));
	}

	/** Creates a size that fills 100% of the parent's width; height is absolute or percentage. */
	public static fillWidth(h: DimValue): Size {
		return new Size(new Pct(100), h);
	}

	/** Creates a size that fills 100% of the parent's height; width is absolute or percentage. */
	public static fillHeight(w: DimValue): Size {
		return new Size(w, new Pct(100));
	}

	/** Creates a size that flexes on both axes — shorthand for
	 *  `new Size(flex(grow, shrink, basis), flex(grow, shrink, basis))`. The
	 *  parent's layout engine decides which axis is main vs cross. */
	public static flex(grow: number = 1, shrink: number = 1, basis: number | Pct = 0): Size {
		return new Size(flex(grow, shrink, basis), flex(grow, shrink, basis));
	}

	/** Creates a size where both axes are content-sized. The layout engine
	 *  measures the child's current Region dimensions and uses those. */
	public static content(): Size {
		return new Size(content(), content());
	}

	/** Returns true when both dimensions are absolute pixel values (no parent size needed). */
	public isAbsolute(): boolean {
		return this.wSpec.mode === 'abs' && this.hSpec.mode === 'abs';
	}

	/** Resolves this size to pixel dimensions given the parent's dimensions.
	 *  Flex/content modes fall back to safe defaults; the layout engine takes
	 *  over when the parent uses a non-'absolute' `layout`. */
	public resolve(parentW: number, parentH: number): { w: number; h: number } {
		return {
			w: resolveDim(this.wSpec, parentW),
			h: resolveDim(this.hSpec, parentH),
		};
	}

	/** Returns the raw width spec so the layout engine can inspect the mode
	 *  (abs/pct/flex/content) and route each child accordingly. */
	public getWidthSpec(): DimSpec {
		return this.wSpec;
	}

	/** Returns the raw height spec — companion to getWidthSpec(). */
	public getHeightSpec(): DimSpec {
		return this.hSpec;
	}
}
