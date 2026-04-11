import type { ProgressBarOptions, StyleId } from '../types.mjs';
import { BUILTIN_WINDOW_BG } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** Character used for the filled portion of the bar. */
const CHAR_FILL  = '█';
/** Character used for the empty portion of the bar. */
const CHAR_EMPTY = '░';

/** A horizontal read-only progress bar that fills left-to-right using block characters.
 *  Displays an optional centred percentage label over the bar. */
export class ProgressBar extends Window {
	private value:     number;
	private max:       number;
	private showLabel: boolean;

	private fillStyleId:  StyleId;
	private emptyStyleId: StyleId;
	private labelStyleId: StyleId;

	/** Creates a ProgressBar at the given position and size.
	 *  Recommended height: 1 (no border) or 3 (with border).
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, size: Size, options?: ProgressBarOptions, registry?: StyleRegistry) {
		const reg  = registry ?? new StyleRegistry();
		const bgId = options?.background
			?? reg.getNamed(BUILTIN_WINDOW_BG)
			?? reg.register({ background: 237 });

		super(pos, size, {
			background: bgId,
			border:     options?.border,
			active:     options?.active,
		}, reg);

		this.max       = Math.max(1, options?.max ?? 100);
		this.value     = Math.max(0, Math.min(options?.value ?? 0, this.max));
		this.showLabel = options?.showLabel ?? true;

		this.fillStyleId  = reg.register({ background: options?.fillColor  ?? 75  });
		this.emptyStyleId = reg.register({ background: options?.emptyColor ?? 237 });
		this.labelStyleId = reg.register({ foreground: 255, bold: true });
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

	/** ProgressBar is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; ProgressBar cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** ProgressBar cannot be disabled — always returns false. */
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
		const filledCols = Math.round(ratio * width);
		const barRow     = Math.floor(height / 2);

		for (let x = 0; x < width; x++) {
			const isFilled = x < filledCols;
			this.setCell(ox + x, oy + barRow, isFilled ? CHAR_FILL : CHAR_EMPTY,
				isFilled ? this.fillStyleId : this.emptyStyleId);
		}

		if (this.showLabel) {
			const pct    = Math.round(ratio * 100);
			const text   = `${pct}%`;
			const labelX = Math.max(0, Math.floor((width - text.length) / 2));
			this.writeText(text, { x: labelX, y: barRow, style: this.labelStyleId });
		}

		super.render();
	}
}
