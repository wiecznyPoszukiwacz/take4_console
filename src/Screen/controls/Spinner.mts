import type { SpinnerOptions, StyleId } from '../types.mjs';
import { BUILTIN_TEXT } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

/** Animation style name → frame sequence. */
const SPINNER_FRAMES: Record<'braille' | 'dots' | 'line' | 'circle' | 'arrow', string[]> = {
	braille: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
	dots:    ['.  ', '.. ', '...', ' ..', '  .', '   '],
	line:    ['|', '/', '-', '\\'],
	circle:  ['◐', '◓', '◑', '◒'],
	arrow:   ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
};

/** A read-only animated loader indicator. Holds an animation frame index that
 *  advances manually via step() — typically driven by setInterval() in the
 *  demo, but any external clock source will do. The glyph is rendered to the
 *  left of an optional text label. */
export class Spinner extends Window {
	private styleName: keyof typeof SPINNER_FRAMES;
	private frames:    string[];
	private frame:     number;
	private running:   boolean;
	private label:     string;

	private glyphStyleId: StyleId;
	private labelStyleId: StyleId;

	/** Creates a Spinner at the given position.
	 *  Width is auto-computed as max(frameWidth) + (label ? 1 + label.length : 0).
	 *  An optional StyleRegistry may be shared with the parent window. */
	public constructor(pos: Pos, options?: SpinnerOptions, registry?: StyleRegistry) {
		const reg       = registry ?? new StyleRegistry();
		const styleName = options?.style ?? 'braille';
		const frames    = SPINNER_FRAMES[styleName];
		const label     = options?.label ?? '';
		const glyphW    = Math.max(...frames.map(f => [...f].length));
		const width     = glyphW + (label.length > 0 ? 1 + label.length : 0);

		super(pos, new Size(Math.max(1, width), 1), {
			background: options?.background,
			border:     options?.border,
			active:     options?.active,
		}, reg);

		this.styleName = styleName;
		this.frames    = frames;
		this.frame     = ((options?.frame ?? 0) % frames.length + frames.length) % frames.length;
		this.running   = options?.running ?? true;
		this.label     = label;

		this.glyphStyleId = reg.register({ foreground: options?.color ?? 75, bold: true });
		this.labelStyleId = reg.getNamed(BUILTIN_TEXT) ?? reg.register({ foreground: 252 });
	}

	/** Advances the animation by one frame. No-op when running is false. */
	public step(): void {
		if (!this.running || this.frames.length === 0) return;
		this.frame = (this.frame + 1) % this.frames.length;
	}

	/** Sets the current frame index directly. Wraps into the valid range. */
	public setFrame(frame: number): void {
		if (this.frames.length === 0) return;
		this.frame = ((frame % this.frames.length) + this.frames.length) % this.frames.length;
	}

	/** Returns the current frame index. */
	public getFrame(): number {
		return this.frame;
	}

	/** Starts or resumes the animation. step() will advance frames again. */
	public start(): void {
		this.running = true;
	}

	/** Pauses the animation. step() becomes a no-op; the current frame stays visible. */
	public stop(): void {
		this.running = false;
	}

	/** Returns whether the spinner is currently animating. */
	public isRunning(): boolean {
		return this.running;
	}

	/** Sets the label shown to the right of the spinner glyph. Note: does not
	 *  resize the control — width is fixed at construction time. */
	public setLabel(label: string): void {
		this.label = label;
	}

	/** Returns the current label text. */
	public getLabel(): string {
		return this.label;
	}

	/** Returns the animation style name. */
	public getStyleName(): keyof typeof SPINNER_FRAMES {
		return this.styleName;
	}

	/** Spinner is not interactive — always returns false. */
	public isFocused(): boolean {
		return false;
	}

	/** No-op; Spinner cannot receive focus. */
	public setFocused(_focused: boolean): void {}

	/** Spinner cannot be disabled — always returns false. */
	public isDisabled(): boolean {
		return false;
	}

	public override render(): void {
		this.clear();

		const glyph = this.frames[this.frame] ?? '';
		this.writeText(glyph, { x: 0, y: 0, style: this.glyphStyleId });

		if (this.label.length > 0) {
			// Leave one space between glyph and label.
			const glyphW = Math.max(...this.frames.map(f => [...f].length));
			this.writeText(' ' + this.label, { x: glyphW, y: 0, style: this.labelStyleId });
		}

		super.render();
	}
}
