import { EventEmitter } from 'node:events';
import type { CellAttributes, DirtyRect, ScreenFrameStats, ScreenOptions, StyleId, TerminalSize, ToastOptions, ToastPosition } from './types.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { getRegistry, setRegistry } from './RegistryHolder.mjs';
import { Window } from './Window.mjs';
import { Pos } from './Pos.mjs';
import { Size } from './Size.mjs';
import { Toast } from './controls/Toast.mjs';

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
	/** Active toast overlays grouped by anchor position. Within each group the
	 *  toasts are stored in the order they were created so re-layout can stack
	 *  them outward from the anchor edge. A toast is removed from its group by
	 *  `dismissToast` (auto-dismiss timer) or by `Toast.dismiss()`. */
	private activeToasts: Map<ToastPosition, Toast[]>;
	/** Per-toast auto-dismiss timers. `dismissToast` consults this map so
	 *  manual dismissals cancel the pending timer and leaking timers are
	 *  impossible when the caller drops their reference to the toast. */
	private toastTimers: Map<Toast, ReturnType<typeof setTimeout>>;
	/** Per-toast dismiss callbacks (from `ToastOptions.onDismiss`). Kept out of
	 *  the `Toast` instance so the control stays free of bookkeeping code. */
	private toastDismissHandlers: Map<Toast, () => void>;
	/** When true, `render()` computes the union of every dirty rect propagated
	 *  bottom-up from the window tree and emits ANSI sequences only for those
	 *  cells. When false, every frame re-emits the full buffer (pre-0.31
	 *  behaviour), which is useful for debugging or for terminals that
	 *  mis-handle partial cursor jumps. Configured via `ScreenOptions.damageTracking`. */
	private damageTracking: boolean;
	/** Forces the next `render()` onto the full-repaint path regardless of the
	 *  dirty state. Set on the first frame, after `resize()`, and bubbled up
	 *  from descendants via `markFullInvalidation()` when they change
	 *  geometry, visibility, or tree topology in ways that would leave
	 *  stale cells on stdout. Cleared after every full-repaint emit. */
	private fullInvalidate: boolean;

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
		this.activeToasts        = new Map();
		this.toastTimers         = new Map();
		this.toastDismissHandlers = new Map();
		this.damageTracking      = options?.damageTracking ?? true;
		this.fullInvalidate      = true;

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

	// ── Toast overlays (P1-27) ────────────────────────────────────────────────

	/** Shows a non-modal toast overlay with the given text. Returns the
	 *  underlying `Toast` window so callers can inspect it, swap its message,
	 *  or dismiss it manually via `toast.dismiss()`.
	 *
	 *  Toasts are stacked by anchor: every call at the same `position` adds
	 *  to the visible column, and a dismissal shifts the remainder back
	 *  towards the anchor edge. Auto-dismissal is driven by a `setTimeout`
	 *  whose handle is tracked per-toast so manual dismissals cancel the
	 *  timer. A duration of `0` disables the timer entirely (sticky toast).
	 *
	 *  The method calls `render()` once so the overlay appears immediately,
	 *  and again after every dismissal for the same reason. Consumers
	 *  driving their own render loop can call `screen.render()` themselves —
	 *  the extra render here is idempotent against the `'frame'` event. */
	public toast(text: string, options?: ToastOptions): Toast {
		const position = options?.position ?? 'top-right';
		const duration = options?.duration ?? 2000;
		const zIndex   = options?.zIndex   ?? 10_000;
		const border   = options?.border   ?? { top: true, right: true, bottom: true, left: true, style: 'rounded' };
		const style    = options?.style    ?? Toast.resolveDefaultStyle();
		const width    = options?.width;

		const toast = new Toast(text, { position, style, border, zIndex, width });
		toast.attachDismiss(() => this.dismissToast(toast));

		const list = this.activeToasts.get(position) ?? [];
		list.push(toast);
		this.activeToasts.set(position, list);

		this.addChild(toast);
		this.relayoutToasts(position);

		if (duration > 0) {
			const timer = setTimeout(() => this.dismissToast(toast), duration);
			if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') {
				timer.unref();
			}
			this.toastTimers.set(toast, timer);
		}

		if (options?.onDismiss) this.toastDismissHandlers.set(toast, options.onDismiss);

		this.render();
		return toast;
	}

	/** Removes a toast from the Screen, cancels its auto-dismiss timer (if
	 *  any), reflows the remaining toasts anchored to the same corner, and
	 *  fires the `onDismiss` callback the caller registered at creation
	 *  time. Safe to call twice — the second call is a no-op. */
	public dismissToast(toast: Toast): void {
		const position = toast.getToastPosition();
		const list = this.activeToasts.get(position);
		if (!list) return;
		const idx = list.indexOf(toast);
		if (idx === -1) return;
		list.splice(idx, 1);

		const timer = this.toastTimers.get(toast);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.toastTimers.delete(toast);
		}

		this.removeChild(toast);
		this.relayoutToasts(position);

		const handler = this.toastDismissHandlers.get(toast);
		if (handler) {
			this.toastDismissHandlers.delete(toast);
			handler();
		}

		this.render();
	}

	/** Returns a snapshot of the currently active toasts for the given anchor
	 *  position (or every anchor when `position` is omitted). Exposed for
	 *  tests and diagnostics — consumers generally keep the instance returned
	 *  by `toast()` rather than walking this list. */
	public getActiveToasts(position?: ToastPosition): readonly Toast[] {
		if (position !== undefined) {
			return [...(this.activeToasts.get(position) ?? [])];
		}
		const all: Toast[] = [];
		for (const list of this.activeToasts.values()) all.push(...list);
		return all;
	}

	/** Computes each toast's absolute position inside the Screen for the
	 *  given anchor group and writes it to the toast's `x` / `y`. Called
	 *  after every `addChild` / `removeChild` toast mutation and whenever
	 *  the Screen is resized so the stack stays anchored. Mutates `x` / `y`
	 *  directly — the Toast's `Pos.topLeft()` is only a placeholder consumed
	 *  by the absolute layout pass that ran during `addChild`. */
	private relayoutToasts(position: ToastPosition): void {
		const list = this.activeToasts.get(position);
		if (!list || list.length === 0) return;
		const { width: screenW, height: screenH } = this.getSize();

		const horizontalAnchor: 'left' | 'center' | 'right' =
			position.endsWith('left')   ? 'left'   :
			position.endsWith('right')  ? 'right'  :
			                              'center';
		const verticalAnchor: 'top' | 'bottom' =
			position.startsWith('top') ? 'top' : 'bottom';

		let offset = 0;
		for (const toast of list) {
			const { width: tw, height: th } = toast.getSize();

			let x: number;
			if (horizontalAnchor === 'left')       x = 0;
			else if (horizontalAnchor === 'right') x = Math.max(0, screenW - tw);
			else                                   x = Math.max(0, Math.floor((screenW - tw) / 2));

			let y: number;
			if (verticalAnchor === 'top') {
				y = offset;
			} else {
				y = Math.max(0, screenH - offset - th);
			}
			offset += th;

			toast.x = x;
			toast.y = y;
		}
	}

	/** Re-runs `relayoutToasts` for every non-empty anchor group. Invoked
	 *  from `resize()` so terminal resizes keep the overlays pinned to their
	 *  corners. */
	private relayoutAllToasts(): void {
		for (const position of this.activeToasts.keys()) {
			this.relayoutToasts(position);
		}
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
		// Cancel every pending auto-dismiss timer so a disposed Screen does
		// not hold the Node event loop open via a detached setTimeout.
		for (const timer of this.toastTimers.values()) clearTimeout(timer);
		this.toastTimers.clear();
		this.toastDismissHandlers.clear();
		this.activeToasts.clear();
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
		// Re-anchor every active toast overlay so corner-positioned stacks
		// follow the new terminal geometry rather than drifting out of view.
		this.relayoutAllToasts();
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

		// Fast path: damage tracking is on, nothing is dirty, no full
		// invalidation pending — skip composition AND emit entirely. The
		// terminal already shows the correct pixels from the previous frame.
		if (this.damageTracking && !this.fullInvalidate) {
			const rects: DirtyRect[] = [];
			this.collectDirtyRects(0, 0, rects);
			if (rects.length === 0) {
				this.events.emit('frame', { ms: Date.now() - start, cellsEmitted: 0 });
				return;
			}
			// Compose first so `this.region` reflects the latest content; the
			// emit below reads from it. We keep `rects` for the emit phase
			// instead of re-collecting, because `super.render()` does not
			// mutate dirty flags (render-depth guard suppresses markDirty
			// inside render overrides).
			super.render();
			const stats = this.emitDirty(rects);
			this.clearDirtyRecursive();
			this.events.emit('frame', { ms: Date.now() - start, cellsEmitted: stats, fullRepaint: false });
			return;
		}

		// Slow / fallback path: full repaint. Always used for the first
		// frame, after `resize()`, after `markFullInvalidation()`, and when
		// damage tracking has been disabled by the caller.
		super.render();
		const cellsEmitted = this.emitFull();
		this.fullInvalidate = false;
		this.clearDirtyRecursive();
		this.events.emit('frame', { ms: Date.now() - start, cellsEmitted, fullRepaint: true });
	}

	/** Emits every visible cell in `this.region` as one ANSI write, starting
	 *  with `\x1b[H` (cursor home) and ending with `\x1b[0m`. Returns the
	 *  number of cells whose character was actually written (skips wide-char
	 *  continuation sentinels). Used by the full-repaint path. */
	private emitFull(): number {
		const reg      = getRegistry();
		const chars    = this.region.getChars();
		const styleIds = this.region.getStyleIds();
		let output = '\x1b[H';
		let count  = 0;
		for (let i = 0; i < chars.length; i++) {
			const ch = chars[i];
			// Empty-string sentinel = continuation cell of a wide character;
			// terminal cursor was already advanced by 2 when its left half was emitted.
			if (ch === '') continue;
			output += this.buildAnsiSequence(reg.get(styleIds[i]));
			output += ch;
			count++;
		}
		output += '\x1b[0m';
		process.stdout.write(output);
		return count;
	}

	/** Coalesces the collected dirty rects into per-row horizontal intervals
	 *  and emits only those cells, using `\x1b[row;colH` cursor jumps between
	 *  rows. Returns the number of cells emitted so consumers of the 'frame'
	 *  event can see how much work each frame did. */
	private emitDirty(rects: DirtyRect[]): number {
		const { width: sw, height: sh } = this.getSize();
		if (sw === 0 || sh === 0) { process.stdout.write(''); return 0; }

		// Collapse rects into per-row min/max columns. A Map keyed by row is
		// sparse enough for the common case (few small dirty regions) and
		// avoids allocating a dense sh-sized array when only a couple of
		// rows are touched.
		const rowSpans = new Map<number, { minX: number; maxX: number }>();
		for (const r of rects) {
			const y0 = Math.max(0, r.y);
			const y1 = Math.min(sh - 1, r.y + r.h - 1);
			const x0 = Math.max(0, r.x);
			const x1 = Math.min(sw - 1, r.x + r.w - 1);
			if (y1 < y0 || x1 < x0) continue;
			for (let y = y0; y <= y1; y++) {
				const existing = rowSpans.get(y);
				if (existing) {
					if (x0 < existing.minX) existing.minX = x0;
					if (x1 > existing.maxX) existing.maxX = x1;
				} else {
					rowSpans.set(y, { minX: x0, maxX: x1 });
				}
			}
		}
		if (rowSpans.size === 0) return 0;

		// Emit rows in ascending order so the terminal cursor advances
		// forward — random access is fine (we always send an explicit cursor
		// move) but ordered output compresses a bit better and is easier to
		// reason about in transcripts / tests.
		const rows = [...rowSpans.keys()].sort((a, b) => a - b);
		const reg      = getRegistry();
		const chars    = this.region.getChars();
		const styleIds = this.region.getStyleIds();
		let output = '';
		let count  = 0;
		for (const y of rows) {
			const span = rowSpans.get(y)!;
			// ANSI cursor addressing is 1-based.
			output += `\x1b[${y + 1};${span.minX + 1}H`;
			for (let x = span.minX; x <= span.maxX; x++) {
				const i  = y * sw + x;
				const ch = chars[i];
				if (ch === '') continue;
				output += this.buildAnsiSequence(reg.get(styleIds[i]));
				output += ch;
				count++;
			}
		}
		output += '\x1b[0m';
		process.stdout.write(output);
		return count;
	}

	/** Overrides the parent hook so bubbled full-invalidation signals land
	 *  on this Screen's own `fullInvalidate` flag instead of walking further
	 *  up a non-existent parent chain. Public so WindowManager can also
	 *  request a full repaint after pause/resume or alt-screen toggling. */
	public override markFullInvalidation(): void {
		this.fullInvalidate = true;
	}

	/** Public alias of `markFullInvalidation()` — schedules a full repaint on
	 *  the next `render()` call. Use this when external state (terminal
	 *  re-init, post-OS dialog, SSH reconnect, …) may have corrupted the
	 *  on-screen buffer and the stored dirty rects are no longer sufficient. */
	public invalidate(): void {
		this.markFullInvalidation();
	}

	/** Returns whether damage tracking is currently enabled. Useful for demo
	 *  code and tests that want to assert or toggle the mode at runtime. */
	public isDamageTrackingEnabled(): boolean {
		return this.damageTracking;
	}

	/** Enables or disables damage tracking at runtime. Disabling forces every
	 *  subsequent frame onto the full-repaint path; re-enabling resumes the
	 *  dirty-rect emit on the next frame (after one final full repaint, so
	 *  the terminal state matches the tree-derived baseline). */
	public setDamageTracking(enabled: boolean): void {
		if (this.damageTracking === enabled) return;
		this.damageTracking = enabled;
		// Always do one full repaint on transition so the terminal buffer
		// matches what the window tree would produce from scratch — useful
		// when flipping back and forth for debugging.
		this.fullInvalidate = true;
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
