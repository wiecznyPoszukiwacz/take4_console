import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
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

type LedState = 'ok' | 'warn' | 'error' | 'off';

// ── Entry point ───────────────────────────────────────────────────────────────

/** Renders the controls demo. */
const main = async (): Promise<void> => {
	const screen  = new Screen();
	const { width, height } = screen.getSize();

	screen.fill(' ', screen.registerStyle({ background: 234 }));

	let demoTimer: NodeJS.Timeout | null = null;

	const wm = new WindowManager(screen, {
		exitKeys: ['q', '\x03'],
		onExit:   () => {
			if (demoTimer) clearInterval(demoTimer);
			process.exit(0);
		},
		mouse:    true,
	});

	const layoutPath = join(dirname(fileURLToPath(import.meta.url)), 'layout.yaml');
	const result = await new InterfaceBuilder().buildFromFile(layoutPath, screen, wm);

	// ── Header & status bar ───────────────────────────────────────────────────
	const headerStyle = screen.registerStyle({ background: 24, foreground: 255, bold: true });
	result.get('header')!.writeText(' take4_console  │  controls demo ', { style: headerStyle });

	const statusStyle = screen.registerStyle({ background: 24, foreground: 250 });
	result.get('statusBar')!.writeText(
		` ${width}×${height}  │  `
		+ 'Button  Checkbox  Radio  TextBox  '
		+ 'StatusLED  ProgressBar  ProgressBarV  LineChart  BarChart',
		{ style: statusStyle },
	);

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

	// ── Events list (tab 2) ──────────────────────────────────────────────────
	const events = result.get('eventsList') as ListBox;
	const EVENT_TEMPLATES = [
		'user logged in', 'cache warmed', 'metric collected', 'job completed',
		'config reloaded', 'heartbeat ok', 'worker spawned', 'session expired',
		'gc finished', 'index rebuilt',
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
		const msg   = EVENT_TEMPLATES[rand(EVENT_TEMPLATES.length)]!;
		const next  = [`[${timestamp()}] ${msg}`, ...events.getItems()];
		events.setItems(next.slice(0, 20));

		screen.render();
	};

	demoTimer = setInterval(tick, 1000);

	wm.run();
};

main();
