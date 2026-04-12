/** Text and background color, expressed as ANSI color number (0–255) or hex string (e.g. '#ff0000'). */
export type Color = number | string;

// ── Built-in style names ──────────────────────────────────────────────────────

/** Name of the default background style used by windows and controls. */
export const BUILTIN_WINDOW_BG          = 'builtin:window-bg';
/** Name of the default border color style (foreground = border color). */
export const BUILTIN_BORDER             = 'builtin:border';
/** Name of the focused border color style. */
export const BUILTIN_BORDER_FOCUSED     = 'builtin:border-focused';
/** Name of the disabled border color style. */
export const BUILTIN_BORDER_DISABLED    = 'builtin:border-disabled';
/** Name of the normal text style used by controls. */
export const BUILTIN_TEXT               = 'builtin:text';
/** Name of the focused text style used by controls. */
export const BUILTIN_TEXT_FOCUSED       = 'builtin:text-focused';
/** Name of the disabled text style used by controls. */
export const BUILTIN_TEXT_DISABLED      = 'builtin:text-disabled';
/** Name of the placeholder text style used by text input controls. */
export const BUILTIN_TEXT_PLACEHOLDER   = 'builtin:text-placeholder';
/** Name of the checked/selected indicator style used by Checkbox and Radio. */
export const BUILTIN_TEXT_CHECKED       = 'builtin:text-checked';
/** Name of the cursor highlight style (inverse) used by text input controls. */
export const BUILTIN_CURSOR             = 'builtin:cursor';

/** Integer handle returned by StyleRegistry.register(). ID 0 always means no style (empty {}). */
export type StyleId = number;

/** Visual attributes for a single terminal cell. */
export interface CellAttributes {
  foreground?: Color;
  background?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  blink?: boolean;
  inverse?: boolean;
}

/** A single cell in the terminal grid. */
export interface Cell {
  /** Single character stored in this cell, or a space for blank. */
  char: string;
  /** Visual attributes applied to this cell. */
  attributes: CellAttributes;
}

/** Terminal dimensions expressed as columns × rows. */
export interface TerminalSize {
  width: number;
  height: number;
}

/** Box-drawing character style for window borders. */
export type BorderStyle = 'single' | 'double' | 'rounded';

/** Per-side border configuration. */
export interface WindowBorder {
  top?:    boolean;
  right?:  boolean;
  bottom?: boolean;
  left?:   boolean;
  /** Box-drawing style. Default: 'single'. */
  style?:  BorderStyle;
  /** Border color. Default: inherits from cell. */
  color?:  Color;
}

/** Window visual options passed to the constructor. */
export interface WindowOptions {
  /** Background style ID registered in a StyleRegistry. 0 or undefined = transparent. Default: undefined. */
  background?: StyleId;
  /** Border config, or true for all sides with single style. Default: false. */
  border?: WindowBorder | boolean;
  /** Whether the window is active. Affects border/background appearance. Default: true. */
  active?: boolean;
}

/** Internal per-axis position spec used by Pos. */
export type AxisSpec =
  | { mode: 'start'; value: number }
  | { mode: 'end';   value: number }
  | { mode: 'pct';   value: number }
  | { mode: 'center' };

/** Internal per-axis size spec used by Size. */
export type DimSpec =
  | { mode: 'abs'; value: number }
  | { mode: 'pct'; value: number };

/** Options for Window.writeText() – position defaults to (0, 0). */
export interface WriteTextOptions {
  /** Column to start writing at. Default: 0. */
  x?: number;
  /** Row to start writing at. Default: 0. */
  y?: number;
  /** Style ID registered in a StyleRegistry. Default: 0 (no style). */
  style?: StyleId;
}

/** Options shared by all interactive controls. */
export interface ControlOptions extends WindowOptions {
  /** Whether the control currently has keyboard focus. Default: false. */
  focused?: boolean;
  /** Whether the control is non-interactive and visually dimmed. Default: false. */
  disabled?: boolean;
}

/** Options for the Button control. */
export interface ButtonOptions extends ControlOptions {
  /** Text label displayed centred on the button. Default: ''. */
  label?: string;
  /** Called when the button is activated (Enter or Space while focused). */
  onPress?: () => void;
}

/** Options for the TextBox control. */
export interface TextBoxOptions extends ControlOptions {
  /** Initial text value. Default: ''. */
  value?: string;
  /** Placeholder shown when value is empty and the control is not focused. Default: ''. */
  placeholder?: string;
  /** Initial cursor position (character index). Default: end of value. */
  cursor?: number;
}

/** Options for the TextArea control. */
export interface TextAreaOptions extends ControlOptions {
  /** Initial text value; may contain newline characters. Default: ''. */
  value?: string;
  /** Placeholder shown when value is empty and the control is not focused. Default: ''. */
  placeholder?: string;
  /** Initial cursor position. Default: { x: 0, y: 0 }. */
  cursor?: { x: number; y: number };
}

/** Options for the Checkbox control. */
export interface CheckboxOptions extends ControlOptions {
  /** Whether the checkbox is initially checked. Default: false. */
  checked?: boolean;
  /** Called when the checked state changes via handleKey(). */
  onChange?: (checked: boolean) => void;
}

/** Options for the Radio control. */
export interface RadioOptions extends ControlOptions {
  /** Whether the radio button is initially selected. Default: false. */
  checked?: boolean;
  /** Called when the radio button is selected via handleKey(). */
  onChange?: (checked: boolean) => void;
}

/** Options for the StatusLED control. */
export interface StatusLEDOptions extends WindowOptions {
  /** Visual state of the LED. Default: 'off'. */
  state?: 'ok' | 'warn' | 'error' | 'off';
  /** Label text shown to the right of the indicator dot. Default: ''. */
  label?: string;
}

/** Options for the ProgressBar (horizontal) control. */
export interface ProgressBarOptions extends WindowOptions {
  /** Current value. Default: 0. */
  value?: number;
  /** Maximum value. Default: 100. */
  max?: number;
  /** Whether to show the percentage label centred over the bar. Default: true. */
  showLabel?: boolean;
  /** ANSI color number for the filled portion. Default: 75. */
  fillColor?: number;
  /** ANSI color number for the empty portion. Default: 237. */
  emptyColor?: number;
}

/** Options for the ProgressBarV (vertical) control. */
export interface ProgressBarVOptions extends WindowOptions {
  /** Current value. Default: 0. */
  value?: number;
  /** Maximum value. Default: 100. */
  max?: number;
  /** ANSI color number for the filled portion. Default: 75. */
  fillColor?: number;
  /** ANSI color number for the empty portion. Default: 237. */
  emptyColor?: number;
}

/** Options for the LineChart control. */
export interface LineChartOptions extends WindowOptions {
  /** Data points to plot. Default: []. */
  data?: number[];
  /** Minimum Y value; if omitted, derived from data. */
  min?: number;
  /** Maximum Y value; if omitted, derived from data. */
  max?: number;
  /** ANSI color number for the line. Default: 75. */
  color?: number;
}

/** Options for the ListBox control. */
export interface ListBoxOptions extends ControlOptions {
  /** Initial items shown in the list. Default: []. */
  items?: string[];
  /** Initial selected index, or -1 for no selection. Default: 0 if items is non-empty, else -1. */
  selectedIndex?: number;
  /** Called when the selected index changes via handleKey(). */
  onChange?: (index: number, item: string) => void;
}

/** Options for the Tabs control. */
export interface TabsOptions extends ControlOptions {
  /** Tab titles shown in the header row. Default: []. */
  titles?: string[];
  /** Initially active tab index. Default: 0. */
  activeIndex?: number;
  /** Called when the active tab changes via handleKey(). */
  onChange?: (index: number, title: string) => void;
}

/** Options for the Sparkline control. */
export interface SparklineOptions extends WindowOptions {
  /** Data values to plot as a one-row block-character chart. Default: []. */
  data?: number[];
  /** Minimum Y value; if omitted, derived from data. */
  min?: number;
  /** Maximum Y value; if omitted, derived from data. */
  max?: number;
  /** ANSI color number for the sparkline glyphs. Default: 75. */
  color?: number;
}

/** Options for the Spinner control. */
export interface SpinnerOptions extends WindowOptions {
  /** Visual style of the spinner animation. Default: 'braille'. */
  style?: 'braille' | 'dots' | 'line' | 'circle' | 'arrow';
  /** Label text shown to the right of the spinner glyph. Default: ''. */
  label?: string;
  /** Initial frame index. Default: 0. */
  frame?: number;
  /** Whether the spinner is actively animating. Default: true. */
  running?: boolean;
  /** ANSI color number for the spinner glyph. Default: 75. */
  color?: number;
}

/** Options for the BarChart control. */
export interface BarChartOptions extends WindowOptions {
  /** Data values for each bar. Default: []. */
  data?: number[];
  /** Label string for each bar (truncated to barWidth columns). Default: []. */
  labels?: string[];
  /** Maximum Y value; if omitted, derived from data. */
  max?: number;
  /** ANSI color number for the bars. Default: 75. */
  barColor?: number;
  /** Width in columns of each bar. Default: 1. */
  barWidth?: number;
}

// ── InterfaceBuilder YAML schema ──────────────────────────────────────────────

/** A single axis value: absolute number, edge-relative negative, or percentage string ("N%"). */
export type YamlAxisValue = number | string;

/** YAML position specification for a window. */
export type YamlPosSpec =
  | 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  | { preset: 'top';    offset?: YamlAxisValue }
  | { preset: 'left';   offset?: YamlAxisValue }
  | { preset: 'right';  offset?: YamlAxisValue }
  | { preset: 'bottom'; offset?: YamlAxisValue }
  | { x: YamlAxisValue; y: YamlAxisValue };

/** YAML size specification for a window. */
export type YamlSizeSpec =
  | 'fill'
  | { fillWidth: YamlAxisValue }
  | { fillHeight: YamlAxisValue }
  | { width: YamlAxisValue; height: YamlAxisValue };

/** Control type tags supported by InterfaceBuilder. */
export type YamlWindowType = 'window' | 'button' | 'textbox' | 'textarea' | 'checkbox' | 'radio'
  | 'statusled' | 'progressbar' | 'progressbarv' | 'linechart' | 'barchart'
  | 'listbox' | 'tabs' | 'sparkline' | 'spinner';

/** A named style entry in the YAML layout's `styles:` section. Extends CellAttributes with a required name. */
export interface YamlStyleDef extends CellAttributes {
  /** Name used to reference this style. May override built-in names (e.g. 'builtin:window-bg'). */
  name: string;
}

/** A single window or control definition in a YAML layout. */
export interface YamlWindowDef {
  /** Optional identifier for retrieving the built window from the result map. */
  id?: string;
  /** Widget type. Defaults to 'window'. */
  type?: YamlWindowType;
  /** Position within the parent. Defaults to { x: 0, y: 0 }. */
  pos?: YamlPosSpec;
  /** Dimensions of the window. Required for window/button/textbox/textarea; ignored for checkbox/radio (auto-sized). */
  size?: YamlSizeSpec;
  /** Background style: a named style string (e.g. 'builtin:window-bg') or a numeric StyleId. Omit for transparent. */
  background?: string | number;
  /** Border configuration. true enables all sides with single style. */
  border?: WindowBorder | boolean;
  /** Whether the window is active (affects dim). Default: true. */
  active?: boolean;
  /** Text written at the top-left of the content area after construction. */
  content?: string;
  /** Nested children added via addChild(). */
  children?: YamlWindowDef[];
  /** Label text (Button, Checkbox, Radio). */
  label?: string;
  /** Placeholder text shown when value is empty (TextBox, TextArea). */
  placeholder?: string;
  /** Initial text value (TextBox, TextArea). */
  value?: string;
  /** Initial checked state (Checkbox, Radio). Default: false. */
  checked?: boolean;
  /** Whether the control starts focused. Default: false. */
  focused?: boolean;
  /** Whether the control is disabled. Default: false. */
  disabled?: boolean;
  /** Callback ID registered via InterfaceBuilder.registerCallback() — fired on button press. */
  onPress?: string;
  /** Callback ID registered via InterfaceBuilder.registerCallback() — fired on value change. */
  onChange?: string;
  /** LED state ('ok' | 'warn' | 'error' | 'off') — used by statusled. */
  state?: 'ok' | 'warn' | 'error' | 'off';
  /** Whether to show a percentage label over a progress bar. Default: true. */
  showLabel?: boolean;
  /** ANSI color for the filled portion (ProgressBar, ProgressBarV). */
  fillColor?: number;
  /** ANSI color for the empty portion (ProgressBar, ProgressBarV). */
  emptyColor?: number;
  /** Current numeric value for ProgressBar / ProgressBarV. */
  barValue?: number;
  /** Maximum numeric value for ProgressBar, ProgressBarV, LineChart, BarChart. */
  max?: number;
  /** Minimum numeric value for LineChart. */
  min?: number;
  /** Numeric data array for LineChart / BarChart. */
  data?: number[];
  /** String label array for BarChart bars. */
  barLabels?: string[];
  /** Line color for LineChart or bar color for BarChart (ANSI number). */
  chartColor?: number;
  /** Width of each bar in BarChart columns. Default: 1. */
  barWidth?: number;
  /** Items shown in a ListBox. */
  items?: string[];
  /** Initial selection index for ListBox. */
  selectedIndex?: number;
  /** Tab titles for a Tabs control. */
  titles?: string[];
  /** Initially active tab index for a Tabs control. */
  activeIndex?: number;
  /** Visual style for Spinner animation. */
  spinnerStyle?: 'braille' | 'dots' | 'line' | 'circle' | 'arrow';
  /** Initial frame index for Spinner. */
  frame?: number;
  /** Whether Spinner is actively animating. */
  running?: boolean;
  /** Tab index this child belongs to when its parent is a Tabs control. */
  tab?: number;
}

/** Top-level YAML layout document consumed by InterfaceBuilder. */
export interface YamlLayout {
  /** Named style definitions registered before windows are built. */
  styles?: YamlStyleDef[];
  /** Top-level windows to add to the Screen. */
  windows: YamlWindowDef[];
}

// ── Focusable ─────────────────────────────────────────────────────────────────

/** Interface that interactive controls must satisfy to integrate with WindowManager. */
export interface Focusable {
  isFocused(): boolean;
  setFocused(focused: boolean): void;
  isDisabled(): boolean;
  handleKey?(key: string): void;
}

/** Mouse event emitted by the terminal (SGR or X10 protocol). */
export interface TerminalMouseEvent {
  /** Whether this is a button press, release, or cursor move. */
  type: 'press' | 'release' | 'move';
  /** Button index: 0 = left, 1 = middle, 2 = right. */
  button: number;
  /** 0-based column of the event. */
  x: number;
  /** 0-based row of the event. */
  y: number;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
}

/** Constructor options for WindowManager. */
export interface WindowManagerOptions {
  /** Key strings that trigger application exit. Default: ['\x03'] (Ctrl+C). */
  exitKeys?: string[];
  /** Called after the input loop stops and the terminal state is restored. */
  onExit?: () => void;
  /** Called for every raw key string before it is dispatched to a control. */
  onKey?: (key: string) => void;
  /** Called for every mouse event when mouse support is enabled. */
  onMouse?: (event: TerminalMouseEvent) => void;
  /** Enable mouse click tracking (SGR protocol). Default: false. */
  mouse?: boolean;
}
