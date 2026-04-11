import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Screen } from './Screen/Screen.mjs';
import { WindowManager } from './Screen/WindowManager.mjs';
import { InterfaceBuilder } from './Screen/InterfaceBuilder.mjs';
import { LineChart } from './Screen/controls/LineChart.mjs';
import { BarChart }  from './Screen/controls/BarChart.mjs';

// ── Entry point ───────────────────────────────────────────────────────────────

/** Renders the controls demo. */
const main = async (): Promise<void> => {
	const screen  = new Screen();
	const { width, height } = screen.getSize();

	screen.fill(' ', screen.registerStyle({ background: 234 }));

	const wm = new WindowManager(screen, {
		exitKeys: ['q', '\x03'],
		onExit:   () => process.exit(0),
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
	lc.setData([5, 18, 8, 45, 22, 60, 38, 72, 50, 65]);

	const bc = result.get('barChart') as BarChart;
	bc.setData([80, 45, 62, 30, 75]);
	bc.setLabels(['A', 'B', 'C', 'D', 'E']);

	wm.run();
};

main();
