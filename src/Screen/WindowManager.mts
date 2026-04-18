import type {
	Focusable,
	WindowManagerOptions,
	TerminalMouseEvent,
	KeyContext,
	KeyBindHandler,
} from './types.mjs';
import { Screen } from './Screen.mjs';
import { Window } from './Window.mjs';
import { setErrorHandler } from './ErrorHolder.mjs';

// ── Internal types ────────────────────────────────────────────────────────────

/** A registered focusable control with its computed absolute screen position. */
interface FocusEntry {
	control: Focusable & Window;
	/** 0-based absolute column on the screen. */
	absX: number;
	/** 0-based absolute row on the screen. */
	absY: number;
}

/** One level of the modal dialog stack. */
interface DialogLevel {
	dialog: Window;
	entries: FocusEntry[];
	focusIndex: number;
}

// ── Key parsing ───────────────────────────────────────────────────────────────

/**
 * Parses a raw stdin Buffer into an array of key strings.
 * Regular characters are emitted as-is; escape sequences (CSI, SS3) are
 * captured as multi-character strings (e.g. '\x1b[A' for the up arrow).
 */
function parseKeys(data: Buffer): string[] {
	const keys: string[] = [];
	let i = 0;

	while (i < data.length) {
		const byte = data[i];

		if (byte !== 0x1b) {
			// UTF-8 multi-byte character start (0xC2–0xF4).
			if (byte >= 0xc2 && byte <= 0xf4) {
				const len = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
				const end = Math.min(i + len, data.length);
				keys.push(data.subarray(i, end).toString('utf8'));
				i = end;
			} else {
				keys.push(String.fromCharCode(byte));
				i++;
			}
			continue;
		}

		// Escape byte (0x1B).
		if (i + 1 >= data.length) {
			keys.push('\x1b');
			i++;
			continue;
		}

		const next = data[i + 1];

		if (next === 0x5b) {
			// CSI sequence: ESC [ <params> <final>
			// Final byte is in range 0x40–0x7E.
			let j = i + 2;
			while (j < data.length && (data[j] < 0x40 || data[j] > 0x7e)) j++;
			if (j < data.length) {
				keys.push(data.subarray(i, j + 1).toString('utf8'));
				i = j + 1;
			} else {
				keys.push('\x1b');
				i++;
			}
		} else if (next === 0x4f) {
			// SS3 sequence: ESC O <char> (F1–F4).
			if (i + 2 < data.length) {
				keys.push(data.subarray(i, i + 3).toString('utf8'));
				i += 3;
			} else {
				keys.push('\x1b');
				i++;
			}
		} else {
			// Lone ESC (or unrecognised Alt combo — emit just ESC).
			keys.push('\x1b');
			i++;
		}
	}

	return keys;
}

/**
 * Attempts to parse an SGR mouse escape sequence.
 * SGR format: \x1b[<btn;x;yM (press) or \x1b[<btn;x;ym (release / move).
 * Returns null if the key string is not a mouse sequence.
 */
function parseMouseEvent(key: string): TerminalMouseEvent | null {
	const m = key.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
	if (!m) return null;

	const raw    = parseInt(m[1], 10);
	const x      = parseInt(m[2], 10) - 1; // terminal uses 1-based coords
	const y      = parseInt(m[3], 10) - 1;
	const press  = m[4] === 'M';
	const isMove = (raw & 32) !== 0;

	return {
		type:   isMove ? 'move' : press ? 'press' : 'release',
		button: raw & 3,
		x,
		y,
		shift: (raw & 4)  !== 0,
		alt:   (raw & 8)  !== 0,
		ctrl:  (raw & 16) !== 0,
	};
}

// ── Key spec parsing ──────────────────────────────────────────────────────────

/** Lookup table of friendly key names → raw terminal key strings.
 *  Used by `bindKey` so callers can write `'ctrl+s'` or `'enter'` instead
 *  of `'\x13'` / `'\r'`. Arrow keys, function keys, etc. stay raw. */
const KEY_ALIASES: Record<string, string> = {
	enter:     '\r',
	return:    '\r',
	space:     ' ',
	esc:       '\x1b',
	escape:    '\x1b',
	tab:       '\t',
	backspace: '\x7f',
	del:       '\x7f',
	delete:    '\x1b[3~',
	up:        '\x1b[A',
	down:      '\x1b[B',
	right:     '\x1b[C',
	left:      '\x1b[D',
	home:      '\x1b[H',
	end:       '\x1b[F',
	pageup:    '\x1b[5~',
	pagedown:  '\x1b[6~',
};

/** Normalises a caller-provided key spec into the raw key string emitted by
 *  the terminal. Accepts raw strings (`'\r'`, `'a'`), friendly names
 *  (`'enter'`, `'space'`, `'up'`), and `'ctrl+<letter>'` combinations.
 *  Everything else is returned unchanged. */
function normaliseKeySpec(spec: string): string {
	if (spec.length <= 1) return spec;
	const lower = spec.toLowerCase();
	if (lower in KEY_ALIASES) return KEY_ALIASES[lower]!;

	// `ctrl+<letter>` → ASCII control code (\x01 = Ctrl+A … \x1a = Ctrl+Z).
	const ctrlMatch = /^ctrl\+([a-z])$/.exec(lower);
	if (ctrlMatch) {
		const letter = ctrlMatch[1]!.charCodeAt(0);
		return String.fromCharCode(letter - 'a'.charCodeAt(0) + 1);
	}
	return spec;
}

// ── WindowManager ─────────────────────────────────────────────────────────────

/** Manages the application input loop, focus, and modal dialogs.
 *
 * Usage:
 *   1. Create a Screen and add windows/controls to it.
 *   2. Instantiate WindowManager and call register() for each focusable control.
 *   3. Call run() to start the event loop.
 *
 * Focus is cycled with Tab / Shift-Tab. Keys are dispatched to the focused
 * control's handleKey() method. Ctrl+C (or a configured exitKey) stops the loop.
 */
export class WindowManager {
	private screen: Screen;
	private exitKeys: string[];
	private onExit?: () => void;
	private onKey?: (key: string, ctx: KeyContext) => boolean | void;
	private onMouse?: (event: TerminalMouseEvent) => void;
	private mouseEnabled: boolean;
	/** Optional sink for render-time exceptions thrown by descendant windows.
	 *  Installed into the global ErrorHolder on construction (cleared on
	 *  stop). When unset, `Window.render()` rethrows instead of swallowing. */
	private onError?: (err: unknown, control: Window) => void;
	/** When non-null, focus navigation (`focusNext/Prev/First/Last`, Tab cycle)
	 *  is constrained to focusable controls whose absolute position falls
	 *  inside a descendant of this window. Set by `trapFocus`; cleared by the
	 *  release callback it returns. */
	private focusTrap: Window | null = null;

	/** Registered bindings mapped by raw key string.
	 *  Multiple handlers for the same key fire in insertion order; the first
	 *  one that returns `true` marks the event as consumed. */
	private keyBindings: Map<string, KeyBindHandler[]> = new Map();

	private mainEntries: FocusEntry[];
	private mainFocusIndex: number;
	private dialogStack: DialogLevel[];
	private running: boolean;
	/** True while pause() is in effect and resume() has not yet reclaimed the
	 *  terminal. Distinct from `running`: a paused WindowManager is still
	 *  considered running — `stop()` can finalise it, and all registered
	 *  focus entries remain intact for resume(). */
	private paused: boolean = false;

	/** Bound reference kept so we can remove the listener in stop(). */
	private boundHandleInput: (data: Buffer) => void;
	/** Bound SIGTERM handler for clean shutdown. */
	private boundSigterm: () => void;
	/** True when run() entered the alt-screen on its own (so stop() owes it an exit). */
	private ownsAltScreen: boolean = false;
	/** True when run() hid the cursor on its own (so stop() owes it a restore). */
	private ownsCursor: boolean = false;
	/** Set by pause() when it exited the alternate screen buffer — instructs
	 *  resume() to re-enter. Cleared after resume() or stop() uses it. */
	private pauseRestoreAltScreen: boolean = false;
	/** Set by pause() when it showed a previously-hidden cursor — instructs
	 *  resume() to hide it again. Cleared after resume() or stop() uses it. */
	private pauseRestoreCursorHidden: boolean = false;

	/** Creates a WindowManager for the given Screen.
	 *  Does not start the input loop; call run() to begin. */
	public constructor(screen: Screen, options?: WindowManagerOptions) {
		this.screen       = screen;
		this.exitKeys     = options?.exitKeys ?? ['\x03']; // Ctrl+C
		this.onExit       = options?.onExit;
		this.onKey        = options?.onKey;
		this.onMouse      = options?.onMouse;
		this.mouseEnabled = options?.mouse ?? false;
		this.onError      = options?.onError;

		if (this.onError) {
			setErrorHandler((err, control) => this.onError?.(err, control));
		}

		this.mainEntries   = [];
		this.mainFocusIndex = -1;
		this.dialogStack   = [];
		this.running       = false;

		this.boundHandleInput = this.handleInput.bind(this);
		this.boundSigterm     = () => this.stop();
	}

	// ── Registration ───────────────────────────────────────────────────────────

	/** Registers a focusable control for Tab-cycling in the main (non-dialog) context.
	 *  Pass the chain of parent Windows so the absolute screen position can be computed
	 *  for mouse hit-testing (innermost parent first, outermost last is NOT required —
	 *  just pass them in nesting order from the control outward). */
	public register(control: Focusable & Window, ...parents: Window[]): void {
		const absX = parents.reduce((acc, p) => acc + p.x, 0) + control.x;
		const absY = parents.reduce((acc, p) => acc + p.y, 0) + control.y;
		this.mainEntries.push({ control, absX, absY });
	}

	/** Removes a previously registered control from the main focus list. */
	public unregister(control: Focusable & Window): void {
		const idx = this.mainEntries.findIndex(e => e.control === control);
		if (idx !== -1) this.mainEntries.splice(idx, 1);
		if (this.mainFocusIndex >= this.mainEntries.length) {
			this.mainFocusIndex = this.mainEntries.length - 1;
		}
	}

	// ── Focus ──────────────────────────────────────────────────────────────────

	/** Returns the currently focused control, or null if no control has focus. */
	public getFocused(): (Focusable & Window) | null {
		const entries = this.activeEntries();
		const idx     = this.getActiveFocusIndex();
		return idx >= 0 ? entries[idx].control : null;
	}

	/** Moves focus to the given control if it belongs to the active context and is
	 *  eligible (not disabled, not hidden via setVisible(false)). When a focus
	 *  trap is installed, the candidate must also be a descendant of the trap
	 *  — otherwise the call is a no-op. */
	public setFocus(control: Focusable & Window): void {
		const entries = this.activeEntries();
		const idx     = entries.findIndex(e => e.control === control);
		if (idx === -1) return;
		const candidate = entries[idx].control;
		if (candidate.isDisabled() || !candidate.isVisible()) return;
		if (this.focusTrap && !this.isWithinTrap(candidate)) return;
		this.blurCurrent();
		this.setActiveFocusIndex(idx);
		control.setFocused(true);
	}

	/** Moves focus to the next eligible control (forward cycle), skipping
	 *  disabled, hidden, and out-of-trap entries. Equivalent to the Tab key. */
	public focusNext(): void {
		this.moveFocus(1);
	}

	/** Moves focus to the previous eligible control (reverse cycle), skipping
	 *  disabled, hidden, and out-of-trap entries. Equivalent to Shift-Tab. */
	public focusPrev(): void {
		this.moveFocus(-1);
	}

	/** Focuses the first eligible control in the active context. No-op when
	 *  no control is eligible. */
	public focusFirst(): void {
		this.focusAtEdge('first');
	}

	/** Focuses the last eligible control in the active context. */
	public focusLast(): void {
		this.focusAtEdge('last');
	}

	/** Focuses the control registered with the given `id` (copied from
	 *  `WindowProperties.id` / YAML `id:`). Searches the active focus context
	 *  only; returns `true` on success, `false` when no matching control is
	 *  registered or the match is ineligible. */
	public focusById(id: string): boolean {
		const entries = this.activeEntries();
		for (const entry of entries) {
			if (entry.control.getId() !== id) continue;
			if (!this.isFocusable(entry.control))        return false;
			if (this.focusTrap && !this.isWithinTrap(entry.control)) return false;
			this.blurCurrent();
			this.setActiveFocusIndex(entries.indexOf(entry));
			entry.control.setFocused(true);
			return true;
		}
		return false;
	}

	/** Constrains focus navigation to descendants of `within`. While active,
	 *  `focusNext / focusPrev / focusFirst / focusLast / setFocus / focusById`
	 *  skip any control that is not a descendant of `within`; Tab / Shift-Tab
	 *  cycle within the trapped subtree only. Nested calls stack in LIFO
	 *  order via the returned release function — calling the release restores
	 *  the previous trap (or clears it when this was the outermost). The
	 *  helper is independent of the modal dialog stack, so it can be used
	 *  for composite controls that live inside the main context. */
	public trapFocus(within: Window): () => void {
		const previous = this.focusTrap;
		this.focusTrap = within;
		return () => {
			if (this.focusTrap === within) {
				this.focusTrap = previous;
			}
		};
	}

	/** Returns the Window that currently defines the focus trap, or null when
	 *  no trap is active. Exposed primarily for tests and diagnostics. */
	public getFocusTrap(): Window | null {
		return this.focusTrap;
	}

	// ── Global key bindings (P0-4) ─────────────────────────────────────────────

	/** Registers a global shortcut handler.
	 *
	 *  The handler fires **before** the focused control receives the key; if it
	 *  returns `true`, the key is marked as consumed (no dispatch to the
	 *  focused control, no exit-key check, no focus navigation). Return
	 *  `false`/`void` to let the key continue through the pipeline — useful
	 *  for observer-only handlers that want to track keys without blocking.
	 *
	 *  `keySpec` accepts friendly names (`'enter'`, `'space'`, `'esc'`,
	 *  `'ctrl+s'`, arrow names) as well as raw terminal strings
	 *  (`'\r'`, `'q'`, `'\x1b[A'`). Multiple handlers can be bound to the same
	 *  key — they fire in insertion order until one consumes the event.
	 *
	 *  Returns an unbind function that removes *this particular* registration. */
	public bindKey(keySpec: string, handler: KeyBindHandler): () => void {
		const key = normaliseKeySpec(keySpec);
		const list = this.keyBindings.get(key);
		if (list) list.push(handler);
		else this.keyBindings.set(key, [handler]);

		return () => this.unbindKey(keySpec, handler);
	}

	/** Removes a handler previously registered with `bindKey`. When `handler`
	 *  is omitted, all handlers for the given key are removed. Returns `true`
	 *  when at least one handler was removed. */
	public unbindKey(keySpec: string, handler?: KeyBindHandler): boolean {
		const key = normaliseKeySpec(keySpec);
		const list = this.keyBindings.get(key);
		if (!list) return false;

		if (handler === undefined) {
			this.keyBindings.delete(key);
			return true;
		}

		const idx = list.indexOf(handler);
		if (idx === -1) return false;
		list.splice(idx, 1);
		if (list.length === 0) this.keyBindings.delete(key);
		return true;
	}

	// ── Dialog ─────────────────────────────────────────────────────────────────

	/** Opens a modal dialog: blurs the current context, adds the dialog Window to
	 *  the Screen, and activates a new focus context for the provided controls.
	 *
	 *  @param dialog   - The Window to display (will be added to Screen via addChild).
	 *  @param controls - Array of { control, parents? } entries within the dialog.
	 *                    parents are Windows between the dialog and the control, used
	 *                    to compute absolute screen positions for mouse hit-testing. */
	public openDialog(
		dialog: Window,
		controls: ReadonlyArray<{ control: Focusable & Window; parents?: Window[] }>,
	): void {
		this.blurCurrent();
		this.screen.addChild(dialog);

		const entries: FocusEntry[] = controls.map(({ control, parents = [] }) => ({
			control,
			absX: dialog.x + parents.reduce((acc, p) => acc + p.x, 0) + control.x,
			absY: dialog.y + parents.reduce((acc, p) => acc + p.y, 0) + control.y,
		}));

		this.dialogStack.push({ dialog, entries, focusIndex: -1 });
		this.initializeFocus();
		this.renderFrame();
	}

	/** Closes the topmost modal dialog, removes it from the Screen, and restores
	 *  the previous focus context. */
	public closeDialog(): void {
		const level = this.dialogStack.pop();
		if (!level) return;

		// Blur whichever control had focus inside the dialog.
		const idx = level.focusIndex;
		if (idx >= 0 && idx < level.entries.length) {
			level.entries[idx].control.setFocused(false);
		}

		this.screen.removeChild(level.dialog);

		// Re-focus whatever was focused in the restored context.
		const entries = this.activeEntries();
		const fi      = this.getActiveFocusIndex();
		if (fi >= 0 && fi < entries.length) {
			entries[fi].control.setFocused(true);
		}

		this.renderFrame();
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────

	/** Starts the input loop: enables raw mode, optional mouse tracking, and renders
	 *  the initial frame. The method returns immediately; events are handled
	 *  asynchronously via stdin. */
	public run(): void {
		if (this.running) return;
		this.running = true;

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();
		process.stdin.on('data', this.boundHandleInput);
		process.once('SIGTERM', this.boundSigterm);

		// Defer alt-screen / cursor hiding to Screen so consumers using
		// ScreenOptions don't get them double-toggled. We only "own" the toggle
		// (and therefore have to undo it in stop()) when the Screen wasn't
		// already in that state — for instance because the user constructed it
		// with `altScreen: true`, in which case the alt buffer should outlive
		// stop() until Screen.dispose() runs.
		if (!this.screen.isAltScreenActive()) {
			this.screen.enterAltScreen();
			this.ownsAltScreen = true;
		}
		if (this.mouseEnabled) {
			// Enable button-press tracking + SGR extended coordinates.
			process.stdout.write('\x1b[?1000h\x1b[?1006h');
		}
		if (!this.screen.isCursorHidden()) {
			this.screen.hideHardwareCursor();
			this.ownsCursor = true;
		}

		this.initializeFocus();
		this.renderFrame();
	}

	/** Stops the input loop, restores terminal state, and fires the onExit callback.
	 *  Safe to call even when the loop was not started (skips terminal teardown).
	 *  When called while paused, the parts that pause() already released
	 *  (stdin listener, raw mode, mouse tracking) are not re-teardown'd — only
	 *  the remaining owned state (alt-screen, cursor, SIGTERM listener) is
	 *  finalised. */
	public stop(): void {
		const wasRunning = this.running;
		const wasPaused  = this.paused;
		this.running     = false;
		this.paused      = false;

		if (wasRunning) {
			if (!wasPaused) {
				process.stdin.off('data', this.boundHandleInput);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(false);
				}
				process.stdin.pause();
				if (this.mouseEnabled) {
					process.stdout.write('\x1b[?1006l\x1b[?1000l');
				}
			}
			process.off('SIGTERM', this.boundSigterm);

			if (this.ownsCursor) {
				this.screen.showHardwareCursor();
				this.ownsCursor = false;
			}
			if (this.ownsAltScreen) {
				this.screen.exitAltScreen();
				this.ownsAltScreen = false;
			}
			// Drop any latent pause-restore intents so a future run() starts fresh.
			this.pauseRestoreAltScreen    = false;
			this.pauseRestoreCursorHidden = false;
		}

		if (this.onError) setErrorHandler(undefined);

		this.onExit?.();
	}

	/** Suspends the input loop without tearing down the focus tree. Releases the
	 *  terminal ownership the WindowManager needs for interactive mode:
	 *
	 *  - detaches the stdin 'data' listener, leaves raw mode, pauses stdin;
	 *  - disables mouse tracking when it was enabled;
	 *  - restores the hardware cursor when it was hidden (so an external
	 *    process has a visible cursor);
	 *  - optionally exits the alternate screen buffer
	 *    (`{ leaveAltScreen: true }`).
	 *
	 *  The typical use is spawning `$EDITOR` or a shell: pause, exec, resume.
	 *  All registered focus entries, dialog stack, and the onKey/bindKey
	 *  bindings are preserved, so `resume()` brings the UI back without a
	 *  full re-registration. No-op when the manager is not running or is
	 *  already paused. */
	public pause(options?: { leaveAltScreen?: boolean }): void {
		if (!this.running || this.paused) return;
		this.paused = true;

		process.stdin.off('data', this.boundHandleInput);
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();

		if (this.mouseEnabled) {
			process.stdout.write('\x1b[?1006l\x1b[?1000l');
		}

		this.pauseRestoreCursorHidden = this.screen.isCursorHidden();
		if (this.pauseRestoreCursorHidden) {
			this.screen.showHardwareCursor();
		}

		this.pauseRestoreAltScreen = false;
		if (options?.leaveAltScreen && this.screen.isAltScreenActive()) {
			this.screen.exitAltScreen();
			this.pauseRestoreAltScreen = true;
		}
	}

	/** Resumes the input loop after pause(). Re-enters the alternate screen if
	 *  pause() left it, re-enables mouse tracking, re-hides the cursor when
	 *  pause() showed it, restores raw mode + stdin listener, and re-renders
	 *  the current frame unless `{ rerender: false }` is passed. No-op when
	 *  the manager is not currently paused. */
	public resume(options?: { rerender?: boolean }): void {
		if (!this.paused) return;
		this.paused = false;

		if (this.pauseRestoreAltScreen) {
			this.screen.enterAltScreen();
			this.pauseRestoreAltScreen = false;
		}

		if (this.mouseEnabled) {
			process.stdout.write('\x1b[?1000h\x1b[?1006h');
		}

		if (this.pauseRestoreCursorHidden) {
			this.screen.hideHardwareCursor();
			this.pauseRestoreCursorHidden = false;
		}

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();
		process.stdin.on('data', this.boundHandleInput);

		if (options?.rerender !== false) {
			this.renderFrame();
		}
	}

	/** Returns true while pause() is active and resume() has not yet been
	 *  called. A paused manager still has its `run()` context (focus
	 *  registrations, dialog stack, exit keys) intact. */
	public isPaused(): boolean {
		return this.paused;
	}

	// ── Input handling ─────────────────────────────────────────────────────────

	/** Processes a raw stdin Buffer. Exposed as public so tests can drive it directly
	 *  without needing a real TTY. Tab / Shift-Tab navigation works even before run()
	 *  because moveFocus() handles the "no current focus" case. Dispatching to a
	 *  control triggers lazy focus initialization so the key reaches the right target. */
	public handleInput(data: Buffer): void {
		for (const key of parseKeys(data)) {
			// Check for mouse event first (SGR sequence starting with \x1b[<).
			if (this.mouseEnabled) {
				const mouse = parseMouseEvent(key);
				if (mouse) {
					this.onMouse?.(mouse);
					this.handleMouseEvent(mouse);
					continue;
				}
			}

			// Build a KeyContext snapshot for global handlers. The focused
			// control is captured before any handler fires so handlers see a
			// consistent view even when they mutate focus.
			const ctx: KeyContext = {
				focusedControl: this.getFocused(),
				inDialog:       this.dialogStack.length > 0,
				dialogDepth:    this.dialogStack.length,
			};

			// Fire global shortcut handlers first (P0-4). Any handler returning
			// `true` marks the key as consumed — exit-key check, focus
			// navigation, and dispatch to the focused control are all skipped.
			if (this.dispatchGlobalKey(key, ctx)) {
				this.renderFrame();
				continue;
			}

			// Exit keys.
			if (this.exitKeys.includes(key)) {
				this.stop();
				return;
			}

			// Focus navigation – moveFocus handles index -1 correctly.
			// Controls that want Tab to flow into handleKey (e.g. TextArea with
			// insertTabAsSpaces) opt in via Focusable.capturesTab().
			if (key === '\t') {
				const focused = ctx.focusedControl;
				if (!focused?.capturesTab?.()) {
					this.moveFocus(1);
					this.renderFrame();
					continue;
				}
				// Fall through — let the focused control's handleKey see Tab.
			} else if (key === '\x1b[Z') { // Shift-Tab — always cycles focus.
				this.moveFocus(-1);
				this.renderFrame();
				continue;
			}

			// Dispatch to focused control.
			// Lazy init here so Tab tests can rely on -1 start without double-move.
			if (this.getActiveFocusIndex() < 0) {
				this.initializeFocus();
			}
			const entries = this.activeEntries();
			const fi      = this.getActiveFocusIndex();
			const entry   = entries[fi];
			if (entry?.control.handleKey) {
				entry.control.handleKey(key);
				this.renderFrame();
			}
		}
	}

	/** Runs registered `bindKey` handlers and the global `onKey` callback
	 *  for the given key. Returns `true` when the event was consumed. */
	private dispatchGlobalKey(key: string, ctx: KeyContext): boolean {
		const bound = this.keyBindings.get(key);
		if (bound) {
			// Copy before iterating so an unbindKey() call from within a handler
			// doesn't skip the next handler in the list.
			for (const handler of bound.slice()) {
				if (handler(ctx) === true) return true;
			}
		}
		if (this.onKey) {
			if (this.onKey(key, ctx) === true) return true;
		}
		return false;
	}

	// ── Private helpers ────────────────────────────────────────────────────────

	/** Returns the FocusEntry array for the active context (topmost dialog or main). */
	private activeEntries(): FocusEntry[] {
		if (this.dialogStack.length > 0) {
			return this.dialogStack[this.dialogStack.length - 1].entries;
		}
		return this.mainEntries;
	}

	/** Returns the focus index for the active context. */
	private getActiveFocusIndex(): number {
		if (this.dialogStack.length > 0) {
			return this.dialogStack[this.dialogStack.length - 1].focusIndex;
		}
		return this.mainFocusIndex;
	}

	/** Sets the focus index for the active context. */
	private setActiveFocusIndex(index: number): void {
		if (this.dialogStack.length > 0) {
			this.dialogStack[this.dialogStack.length - 1].focusIndex = index;
		} else {
			this.mainFocusIndex = index;
		}
	}

	/** Removes focus from the currently focused control without moving it elsewhere. */
	private blurCurrent(): void {
		const entries = this.activeEntries();
		const fi      = this.getActiveFocusIndex();
		if (fi >= 0 && fi < entries.length) {
			entries[fi].control.setFocused(false);
		}
	}

	/** Returns true when the control is eligible to receive focus in the current
	 *  context — neither disabled nor hidden via `Window.setVisible(false)`,
	 *  and inside the active focus trap (if any). */
	private isFocusable(control: Focusable & Window): boolean {
		if (control.isDisabled() || !control.isVisible()) return false;
		if (this.focusTrap && !this.isWithinTrap(control)) return false;
		return true;
	}

	/** Depth-first check: is `control` the trap window itself or one of its
	 *  descendants? Used when `focusTrap` is installed to filter focus
	 *  candidates. Cheaper than storing parent pointers because the subtree
	 *  is usually small (the trap is a dialog or composite control). */
	private isWithinTrap(control: Window): boolean {
		if (!this.focusTrap) return true;
		return this.isDescendant(control, this.focusTrap);
	}

	/** Returns true when `node` is `root` or is reachable by walking
	 *  `root.getChildren()` recursively. */
	private isDescendant(node: Window, root: Window): boolean {
		if (node === root) return true;
		for (const child of root.getChildren()) {
			if (this.isDescendant(node, child)) return true;
		}
		return false;
	}

	/** Moves focus to the first or last eligible control in the active
	 *  context. Shared implementation for `focusFirst` / `focusLast`. */
	private focusAtEdge(edge: 'first' | 'last'): void {
		const entries = this.activeEntries();
		if (entries.length === 0) return;
		const order = edge === 'first'
			? entries.map((_, i) => i)
			: entries.map((_, i) => entries.length - 1 - i);
		for (const idx of order) {
			if (!this.isFocusable(entries[idx]!.control)) continue;
			this.blurCurrent();
			this.setActiveFocusIndex(idx);
			entries[idx]!.control.setFocused(true);
			return;
		}
	}

	/** Finds the first already-focused (or first eligible) control and focuses it. */
	private initializeFocus(): void {
		const entries = this.activeEntries();
		if (entries.length === 0) return;

		// Prefer a control that is already marked as focused.
		for (let i = 0; i < entries.length; i++) {
			if (entries[i].control.isFocused() && this.isFocusable(entries[i].control)) {
				this.setActiveFocusIndex(i);
				return;
			}
		}

		// Otherwise focus the first eligible control.
		for (let i = 0; i < entries.length; i++) {
			if (this.isFocusable(entries[i].control)) {
				this.setActiveFocusIndex(i);
				entries[i].control.setFocused(true);
				return;
			}
		}
	}

	/** Moves focus by delta (+1 for Tab, -1 for Shift-Tab), skipping disabled
	 *  and hidden controls. */
	private moveFocus(delta: number): void {
		const entries = this.activeEntries();
		if (entries.length === 0) return;

		const current = this.getActiveFocusIndex();
		// Blur current control.
		if (current >= 0 && current < entries.length) {
			entries[current].control.setFocused(false);
		}

		const count = entries.length;
		let next     = current < 0 ? (delta > 0 ? -1 : count) : current;
		let attempts = 0;

		do {
			next = ((next + delta) % count + count) % count;
			attempts++;
		} while (!this.isFocusable(entries[next].control) && attempts <= count);

		if (this.isFocusable(entries[next].control)) {
			this.setActiveFocusIndex(next);
			entries[next].control.setFocused(true);
		}
	}

	/** Handles a parsed mouse event: left click moves focus to the clicked control. */
	private handleMouseEvent(event: TerminalMouseEvent): void {
		if (event.type !== 'press' || event.button !== 0) return;

		const entries = this.activeEntries();
		for (let i = 0; i < entries.length; i++) {
			const { control, absX, absY } = entries[i];
			if (!this.isFocusable(control)) continue;
			const { width, height } = control.getSize();
			if (
				event.x >= absX && event.x < absX + width &&
				event.y >= absY && event.y < absY + height
			) {
				this.blurCurrent();
				this.setActiveFocusIndex(i);
				control.setFocused(true);
				this.renderFrame();
				return;
			}
		}
	}

	/** Renders a frame to the screen. */
	private renderFrame(): void {
		this.screen.render();
	}
}
