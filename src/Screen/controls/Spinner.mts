import type { SpinnerProperties, WindowProperties, StyleId } from '../types.mjs';
import { BUILTIN_TEXT } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Size } from '../Size.mjs';
import { getRegistry } from '../RegistryHolder.mjs';

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
	private glyphStyleId: StyleId;
	private labelStyleId: StyleId;

	/** Creates a Spinner from window properties and optional control-specific properties.
	 *  When wp.size is omitted, width is auto-computed as max(frameWidth) + (label ? 1 + label.length : 0).
	 *  Uses the global StyleRegistry set by the Screen constructor. */
	public constructor(wp: WindowProperties, cp?: SpinnerProperties) {
		const reg       = getRegistry();
		const styleName = cp?.style ?? 'braille';
		const frames    = SPINNER_FRAMES[styleName];
		const label     = wp.label ?? '';
		const glyphW    = Math.max(...frames.map(f => [...f].length));
		const width     = glyphW + (label.length > 0 ? 1 + label.length : 0);
		const size      = wp.size ?? new Size(Math.max(1, width), 1);

		super({ ...wp, size });

		this.styleName = styleName;
		this.frames    = frames;
		this.frame     = ((cp?.frame ?? 0) % frames.length + frames.length) % frames.length;
		this.running   = cp?.running ?? true;

		this.glyphStyleId = reg.register({ foreground: cp?.color ?? 75, bold: true });
		this.labelStyleId = reg.getNamed(BUILTIN_TEXT)!;
	}

	/** Advances the animation by one frame. No-op when running is false. */
	public step(): void {
		if (!this.running || this.frames.length === 0) return;
		this.frame = (this.frame + 1) % this.frames.length;
		this.markDirty();
	}

	/** Sets the current frame index directly. Wraps into the valid range. */
	public setFrame(frame: number): void {
		if (this.frames.length === 0) return;
		this.frame = ((frame % this.frames.length) + this.frames.length) % this.frames.length;
		this.markDirty();
	}

	/** Returns the current frame index. */
	public getFrame(): number {
		return this.frame;
	}

	/** Starts or resumes the animation. step() will advance frames again. */
	public start(): void {
		if (this.running) return;
		this.running = true;
		this.markDirty();
	}

	/** Pauses the animation. step() becomes a no-op; the current frame stays visible. */
	public stop(): void {
		if (!this.running) return;
		this.running = false;
		this.markDirty();
	}

	/** Returns whether the spinner is currently animating. */
	public isRunning(): boolean {
		return this.running;
	}

	/** Returns the animation style name. */
	public getStyleName(): keyof typeof SPINNER_FRAMES {
		return this.styleName;
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
