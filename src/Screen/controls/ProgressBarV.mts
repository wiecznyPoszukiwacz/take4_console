import type { ProgressBarVOptions, StyleId } from '../types.mjs';
import { BUILTIN_WINDOW_BG } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

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

	/** Creates a ProgressBarV at the given position and size.
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: ProgressBarVOptions, registry?: StyleRegistry) {
		const reg  = registry ?? new StyleRegistry();
		const bgId = options?.background
			?? reg.getNamed(BUILTIN_WINDOW_BG)
			?? reg.register({ background: 237 });

		super(pos, size, {
			background: bgId,
			border:     options?.border,
			active:     options?.active,
		}, reg);

		this.max   = Math.max(1, options?.max ?? 100);
		this.value = Math.max(0, Math.min(options?.value ?? 0, this.max));

		this.fillStyleId  = reg.register({ background: options?.fillColor  ?? 75  });
		this.emptyStyleId = reg.register({ background: options?.emptyColor ?? 237 });
	}

	/** Sets the current value (clamped to 0–max). Call render() afterwards. */
	public setValue(value: number): void {
		this.value = Math.max(0, Math.min(value, this.max));
	}

	/** Returns the current value. */
	public getValue(): number {
		return this.value;
	}

	/** Sets the maximum value (minimum 1). Call render() afterwards. */
	public setMax(max: number): void {
		this.max   = Math.max(1, max);
		this.value = Math.min(this.value, this.max);
	}

	/** Returns the maximum value. */
	public getMax(): number {
		return this.max;
	}

	/** ProgressBarV is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; ProgressBarV cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** ProgressBarV cannot be disabled — always returns false. */
	public isDisabled(): boolean {
		return false;
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
