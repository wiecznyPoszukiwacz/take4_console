import type { Focusable, WindowManagerOptions, TerminalMouseEvent } from './types.mjs';
import { Screen } from './Screen.mjs';
import { Window } from './Window.mjs';

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
	private onKey?: (key: string) => void;
	private onMouse?: (event: TerminalMouseEvent) => void;
	private mouseEnabled: boolean;

	private mainEntries: FocusEntry[];
	private mainFocusIndex: number;
	private dialogStack: DialogLevel[];
	private running: boolean;

	/** Bound reference kept so we can remove the listener in stop(). */
	private boundHandleInput: (data: Buffer) => void;
	/** Bound SIGTERM handler for clean shutdown. */
	private boundSigterm: () => void;
	/** True when run() entered the alt-screen on its own (so stop() owes it an exit). */
	private ownsAltScreen: boolean = false;
	/** True when run() hid the cursor on its own (so stop() owes it a restore). */
	private ownsCursor: boolean = false;

	/** Creates a WindowManager for the given Screen.
	 *  Does not start the input loop; call run() to begin. */
	public constructor(screen: Screen, options?: WindowManagerOptions) {
		this.screen       = screen;
		this.exitKeys     = options?.exitKeys ?? ['\x03']; // Ctrl+C
		this.onExit       = options?.onExit;
		this.onKey        = options?.onKey;
		this.onMouse      = options?.onMouse;
		this.mouseEnabled = options?.mouse ?? false;

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

	/** Moves focus to the given control if it belongs to the active context and is enabled. */
	public setFocus(control: Focusable & Window): void {
		const entries = this.activeEntries();
		const idx     = entries.findIndex(e => e.control === control);
		if (idx === -1 || entries[idx].control.isDisabled()) return;
		this.blurCurrent();
		this.setActiveFocusIndex(idx);
		control.setFocused(true);
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
	 *  Safe to call even when the loop was not started (skips terminal teardown). */
	public stop(): void {
		const wasRunning = this.running;
		this.running     = false;

		if (wasRunning) {
			process.stdin.off('data', this.boundHandleInput);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
			process.stdin.pause();
			process.off('SIGTERM', this.boundSigterm);

			if (this.mouseEnabled) {
				process.stdout.write('\x1b[?1006l\x1b[?1000l');
			}
			if (this.ownsCursor) {
				this.screen.showHardwareCursor();
				this.ownsCursor = false;
			}
			if (this.ownsAltScreen) {
				this.screen.exitAltScreen();
				this.ownsAltScreen = false;
			}
		}

		this.onExit?.();
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

			this.onKey?.(key);

			// Exit keys.
			if (this.exitKeys.includes(key)) {
				this.stop();
				return;
			}

			// Focus navigation – moveFocus handles index -1 correctly.
			if (key === '\t') {
				this.moveFocus(1);
				this.renderFrame();
				continue;
			}
			if (key === '\x1b[Z') { // Shift-Tab
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

	/** Finds the first already-focused (or first non-disabled) control and focuses it. */
	private initializeFocus(): void {
		const entries = this.activeEntries();
		if (entries.length === 0) return;

		// Prefer a control that is already marked as focused.
		for (let i = 0; i < entries.length; i++) {
			if (entries[i].control.isFocused() && !entries[i].control.isDisabled()) {
				this.setActiveFocusIndex(i);
				return;
			}
		}

		// Otherwise focus the first enabled control.
		for (let i = 0; i < entries.length; i++) {
			if (!entries[i].control.isDisabled()) {
				this.setActiveFocusIndex(i);
				entries[i].control.setFocused(true);
				return;
			}
		}
	}

	/** Moves focus by delta (+1 for Tab, -1 for Shift-Tab), skipping disabled controls. */
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
		} while (entries[next].control.isDisabled() && attempts <= count);

		if (!entries[next].control.isDisabled()) {
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
			if (control.isDisabled()) continue;
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
