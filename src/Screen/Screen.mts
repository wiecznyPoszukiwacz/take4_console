import { EventEmitter } from 'node:events';
import type { CellAttributes, ScreenFrameStats, ScreenOptions, StyleId, TerminalSize } from './types.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { getRegistry, setRegistry } from './RegistryHolder.mjs';
import { Window } from './Window.mjs';
import { Pos } from './Pos.mjs';
import { Size } from './Size.mjs';

/** ANSI control sequences for the terminal lifecycle features owned by Screen. */
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const EXIT_ALT_SCREEN  = '\x1b[?1049l';
const HIDE_CURSOR      = '\x1b[?25l';
const SHOW_CURSOR      = '\x1b[?25h';

export class Screen extends Window {
	/** Internal event bus for 'resize' and 'frame' notifications. Composed
	 *  rather than inherited so the Window class hierarchy stays plain. */
	private events: EventEmitter;
	/** True while the alternate screen buffer is currently active. */
	private altScreenActive: boolean;
	/** True while the hardware cursor is currently hidden. */
	private cursorHidden: boolean;
	/** Soft FPS cap stored for inspection by consumers; full enforcement is P2-47. */
	private targetFps: number | undefined;
	/** Bound SIGWINCH listener (kept so we can detach it on dispose()). */
	private boundSigwinch: () => void;
	/** Bound 'exit' listener that runs synchronous terminal cleanup. */
	private boundExit: () => void;
	/** Whether the SIGWINCH + 'exit' listeners are currently attached. */
	private signalsInstalled: boolean;
	/** Whether dispose() has already restored terminal state. */
	private disposed: boolean;

	/** Initializes the root window sized to the current terminal dimensions.
	 *  Creates a fresh StyleRegistry (with built-in styles pre-registered)
	 *  and installs it as the global singleton. The optional ScreenOptions
	 *  control whether the alternate screen buffer is entered and the cursor
	 *  hidden up-front; both are off by default so existing code that relies
	 *  on WindowManager.run/stop for those toggles keeps working unchanged. */
	public constructor(options?: ScreenOptions) {
		const width    = process.stdout.columns ?? 80;
		const height   = process.stdout.rows    ?? 24;
		const registry = new StyleRegistry();
		setRegistry(registry);
		super({ pos: Pos.topLeft(), size: new Size(width, height), background: 0 });

		this.events           = new EventEmitter();
		this.altScreenActive  = false;
		this.cursorHidden     = false;
		this.targetFps        = options?.targetFps;
		this.boundSigwinch    = (): void => { this.handleSigwinch(); };
		this.boundExit        = (): void => { this.restoreTerminalState(); };
		this.signalsInstalled = false;
		this.disposed         = false;

		if (options?.altScreen)  this.enterAltScreen();
		if (options?.hideCursor) this.hideHardwareCursor();
		this.installSignalHandlers();
	}

	/** Registers a CellAttributes object in the global style registry and returns its stable ID. */
	public registerStyle(attrs: CellAttributes): StyleId {
		return getRegistry().register(attrs);
	}

	/** Returns the global StyleRegistry. */
	public getStyleRegistry(): StyleRegistry {
		return getRegistry();
	}

	/** Overrides a built-in named style (or registers any named style) and returns its new ID.
	 *  Controls will use the updated style on their next render() call. */
	public setBuiltinStyle(name: string, attrs: CellAttributes): StyleId {
		return getRegistry().registerNamed(name, attrs);
	}

	/** Returns the soft FPS cap configured via ScreenOptions, or undefined when uncapped. */
	public getTargetFps(): number | undefined {
		return this.targetFps;
	}

	// ── Terminal lifecycle helpers ────────────────────────────────────────────

	/** Switches the terminal into the alternate screen buffer. Idempotent. */
	public enterAltScreen(): void {
		if (this.altScreenActive) return;
		process.stdout.write(ENTER_ALT_SCREEN);
		this.altScreenActive = true;
	}

	/** Restores the primary screen buffer if Screen previously entered the
	 *  alternate one. Idempotent. */
	public exitAltScreen(): void {
		if (!this.altScreenActive) return;
		process.stdout.write(EXIT_ALT_SCREEN);
		this.altScreenActive = false;
	}

	/** Returns true while the alternate screen buffer is active. WindowManager
	 *  uses this to avoid double-toggling when the consumer constructed the
	 *  Screen with `altScreen: true`. */
	public isAltScreenActive(): boolean {
		return this.altScreenActive;
	}

	/** Hides the hardware cursor. Idempotent. */
	public hideHardwareCursor(): void {
		if (this.cursorHidden) return;
		process.stdout.write(HIDE_CURSOR);
		this.cursorHidden = true;
	}

	/** Restores the hardware cursor if Screen previously hid it. Idempotent. */
	public showHardwareCursor(): void {
		if (!this.cursorHidden) return;
		process.stdout.write(SHOW_CURSOR);
		this.cursorHidden = false;
	}

	/** Returns true while the hardware cursor is hidden by this Screen. */
	public isCursorHidden(): boolean {
		return this.cursorHidden;
	}

	/** Restores any terminal state that was modified by ScreenOptions /
	 *  enter/hide helpers and detaches signal listeners. Idempotent — safe to
	 *  call from both deliberate teardown and a process 'exit' handler. */
	public dispose(): void {
		if (this.disposed) return;
		this.restoreTerminalState();
		this.uninstallSignalHandlers();
		this.disposed = true;
	}

	// ── Resize handling ───────────────────────────────────────────────────────

	/** Recomputes the Screen dimensions from the live `process.stdout` size
	 *  (or from the explicit overrides), reallocates the internal buffers,
	 *  reflows all percentage-sized children, and emits a 'resize' event.
	 *  Called automatically on SIGWINCH; also exposed for tests and consumers
	 *  that drive resize manually (e.g. when running outside a TTY). */
	public resize(width?: number, height?: number): TerminalSize {
		const w = width  ?? process.stdout.columns ?? 80;
		const h = height ?? process.stdout.rows    ?? 24;
		this.setSize(w, h);
		const size: TerminalSize = { width: w, height: h };
		this.events.emit('resize', size);
		return size;
	}

	// ── EventEmitter delegation ───────────────────────────────────────────────

	/** Subscribes to a Screen lifecycle event.
	 *  - 'resize' fires after SIGWINCH (or manual resize()) once the buffers
	 *    have been re-allocated; the listener receives the new TerminalSize.
	 *  - 'frame'  fires at the end of every render() with timing stats. */
	public on(event: 'resize', listener: (size: TerminalSize) => void): this;
	public on(event: 'frame',  listener: (stats: ScreenFrameStats) => void): this;
	public on(event: string, listener: (...args: never[]) => void): this {
		this.events.on(event, listener as (...args: unknown[]) => void);
		return this;
	}

	/** Removes a previously registered listener. */
	public off(event: 'resize', listener: (size: TerminalSize) => void): this;
	public off(event: 'frame',  listener: (stats: ScreenFrameStats) => void): this;
	public off(event: string, listener: (...args: never[]) => void): this {
		this.events.off(event, listener as (...args: unknown[]) => void);
		return this;
	}

	/**
	 * Composites the full window tree, then writes the result to stdout as a single ANSI string.
	 * Emits a 'frame' event with the wall-clock duration of the render after stdout has been written.
	 */
	public override render(): void {
		const start = Date.now();
		super.render();

		const reg      = getRegistry();
		const chars    = this.region.getChars();
		const styleIds = this.region.getStyleIds();
		let output = '\x1b[H';
		for (let i = 0; i < chars.length; i++) {
			const ch = chars[i];
			// Empty-string sentinel = continuation cell of a wide character;
			// terminal cursor was already advanced by 2 when its left half was emitted.
			if (ch === '') continue;
			output += this.buildAnsiSequence(reg.get(styleIds[i]));
			output += ch;
		}
		output += '\x1b[0m';
		process.stdout.write(output);
		this.events.emit('frame', { ms: Date.now() - start });
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/** Synchronous teardown of any terminal state we own. Used by both dispose()
	 *  and the 'exit' listener, where async work would be discarded. */
	private restoreTerminalState(): void {
		// Cursor first so it reappears in the primary buffer rather than blink
		// on the (about-to-be-restored) alt buffer for one frame.
		this.showHardwareCursor();
		this.exitAltScreen();
	}

	/** Number of distinct process listeners each Screen installs (SIGWINCH + exit).
	 *  Used to bump process.setMaxListeners() proportionally so test suites that
	 *  spin up many Screens don't trip Node's default leak warning. */
	private static readonly LISTENERS_PER_INSTANCE = 2;
	/** Live count of Screens that have installed signal listeners but not yet
	 *  disposed. Drives the dynamic process listener cap. */
	private static liveInstances = 0;

	/** Attaches the SIGWINCH listener (for autoresize) and an 'exit' listener
	 *  (for last-chance terminal cleanup). Idempotent. */
	private installSignalHandlers(): void {
		if (this.signalsInstalled) return;
		Screen.liveInstances++;
		const wanted = 10 + Screen.liveInstances * Screen.LISTENERS_PER_INSTANCE;
		if (process.getMaxListeners() < wanted) process.setMaxListeners(wanted);
		process.on('SIGWINCH', this.boundSigwinch);
		process.on('exit',     this.boundExit);
		this.signalsInstalled = true;
	}

	/** Detaches the listeners installed by installSignalHandlers(). Idempotent. */
	private uninstallSignalHandlers(): void {
		if (!this.signalsInstalled) return;
		process.off('SIGWINCH', this.boundSigwinch);
		process.off('exit',     this.boundExit);
		Screen.liveInstances = Math.max(0, Screen.liveInstances - 1);
		this.signalsInstalled = false;
	}

	/** SIGWINCH handler: pulls the new size from process.stdout and triggers a resize. */
	private handleSigwinch(): void {
		this.resize();
	}

	/** Converts cell attributes into an ANSI escape sequence (always resets first). */
	private buildAnsiSequence(attrs: CellAttributes): string {
		const codes: number[] = [0];

		if (attrs.bold)          codes.push(1);
		if (attrs.dim)           codes.push(2);
		if (attrs.italic)        codes.push(3);
		if (attrs.underline)     codes.push(4);
		if (attrs.blink)         codes.push(5);
		if (attrs.inverse)       codes.push(7);
		if (attrs.strikethrough) codes.push(9);

		if (attrs.foreground !== undefined) {
			if (typeof attrs.foreground === 'number') {
				codes.push(38, 5, attrs.foreground);
			} else {
				const [r, g, b] = this.hexToRgb(attrs.foreground);
				codes.push(38, 2, r, g, b);
			}
		}

		if (attrs.background !== undefined) {
			if (typeof attrs.background === 'number') {
				codes.push(48, 5, attrs.background);
			} else {
				const [r, g, b] = this.hexToRgb(attrs.background);
				codes.push(48, 2, r, g, b);
			}
		}

		return `\x1b[${codes.join(';')}m`;
	}

	/** Parses a hex color string (#rrggbb or #rgb) into [r, g, b] components. */
	private hexToRgb(hex: string): [number, number, number] {
		const clean = hex.replace('#', '');
		if (clean.length === 3) {
			return [
				parseInt(clean[0] + clean[0], 16),
				parseInt(clean[1] + clean[1], 16),
				parseInt(clean[2] + clean[2], 16),
			];
		}
		return [
			parseInt(clean.slice(0, 2), 16),
			parseInt(clean.slice(2, 4), 16),
			parseInt(clean.slice(4, 6), 16),
		];
	}
}
