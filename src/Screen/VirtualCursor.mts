import type { CursorBlink, VirtualCursorOptions } from './types.mjs';

/** Default on/off durations (ms) for the named blink modes. */
const BLINK_PRESETS = {
	slow:    { onMs:  600, offMs:  600 },
	fast:    { onMs:  250, offMs:  250 },
} as const;

/** Bounds (ms) for the irregular blink mode — each phase picks a random
 *  duration from its range so the cursor feels "alive" rather than metronomic. */
const IRREGULAR_ON_MIN  = 180;
const IRREGULAR_ON_MAX  = 520;
const IRREGULAR_OFF_MIN =  90;
const IRREGULAR_OFF_MAX = 240;

/** Default glyph used when the consumer does not supply one — a vertical
 *  bar that reads as a text insertion caret on most monospace fonts. */
export const DEFAULT_CURSOR_SYMBOL = '▎';

/** Internal schedule entry used to walk the blink timeline. */
interface Phase {
	/** Absolute timestamp (ms since epoch) when this phase started. */
	startedAt: number;
	/** True when the cursor is currently showing, false when hidden. */
	visible: boolean;
	/** Duration of this phase in ms. */
	duration: number;
}

/** Software cursor model — owns the glyph rendered on screen and the
 *  on/off blink state. Stateless when `blink.mode === 'off'` or `'steady'`;
 *  for timed modes the class samples `Date.now()` on every `isVisible()`
 *  call and advances internal phase state as needed. A caller (typically
 *  `WindowManager`) is responsible for triggering re-renders on a timer so
 *  the visual state actually reaches the terminal. */
export class VirtualCursor {
	/** Glyph rendered for the cursor when visible. `undefined` means "use
	 *  the legacy inverse-block highlight over the underlying character". */
	private symbol: string | undefined;
	/** Blink configuration — mode and custom timings. */
	private blink: CursorBlink;
	/** Current phase in the blink timeline. Lazily initialised on first
	 *  `isVisible()` call so construction stays free of side effects. */
	private phase: Phase | null;

	/** Creates a new cursor with the provided symbol and blink settings.
	 *  Defaults: symbol = `undefined` (inverse-block), blink = `{ mode: 'steady' }`. */
	public constructor(options?: VirtualCursorOptions) {
		this.symbol = options?.symbol;
		this.blink  = options?.blink  ?? { mode: 'steady' };
		this.phase  = null;
	}

	/** Returns the caller-supplied glyph, or `DEFAULT_CURSOR_SYMBOL` when
	 *  none was set. Use `hasCustomSymbol()` to distinguish the two cases. */
	public getSymbol(): string {
		return this.symbol ?? DEFAULT_CURSOR_SYMBOL;
	}

	/** Returns true when a custom glyph was provided; false means the
	 *  caller wants the legacy inverse-block highlight behaviour. */
	public hasCustomSymbol(): boolean {
		return this.symbol !== undefined;
	}

	/** Replaces the cursor glyph. Pass `undefined` to revert to inverse-block. */
	public setSymbol(symbol: string | undefined): void {
		this.symbol = symbol;
	}

	/** Returns the active blink configuration (for inspection / cloning). */
	public getBlink(): CursorBlink {
		return this.blink;
	}

	/** Replaces the blink configuration and resets the phase timer so the
	 *  new mode starts in its "on" phase immediately. */
	public setBlink(blink: CursorBlink): void {
		this.blink = blink;
		this.phase = null;
	}

	/** Returns the fastest cadence (in ms) a re-render would need to show
	 *  this cursor's blink faithfully, or `null` when the cursor is static
	 *  (modes `'off'` and `'steady'`). Used by `WindowManager` to pick a
	 *  timer interval. For `irregular` we return the minimum possible
	 *  off-phase duration so quick flicks are not missed. */
	public getTickHintMs(): number | null {
		switch (this.blink.mode) {
			case 'off':
			case 'steady':
				return null;
			case 'slow':
				return BLINK_PRESETS.slow.onMs;
			case 'fast':
				return BLINK_PRESETS.fast.onMs;
			case 'irregular':
				return IRREGULAR_OFF_MIN;
			case 'custom':
				return Math.min(this.blink.onMs, this.blink.offMs);
			default:
				return null;
		}
	}

	/** Returns whether the cursor should be drawn at the given moment.
	 *  `now` is accepted for deterministic testing; defaults to `Date.now()`. */
	public isVisible(now: number = Date.now()): boolean {
		if (this.blink.mode === 'off')    return false;
		if (this.blink.mode === 'steady') return true;

		if (this.phase === null) {
			this.phase = { startedAt: now, visible: true, duration: this.firstOnDuration() };
		}

		// Walk forward through phases until we land on the one that covers `now`.
		// Doing this iteratively (vs. a single modulo) is important for
		// `irregular` mode, where every phase has an independently sampled
		// duration.
		while (now - this.phase.startedAt >= this.phase.duration) {
			const current: Phase      = this.phase;
			const nextStart: number   = current.startedAt + current.duration;
			const nextVisible: boolean = !current.visible;
			this.phase = {
				startedAt: nextStart,
				visible:   nextVisible,
				duration:  this.phaseDuration(nextVisible),
			};
		}

		return this.phase.visible;
	}

	/** Forces the next `isVisible()` sample to begin a fresh "on" phase at
	 *  `now`. Useful for keeping the cursor steady while the user types — a
	 *  blink that vanishes mid-keystroke is jarring. */
	public resetPhase(now: number = Date.now()): void {
		this.phase = { startedAt: now, visible: true, duration: this.firstOnDuration() };
	}

	/** Picks the first "on" phase duration for the current blink mode.
	 *  Split out so tests can assert the expected preset values. */
	private firstOnDuration(): number {
		return this.phaseDuration(true);
	}

	/** Returns the duration of the upcoming phase given its visibility flag.
	 *  Implements both the named presets and the `custom` / `irregular`
	 *  semantics in one place. */
	private phaseDuration(visible: boolean): number {
		switch (this.blink.mode) {
			case 'off':
			case 'steady':
				return Number.POSITIVE_INFINITY;
			case 'slow':
				return visible ? BLINK_PRESETS.slow.onMs : BLINK_PRESETS.slow.offMs;
			case 'fast':
				return visible ? BLINK_PRESETS.fast.onMs : BLINK_PRESETS.fast.offMs;
			case 'custom':
				return visible ? this.blink.onMs : this.blink.offMs;
			case 'irregular':
				return visible
					? randomBetween(IRREGULAR_ON_MIN,  IRREGULAR_ON_MAX)
					: randomBetween(IRREGULAR_OFF_MIN, IRREGULAR_OFF_MAX);
			default:
				return Number.POSITIVE_INFINITY;
		}
	}
}

/** Returns a uniformly distributed integer in the closed range [min, max].
 *  Kept as a module-private helper so `VirtualCursor` stays compact. */
function randomBetween(min: number, max: number): number {
	return min + Math.floor(Math.random() * (max - min + 1));
}
