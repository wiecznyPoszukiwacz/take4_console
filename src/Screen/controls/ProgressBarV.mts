import type { ProgressBarVProperties, WindowProperties, StyleId } from '../types.mjs';
import { Window } from '../Window.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

/** Character used for the filled portion of the bar. */
const CHAR_FILL  = '█';
/** Character used for the empty portion of the bar. */
const CHAR_EMPTY = '░';

/** A vertical read-only progress bar that fills from the bottom upward using block characters. */
export class ProgressBarV extends Window {
	private value: number;
	private max:   number;

	private fillStyleId:  StyleId;
	private emptyStyleId: StyleId;

	/** Creates a ProgressBarV from window properties and optional control-specific properties.
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: ProgressBarVProperties) {
		super(wp);

		this.max   = Math.max(1, cp?.max ?? 100);
		this.value = Math.max(0, Math.min(cp?.value ?? 0, this.max));

		const reg = getRegistry();
		this.fillStyleId  = reg.register({ background: cp?.fillColor  ?? 75  });
		this.emptyStyleId = reg.register({ background: cp?.emptyColor ?? 237 });
	}

	/** Sets the current value (clamped to 0–max). Call render() afterwards. */
	public setValue(value: number): void {
		this.value = Math.max(0, Math.min(value, this.max));
		this.markDirty();
	}

	/** Returns the current value. */
	public getValue(): number {
		return this.value;
	}

	/** Sets the maximum value (minimum 1). Call render() afterwards. */
	public setMax(max: number): void {
		this.max   = Math.max(1, max);
		this.value = Math.min(this.value, this.max);
		this.markDirty();
	}

	/** Returns the maximum value. */
	public getMax(): number {
		return this.max;
	}

	public override render(): void {
		this.clear();

		const { width, height } = this.getInnerSize();
		const { x: ox, y: oy } = this.getInnerOffset();

		if (width < 1 || height < 1) {
			super.render();
			return;
		}

		const ratio      = this.max > 0 ? Math.min(1, Math.max(0, this.value / this.max)) : 0;
		const filledRows = Math.round(ratio * height);

		for (let row = 0; row < height; row++) {
			const isFilled = row >= (height - filledRows);
			const char     = isFilled ? CHAR_FILL : CHAR_EMPTY;
			const styleId  = isFilled ? this.fillStyleId : this.emptyStyleId;
			for (let col = 0; col < width; col++) {
				this.setCell(ox + col, oy + row, char, styleId);
			}
		}

		super.render();
	}
}
