import type { DimSpec } from './types.mjs';
import { Pct } from './Pos.mjs';

/** Converts a user-supplied dimension value to an internal DimSpec. */
function toDimSpec(v: number | Pct): DimSpec {
	if (v instanceof Pct) return { mode: 'pct', value: v.value };
	return { mode: 'abs', value: v };
}

/** Resolves a single dimension spec to a pixel value. */
function resolveDim(spec: DimSpec, parentSize: number): number {
	if (spec.mode === 'pct') return Math.floor(parentSize * spec.value / 100);
	return spec.value;
}

/** Encodes window dimensions. Supports absolute pixel values and percentage of parent size. */
export class Size {
	private wSpec: DimSpec;
	private hSpec: DimSpec;

	/** Creates a size from width and height values.
	 *  Pass a plain number for absolute pixels, or a Pct instance for a percentage of the parent. */
	public constructor(w: number | Pct, h: number | Pct) {
		this.wSpec = toDimSpec(w);
		this.hSpec = toDimSpec(h);
	}

	/** Creates a size that fills 100% of the parent in both dimensions. */
	public static fill(): Size {
		return new Size(new Pct(100), new Pct(100));
	}

	/** Creates a size that fills 100% of the parent's width; height is absolute or percentage. */
	public static fillWidth(h: number | Pct): Size {
		return new Size(new Pct(100), h);
	}

	/** Creates a size that fills 100% of the parent's height; width is absolute or percentage. */
	public static fillHeight(w: number | Pct): Size {
		return new Size(w, new Pct(100));
	}

	/** Returns true when both dimensions are absolute pixel values (no parent size needed). */
	public isAbsolute(): boolean {
		return this.wSpec.mode === 'abs' && this.hSpec.mode === 'abs';
	}

	/** Resolves this size to pixel dimensions given the parent's dimensions. */
	public resolve(parentW: number, parentH: number): { w: number; h: number } {
		return {
			w: resolveDim(this.wSpec, parentW),
			h: resolveDim(this.hSpec, parentH),
		};
	}
}
