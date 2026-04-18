import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Screen } from './Screen/Screen.mjs';
import { WindowManager } from './Screen/WindowManager.mjs';
import { InterfaceBuilder } from './Screen/InterfaceBuilder.mjs';
import { LineChart }    from './Screen/controls/LineChart.mjs';
import { BarChart }     from './Screen/controls/BarChart.mjs';
import { StatusLED }    from './Screen/controls/StatusLED.mjs';
import { ProgressBar }  from './Screen/controls/ProgressBar.mjs';
import { ProgressBarV } from './Screen/controls/ProgressBarV.mjs';
import { Spinner }      from './Screen/controls/Spinner.mjs';
import { Sparkline }    from './Screen/controls/Sparkline.mjs';
import { ListBox }      from './Screen/controls/ListBox.mjs';
import { Tabs }         from './Screen/controls/Tabs.mjs';
import { TextBox }      from './Screen/controls/TextBox.mjs';
import { Window } from './Screen/Window.mjs';
import type { ListBoxRowSegments, WindowProperties, StyleId } from './Screen/types.mjs';

/** Custom Window subclass registered with InterfaceBuilder via
 *  `registerType('badge', …)` to demonstrate P0-10 — the factory resolves
 *  `props.text` / `props.color` from the YAML node and stashes them so the
 *  overridden render() can repaint the label every frame after the size is
 *  resolved by the parent layout pass. */
class Badge extends Window {
	private msg: string;
	private styleId: StyleId;

	/** Constructs a Badge with its visible text and pre-registered style id. */
	public constructor(wp: WindowProperties, msg: string, styleId: StyleId) {
		super(wp);
		this.msg     = msg;
		this.styleId = styleId;
	}

	/** Repaints the badge text before delegating to the default compositing pipeline. */
	public override render(): void {
		this.clear();
		this.writeText(this.msg, { x: 0, y: 0, style: this.styleId });
		super.render();
	}
}

type LedState = 'ok' | 'warn' | 'error' | 'off';
type EventLevel = 'ok' | 'warn' | 'error';

interface EventRow {
	timestamp: string;
	level:     EventLevel;
	message:   string;
	count:     number;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/** Renders the controls demo. */
const main = async (): Promise<void> => {
	// 0.19.0: Screen owns the alt-screen + cursor toggles, so WindowManager won't
	// re-enter them. dispose() runs on exit (via process.on('exit', …)) so the
	// terminal state is restored even when the user kills the process with a
	// signal that bypasses WindowManager.stop().
	const screen  = new Screen({ altScreen: true, hideCursor: true });
	let { width, height } = screen.getSize();

	screen.fill(' ', screen.registerStyle({ background: 234 }));

	let demoTimer: NodeJS.Timeout | null = null;

	const wm = new WindowManager(screen, {
		exitKeys: ['q', '\x03'],
		onExit:   () => {
			if (demoTimer) clearInterval(demoTimer);
			screen.dispose();
			process.exit(0);
		},
		mouse:    true,
		// P1-23 demo: whenever a descendant Window.render() raises, append a
		// red row to the events list instead of tearing down the TUI.
		onError:  (err, control) => {
			const list  = result.get('eventsList') as ListBox<EventRow>;
			const entry: EventRow = {
				timestamp: timestamp(),
				level:     'error',
				message:   `render fail (${control.getId() ?? 'unnamed'}): ${err instanceof Error ? err.message : String(err)}`,
				count:     1,
			};
			list.setItems([entry, ...list.getItems()].slice(0, 20));
		},
	});

	// 0.19.0: SIGWINCH autoresize. The Screen reflows percentage-based children
	// for us; the demo only needs to redraw the current-size label in the
	// status bar so the new geometry is visible at runtime.
	screen.on('resize', size => {
		width  = size.width;
		height = size.height;
		redrawStatusBar();
		screen.render();
	});

	const layoutPath = join(dirname(fileURLToPath(import.meta.url)), 'layout.yaml');
	const ib = new InterfaceBuilder();

	// P0-10 demo: register a user-defined 'badge' control so the header can
	// host a yellow "P0-10" label built from a class that never needed to be
	// baked into InterfaceBuilder's built-in switch.
	ib.registerType('badge', (node, ctx) => {
		const props = (node.props ?? {}) as { text?: string; color?: number };
		const styleId = screen.registerStyle({
			background: 24,
			foreground: props.color ?? 220,
			bold:       true,
		});
		return new Badge(ctx.wp, props.text ?? '', styleId);
	});

	// P0-6 demo: when the user presses Enter in the username field, push an
	// event into the log so the new onSubmit callback is visible at runtime.
	ib.registerCallback('usernameSubmitted', (...args: unknown[]) => {
		const value = String(args[0] ?? '');
		const list = result.get('eventsList') as ListBox<EventRow>;
		const entry: EventRow = {
			timestamp: timestamp(),
			level:     'ok',
			message:   `user submit: ${value}`,
			count:     1,
		};
		list.setItems([entry, ...list.getItems()].slice(0, 20));
		screen.render();
	});

	const result = await ib.buildFromFile(layoutPath, screen, wm);

	// ── Header & status bar ───────────────────────────────────────────────────
	// Header is rendered via writeMarkup() so the named styles in the registry drive
	// the per-word colouring. `hdr:*` names are registered for the demo and then
	// referenced from the template string — no manual StyleId threading.
	screen.setBuiltinStyle('hdr:app',  { background: 24, foreground: 231, bold: true });
	screen.setBuiltinStyle('hdr:mode', { background: 24, foreground: 153 });
	screen.setBuiltinStyle('hdr:sep',  { background: 24, foreground: 110 });
	const headerBase = screen.registerStyle({ background: 24 });
	result.get('header')!.writeMarkup(
		' {hdr:app}take4_console{/}  {hdr:sep}│{/}  {hdr:mode}controls demo{/} ',
		{ style: headerBase },
	);

	// Status bar demonstrates the new segmented writeText() — each shortcut label is
	// drawn in a distinct style while the cursor flows across segments without a
	// separate writeText() call per piece.
	const statusBase  = screen.registerStyle({ background: 24, foreground: 250 });
	const shortcutId  = screen.registerStyle({ background: 24, foreground: 220, bold: true });
	const sepId       = screen.registerStyle({ background: 24, foreground: 110 });
	const dimId       = screen.registerStyle({ background: 24, foreground: 244, dim: true });
	const helpId      = screen.registerStyle({ background: 24, foreground: 118, bold: true });
	const statusBar   = result.get('statusBar')!;

	// Toggled by the '?' global shortcut to flip the status bar into "help mode".
	let helpMode = false;

	/** Repaints the status bar so the live width × height label tracks SIGWINCH. */
	const redrawStatusBar = (): void => {
		statusBar.clear();
		if (helpMode) {
			statusBar.writeText([
				{ text: ' HELP ', style: helpId },
				{ text: '│', style: sepId },
				{ text: '  ' },
				{ text: '?',     style: shortcutId }, { text: ' toggle help  ' },
				{ text: 'Ctrl+R', style: shortcutId }, { text: ' random jiggle  ' },
				{ text: 'Ctrl+E', style: shortcutId }, { text: ' pause TUI  ' },
				{ text: 'v',     style: shortcutId }, { text: ' hide charts  ' },
				{ text: 'q',     style: shortcutId }, { text: ' quit ' },
			], { style: statusBase });
			return;
		}
		statusBar.writeText([
			{ text: ` ${width}×${height}  ` },
			{ text: '│', style: sepId },
			{ text: '  ' },
			{ text: 'Tab',   style: shortcutId }, { text: ' focus  ' },
			{ text: '←/→',   style: shortcutId }, { text: ' tabs   ' },
			{ text: 'Space', style: shortcutId }, { text: ' toggle  ' },
			{ text: 'v',     style: shortcutId }, { text: ' charts  ' },
			{ text: 'Ctrl+E', style: shortcutId }, { text: ' pause  ' },
			{ text: '?',     style: shortcutId }, { text: ' help  ' },
			{ text: 'q',     style: shortcutId }, { text: ' quit ' },
			{ text: ' · emoji 🚀 CJK 日本語 · ', style: dimId },
		], { style: statusBase });
	};
	redrawStatusBar();

	// P0-4 demo: '?' toggles the help line in the status bar (consumed, so it
	// never reaches the focused control). Ctrl+R re-jiggles the chart data
	// without waiting for the timer — shows that bindKey co-exists with the
	// regular key dispatch path as long as handlers return true.
	wm.bindKey('?', () => {
		helpMode = !helpMode;
		redrawStatusBar();
		return true;
	});

	// ── Resource labels in monitorPanel ──────────────────────────────────────
	const labelStyle  = screen.registerStyle({ foreground: 245 });
	const monitor = result.get('monitorPanel')!;
	monitor.writeText('CPU', { x: 1, y: 1, style: labelStyle });
	monitor.writeText('MEM', { x: 1, y: 3, style: labelStyle });
	monitor.writeText('DSK', { x: 1, y: 5, style: labelStyle });
	monitor.writeText('SYS', { x: -4, y: 0, style: labelStyle });

	// ── Chart data ────────────────────────────────────────────────────────────
	const lc = result.get('lineChart') as LineChart;
	let lineData: number[] = [5, 18, 8, 45, 22, 60, 38, 72, 50, 65];
	lc.setData(lineData);

	const bc = result.get('barChart') as BarChart;
	const barLabels: string[] = ['A', 'B', 'C', 'D', 'E'];
	bc.setData([80, 45, 62, 30, 75]);
	bc.setLabels(barLabels);

	// ── Sparkline trend buffers (rolling 30-sample history) ──────────────────
	const sparkCpu = result.get('sparkCpu') as Sparkline;
	const sparkMem = result.get('sparkMem') as Sparkline;
	const sparkDsk = result.get('sparkDsk') as Sparkline;
	let cpuHistory: number[] = Array.from({ length: 30 }, () => Math.floor(Math.random() * 100));
	let memHistory: number[] = Array.from({ length: 30 }, () => Math.floor(Math.random() * 100));
	let dskHistory: number[] = Array.from({ length: 30 }, () => Math.floor(Math.random() * 100));
	sparkCpu.setMin(0); sparkCpu.setMax(100); sparkCpu.setData(cpuHistory);
	sparkMem.setMin(0); sparkMem.setMax(100); sparkMem.setData(memHistory);
	sparkDsk.setMin(0); sparkDsk.setMax(100); sparkDsk.setData(dskHistory);

	// ── Sparkline labels (written into the Tabs container's content) ─────────
	const tabs      = result.get('chartsPanel') as Tabs;
	const sparkLblStyle = screen.registerStyle({ foreground: 245 });
	tabs.writeText('CPU', { x: 1, y: 2, style: sparkLblStyle });
	tabs.writeText('MEM', { x: 1, y: 3, style: sparkLblStyle });
	tabs.writeText('DSK', { x: 1, y: 4, style: sparkLblStyle });

	// ── Events list (with custom per-row renderer: icon + dimmed timestamp + right-aligned count) ─
	const events = result.get('eventsList') as ListBox<EventRow>;

	// Register the accent styles used by the custom row renderer.
	const iconOkStyle    = screen.registerStyle({ foreground: 82,  bold: true });
	const iconWarnStyle  = screen.registerStyle({ foreground: 214, bold: true });
	const iconErrorStyle = screen.registerStyle({ foreground: 196, bold: true });
	const tsStyle        = screen.registerStyle({ foreground: 244, dim: true });
	const countStyle     = screen.registerStyle({ foreground: 220 });

	const levelIcon = (lvl: EventLevel): { glyph: string; style: number } => {
		if (lvl === 'ok')    return { glyph: '✓', style: iconOkStyle };
		if (lvl === 'warn')  return { glyph: '⚠', style: iconWarnStyle };
		return                      { glyph: '✖', style: iconErrorStyle };
	};

	events.setRenderItem((row): ListBoxRowSegments => {
		const { glyph, style: iconSt } = levelIcon(row.level);
		return [
			{ text: `${glyph} `,         align: 'left',  style: iconSt },
			{ text: `[${row.timestamp}] `, align: 'left',  style: tsStyle },
			{ text: row.message,         align: 'left' },
			{ text: `×${row.count}`,     align: 'right', style: countStyle },
		];
	});

	// A few entries embed double-width emoji (UTF-16 surrogate pairs) so the
	// East-Asian-width-aware writeText() introduced in 0.17.0 is exercised
	// at runtime — wide glyphs occupy two consecutive buffer cells with a ''
	// continuation sentinel that Screen.render() skips.
	const EVENT_TEMPLATES: Array<{ level: EventLevel; message: string }> = [
		{ level: 'ok',    message: 'user logged in'     },
		{ level: 'ok',    message: 'cache warmed 🚀'    },
		{ level: 'ok',    message: 'metric collected'   },
		{ level: 'ok',    message: 'job completed 💾'   },
		{ level: 'warn',  message: 'config reloaded'    },
		{ level: 'ok',    message: 'heartbeat ok'       },
		{ level: 'ok',    message: 'worker spawned'     },
		{ level: 'warn',  message: 'session expired'    },
		{ level: 'ok',    message: 'gc finished'        },
		{ level: 'error', message: 'index rebuild fail' },
	];

	// ── Live-updating handles ─────────────────────────────────────────────────
	const pbCpu   = result.get('pbCpu')   as ProgressBar;
	const pbMem   = result.get('pbMem')   as ProgressBar;
	const pbDisk  = result.get('pbDisk')  as ProgressBar;
	const pbvLoad = result.get('pbvLoad') as ProgressBarV;

	const leds: StatusLED[] = [
		result.get('ledApi')    as StatusLED,
		result.get('ledDb')     as StatusLED,
		result.get('ledCache')  as StatusLED,
		result.get('ledWorker') as StatusLED,
	];

	const headerSpinner = result.get('headerSpinner') as Spinner;

	const ledStates: LedState[] = ['ok', 'ok', 'ok', 'warn', 'error', 'off'];

	/** Returns a random integer in [0, max). */
	const rand = (max: number): number => Math.floor(Math.random() * max);

	/** Formats the current wall-clock time as HH:MM:SS. */
	const timestamp = (): string => {
		const d = new Date();
		const pad = (n: number): string => n.toString().padStart(2, '0');
		return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	};

	/** Periodic tick: refresh charts, progress bars, status LEDs, sparklines, and event log. */
	const tick = (): void => {
		// scroll line chart left and append a new sample
		lineData = [...lineData.slice(1), rand(100)];
		lc.setData(lineData);

		// shuffle bar chart values
		bc.setData([rand(100), rand(100), rand(100), rand(100), rand(100)]);

		// jitter progress bars
		const cpu = rand(101);
		const mem = rand(101);
		const dsk = rand(101);
		pbCpu  .setValue(cpu);
		pbMem  .setValue(mem);
		pbDisk .setValue(dsk);
		pbvLoad.setValue(rand(101));

		// shift sparkline history buffers (the same samples as the progress bars)
		cpuHistory = [...cpuHistory.slice(1), cpu];
		memHistory = [...memHistory.slice(1), mem];
		dskHistory = [...dskHistory.slice(1), dsk];
		sparkCpu.setData(cpuHistory);
		sparkMem.setData(memHistory);
		sparkDsk.setData(dskHistory);

		// randomize LED states (weighted toward "ok")
		for (const led of leds) {
			led.setState(ledStates[rand(ledStates.length)]!);
		}

		// advance the header spinner
		headerSpinner.step();

		// prepend a new event to the log; keep the list bounded
		const tpl   = EVENT_TEMPLATES[rand(EVENT_TEMPLATES.length)]!;
		const entry: EventRow = {
			timestamp: timestamp(),
			level:     tpl.level,
			message:   tpl.message,
			count:     1 + rand(9),
		};
		const next = [entry, ...events.getItems()];
		events.setItems(next.slice(0, 20));

		screen.render();
	};

	demoTimer = setInterval(tick, 1000);

	// P0-4 demo (cont'd): Ctrl+R force-refreshes the charts out-of-band so the
	// key handler ordering is easy to observe — the TextBox in the layout never
	// receives a '\x12' control code.
	wm.bindKey('ctrl+r', () => {
		tick();
		return true;
	});

	// P0-8 demo: 'v' toggles the visibility of the charts panel. Hidden children
	// are fully skipped by render() (neither painted nor blitted), so the panel
	// vanishes leaving the dialog background in its place — and reappears
	// unchanged when shown again. The Tab focus cycle also skips focusables
	// inside a hidden subtree.
	const chartsPanel = result.get('chartsPanel') as Tabs;
	wm.bindKey('v', () => {
		chartsPanel.setVisible(!chartsPanel.isVisible());
		screen.render();
		return true;
	});

	// P0-5 demo: Ctrl+E pauses the WindowManager (drops the TUI), exits the
	// alternate screen buffer, and spawns a short inline shell so you can see
	// that the terminal is fully reusable for an external process. Pressing
	// Enter at the prompt returns to the TUI — resume() re-enters the alt
	// buffer, re-hides the cursor, re-enables mouse tracking, and re-renders
	// the frame. The focus / dialog stack / key bindings stay intact across
	// the cycle.
	// P1-18 demo: Ctrl+G jumps focus to the  Save button via its YAML id,
	// without the user having to Tab through every field in between.
	wm.bindKey('ctrl+g', () => {
		wm.focusById('btnSave');
		screen.render();
		return true;
	});

	// P1-22 demo: observe focus transitions on btnSave without subclassing —
	// the hooks append a short trail to the events list so the user can see
	// exactly when setFocus fires them.
	const btnSave = result.get('btnSave')!;
	btnSave.setOnFocus(() => {
		const list = result.get('eventsList') as ListBox<EventRow>;
		const entry: EventRow = { timestamp: timestamp(), level: 'ok', message: 'btnSave → focus', count: 1 };
		list.setItems([entry, ...list.getItems()].slice(0, 20));
	});
	btnSave.setOnBlur(() => {
		const list = result.get('eventsList') as ListBox<EventRow>;
		const entry: EventRow = { timestamp: timestamp(), level: 'warn', message: 'btnSave → blur', count: 1 };
		list.setItems([entry, ...list.getItems()].slice(0, 20));
	});

	wm.bindKey('ctrl+e', () => {
		wm.pause({ leaveAltScreen: true });
		process.stdout.write('\n--- paused take4_console TUI. Press Enter to return ---\n');
		spawnSync('bash', ['-c', 'read -r _'], { stdio: 'inherit' });
		wm.resume();
		return true;
	});

	// Virtual cursor: animated caret in TextBox/TextArea. The `tbEmail`
	// TextBox opts into slow blink via layout.yaml; here we flip the
	// `tbUsername` TextBox into the `irregular` mode so the two
	// side-by-side inputs show off two different rhythms. The
	// `enableCursorBlink()` call boots the periodic rerender that makes
	// the blink phases actually reach the terminal.
	const tbUsername = result.get('tbUsername') as TextBox | undefined;
	if (tbUsername) {
		tbUsername.getVirtualCursor().setSymbol('▏');
		tbUsername.getVirtualCursor().setBlink({ mode: 'irregular' });
		// P1-20 showcase: pre-select the initial value so the merged
		// selection style is visible on boot. Shift+Left/Right, Ctrl+A,
		// and plain arrows collapse it the moment the user interacts.
		const text = tbUsername.getValue();
		if (text.length > 0) tbUsername.setSelection(0, Math.min(3, text.length));
	}
	wm.enableCursorBlink(80);

	wm.run();
};

main();
