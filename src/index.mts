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
export { VirtualCursor, DEFAULT_CURSOR_SYMBOL } from './Screen/VirtualCursor.mjs';

// ── Geometry ──────────────────────────────────────────────────────────────────
export { Pos }                            from './Screen/Pos.mjs';
export { Pct, pct }                       from './Screen/Pos.mjs';
export { Size, FlexDim, ContentDim,
         flex, content }                  from './Screen/Size.mjs';

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
export { Toast }          from './Screen/controls/Toast.mjs';

// ── YAML layout builder ───────────────────────────────────────────────────────
export { InterfaceBuilder } from './Screen/InterfaceBuilder.mjs';

// ── Unicode text width helpers ────────────────────────────────────────────────
export { charWidth, stringWidth, setPuaWidth, getPuaWidth } from './Screen/textWidth.mjs';

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
	BUILTIN_TEXT_SELECTION,
	BUILTIN_TOAST,
} from './Screen/types.mjs';

// ── Public type exports ───────────────────────────────────────────────────────
export type {
	// Primitive types
	Color,
	StyleId,
	Cell,
	CellAttributes,
	TerminalSize,
	ScreenOptions,
	ScreenFrameStats,
	AxisSpec,
	DimSpec,
	FlexBasis,
	LayoutMode,
	AlignItems,
	JustifyContent,
	Padding,
	PaddingSpec,
	Margin,
	MarginSpec,

	// Window / border
	BorderStyle,
	BorderChars,
	WindowBorder,
	WindowProperties,
	WriteTextOptions,
	WriteTextSegment,
	WriteTextInput,

	// Control properties
	ButtonProperties,
	TextBoxProperties,
	TextAreaProperties,
	CheckboxProperties,
	RadioProperties,
	StatusLEDProperties,
	ProgressBarProperties,
	ProgressBarVProperties,
	LineChartProperties,
	BarChartProperties,
	ListBoxProperties,
	ListBoxRenderContext,
	ListBoxRowSegment,
	ListBoxRowSegments,
	TabsProperties,
	SparklineProperties,
	SpinnerProperties,
	ToastPosition,
	ToastOptions,

	// Focus & input
	Focusable,
	TerminalMouseEvent,
	WindowManagerOptions,

	// Virtual cursor
	CursorBlink,
	VirtualCursorOptions,

	// InterfaceBuilder YAML schema
	YamlAxisValue,
	YamlPosSpec,
	YamlSizeSpec,
	YamlWindowType,
	YamlStyleDef,
	YamlWindowDef,
	YamlLayout,
	CustomTypeContext,
	CustomTypeFactory,
} from './Screen/types.mjs';
