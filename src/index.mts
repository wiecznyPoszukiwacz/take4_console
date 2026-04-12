// ── take4-console ─────────────────────────────────────────────────────────────
//
// Public library barrel. This file is the package's entry point and re-exports
// every class, type, and constant that library consumers are expected to use.
//
// Consumer usage:
//
//     import { Screen, Window, Pos, Size, Button } from 'take4-console';
//     import type { ButtonOptions, StyleId } from 'take4-console';
//

// ── Core ──────────────────────────────────────────────────────────────────────
export { Screen }         from './Screen/Screen.mjs';
export { Window }         from './Screen/Window.mjs';
export { Region }         from './Screen/Region.mjs';
export { StyleRegistry }  from './Screen/StyleRegistry.mjs';
export { WindowManager }  from './Screen/WindowManager.mjs';

// ── Geometry ──────────────────────────────────────────────────────────────────
export { Pos }            from './Screen/Pos.mjs';
export { Pct, pct }       from './Screen/Pos.mjs';
export { Size }           from './Screen/Size.mjs';

// ── Interactive controls ──────────────────────────────────────────────────────
export { Button }         from './Screen/controls/Button.mjs';
export { TextBox }        from './Screen/controls/TextBox.mjs';
export { TextArea }       from './Screen/controls/TextArea.mjs';
export { Checkbox }       from './Screen/controls/Checkbox.mjs';
export { Radio }          from './Screen/controls/Radio.mjs';
export { ListBox }        from './Screen/controls/ListBox.mjs';
export { Tabs }           from './Screen/controls/Tabs.mjs';

// ── Read-only display controls ────────────────────────────────────────────────
export { StatusLED }      from './Screen/controls/StatusLED.mjs';
export { ProgressBar }    from './Screen/controls/ProgressBar.mjs';
export { ProgressBarV }   from './Screen/controls/ProgressBarV.mjs';
export { LineChart }      from './Screen/controls/LineChart.mjs';
export { BarChart }       from './Screen/controls/BarChart.mjs';
export { Sparkline }      from './Screen/controls/Sparkline.mjs';
export { Spinner }        from './Screen/controls/Spinner.mjs';

// ── YAML layout builder ───────────────────────────────────────────────────────
export { InterfaceBuilder } from './Screen/InterfaceBuilder.mjs';

// ── Built-in style name constants ─────────────────────────────────────────────
export {
	BUILTIN_WINDOW_BG,
	BUILTIN_BORDER,
	BUILTIN_BORDER_FOCUSED,
	BUILTIN_BORDER_DISABLED,
	BUILTIN_TEXT,
	BUILTIN_TEXT_FOCUSED,
	BUILTIN_TEXT_DISABLED,
	BUILTIN_TEXT_PLACEHOLDER,
	BUILTIN_TEXT_CHECKED,
	BUILTIN_CURSOR,
} from './Screen/types.mjs';

// ── Public type exports ───────────────────────────────────────────────────────
export type {
	// Primitive types
	Color,
	StyleId,
	Cell,
	CellAttributes,
	TerminalSize,
	AxisSpec,
	DimSpec,

	// Window / border
	BorderStyle,
	WindowBorder,
	WindowOptions,
	WriteTextOptions,

	// Control options
	ControlOptions,
	ButtonOptions,
	TextBoxOptions,
	TextAreaOptions,
	CheckboxOptions,
	RadioOptions,
	StatusLEDOptions,
	ProgressBarOptions,
	ProgressBarVOptions,
	LineChartOptions,
	BarChartOptions,
	ListBoxOptions,
	TabsOptions,
	SparklineOptions,
	SpinnerOptions,

	// Focus & input
	Focusable,
	TerminalMouseEvent,
	WindowManagerOptions,

	// InterfaceBuilder YAML schema
	YamlAxisValue,
	YamlPosSpec,
	YamlSizeSpec,
	YamlWindowType,
	YamlStyleDef,
	YamlWindowDef,
	YamlLayout,
} from './Screen/types.mjs';
