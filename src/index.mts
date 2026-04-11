import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Screen } from './Screen/Screen.mjs';
import { WindowManager } from './Screen/WindowManager.mjs';
import { InterfaceBuilder } from './Screen/InterfaceBuilder.mjs';

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

	// styled text that needs registered style IDs
	const headerStyle = screen.registerStyle({ background: 24, foreground: 255, bold: true });
	result.get('header')!.writeText(' take4_console  │  controls demo ', { style: headerStyle });

	const statusStyle = screen.registerStyle({ background: 24, foreground: 250 });
	result.get('statusBar')!.writeText(
		` ${width}×${height}  │  Button  Checkbox  Radio  TextBox  TextArea`,
		{ style: statusStyle },
	);

	wm.run();
};

main();
