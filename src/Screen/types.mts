import type { Pos } from './Pos.mjs';
import type { Size } from './Size.mjs';

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

/** Box-drawing character style for window borders.
 *  - 'single'  ─│┌┐└┘     classic light box drawing
 *  - 'double'  ═║╔╗╚╝     double-line box drawing
 *  - 'rounded' ─│╭╮╰╯     light box with rounded corners
 *  - 'thick'   ━┃┏┓┗┛     heavy / bold box drawing
 *  - 'dashed'  ╌╎┌┐└┘     dashed lines with light corners
 *  - 'ascii'   -|+        plain ASCII fallback for non-Unicode terminals
 *  - 'none'    placeholder equivalent to no border (no insets, no painting). */
export type BorderStyle = 'single' | 'double' | 'rounded' | 'thick' | 'dashed' | 'ascii' | 'none';

/** Glyphs used to draw a window border. The four corners and the two edge
 *  characters are mandatory; T-junctions and the cross are optional and only
 *  used by composite controls (tables, split panes) that draw inner lines. */
export interface BorderChars {
  /** Horizontal edge glyph (top and bottom rows). */
  horizontal: string;
  /** Vertical edge glyph (left and right columns). */
  vertical: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  /** T-junction joining a horizontal line to the right side of a vertical line. */
  verticalLeft?: string;
  /** T-junction joining a horizontal line to the left side of a vertical line. */
  verticalRight?: string;
  /** T-junction joining a vertical line to the bottom of a horizontal line. */
  horizontalTop?: string;
  /** T-junction joining a vertical line to the top of a horizontal line. */
  horizontalBottom?: string;
  /** Four-way intersection. */
  cross?: string;
}

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
  /** Optional per-glyph overrides applied on top of the chosen `style`'s char set.
   *  Useful for swapping individual characters (e.g. a custom corner) without
   *  redefining the entire set. */
  chars?:  Partial<BorderChars>;
}

/** Common properties shared by Window and all controls. Passed as the first constructor parameter. */
export interface WindowProperties {
  /** Position of the window within its parent. */
  pos: Pos;
  /** Dimensions of the window. Optional for auto-sized controls (Checkbox, Radio, StatusLED, Spinner). */
  size?: Size;
  /** Background style ID registered in a StyleRegistry. 0 or undefined = transparent. Default: undefined. */
  background?: StyleId;
  /** Border config, or true for all sides with single style. Default: false. */
  border?: WindowBorder | boolean;
  /** Default border shape used when the user does not supply border. Set by control subclasses. */
  defaultBorder?: WindowBorder | boolean;
  /** Whether the window is active. Affects border/background appearance. Default: true. */
  active?: boolean;
  /** Whether the control currently has keyboard focus. Default: false. */
  focused?: boolean;
  /** Whether the control is non-interactive and visually dimmed. Default: false. */
  disabled?: boolean;
  /** Text label displayed by the control. Default: ''. */
  label?: string;
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
  /** Base style ID merged under every segment's style. Default: auto-picked
   *  from disabled/focused/normal state (see Window.writeText()). */
  style?: StyleId;
}

/** A single inline-styled segment accepted by Window.writeText(). The cursor
 *  advances across consecutive segments without resetting, so segments flow
 *  inline on the same row like a rich-text span.
 *  - `style` is a pre-registered StyleId (merged with the base style).
 *  - `attrs` is registered on the fly (convenience, avoids pre-registering).
 *  - When both are present, `style` wins; when neither is present the base style applies. */
export interface WriteTextSegment {
  /** Literal text for this segment. May contain '\n' which resets the cursor
   *  to the starting column and advances to the next row. */
  text: string;
  /** Optional pre-registered style ID merged with the base style. */
  style?: StyleId;
  /** Optional inline CellAttributes; registered into the StyleRegistry automatically. */
  attrs?: CellAttributes;
}

/** Input accepted by Window.writeText().
 *  - A plain string keeps the pre-0.18.0 behaviour: one style for the whole text.
 *  - An array of segments applies per-segment styles while the cursor flows across
 *    them; each segment's style is merged with the base style.
 *  - An empty array is a no-op. */
export type WriteTextInput = string | WriteTextSegment[];

/** Control-specific properties for the Button control. */
export interface ButtonProperties {
  /** Called when the button is activated (Enter or Space while focused). */
  onPress?: () => void;
}

/** Control-specific properties for the TextBox control. */
export interface TextBoxProperties {
  /** Initial text value. Default: ''. */
  value?: string;
  /** Placeholder shown when value is empty and the control is not focused. Default: ''. */
  placeholder?: string;
  /** Initial cursor position (character index). Default: end of value. */
  cursor?: number;
}

/** Control-specific properties for the TextArea control. */
export interface TextAreaProperties {
  /** Initial text value; may contain newline characters. Default: ''. */
  value?: string;
  /** Placeholder shown when value is empty and the control is not focused. Default: ''. */
  placeholder?: string;
  /** Initial cursor position. Default: { x: 0, y: 0 }. */
  cursor?: { x: number; y: number };
}

/** Control-specific properties for the Checkbox control. */
export interface CheckboxProperties {
  /** Whether the checkbox is initially checked. Default: false. */
  checked?: boolean;
  /** Called when the checked state changes via handleKey(). */
  onChange?: (checked: boolean) => void;
}

/** Control-specific properties for the Radio control. */
export interface RadioProperties {
  /** Whether the radio button is initially selected. Default: false. */
  checked?: boolean;
  /** Called when the radio button is selected via handleKey(). */
  onChange?: (checked: boolean) => void;
}

/** Control-specific properties for the StatusLED control. */
export interface StatusLEDProperties {
  /** Visual state of the LED. Default: 'off'. */
  state?: 'ok' | 'warn' | 'error' | 'off';
}

/** Control-specific properties for the ProgressBar (horizontal) control. */
export interface ProgressBarProperties {
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

/** Control-specific properties for the ProgressBarV (vertical) control. */
export interface ProgressBarVProperties {
  /** Current value. Default: 0. */
  value?: number;
  /** Maximum value. Default: 100. */
  max?: number;
  /** ANSI color number for the filled portion. Default: 75. */
  fillColor?: number;
  /** ANSI color number for the empty portion. Default: 237. */
  emptyColor?: number;
}

/** Control-specific properties for the LineChart control. */
export interface LineChartProperties {
  /** Data points to plot. Default: []. */
  data?: number[];
  /** Minimum Y value; if omitted, derived from data. */
  min?: number;
  /** Maximum Y value; if omitted, derived from data. */
  max?: number;
  /** ANSI color number for the line. Default: 75. */
  color?: number;
}

/** Context passed to ListBox.renderItem() for a single row. */
export interface ListBoxRenderContext {
  /** 0-based index of the item in the list. */
  index: number;
  /** Whether the owning ListBox currently has keyboard focus. */
  focused: boolean;
  /** Whether this particular row is the selected one. */
  selected: boolean;
  /** Inner width (in cells) available for the row. */
  width: number;
}

/** A single styled text segment produced by ListBox.renderItem(). */
export interface ListBoxRowSegment {
  /** Literal text drawn into the row at the segment's computed position. */
  text: string;
  /** Optional style ID merged onto the row's base (selection) style. */
  style?: StyleId;
  /** Horizontal alignment within the row. Default: 'left'.
   *  - 'left'  segments are laid out left-to-right from column 0.
   *  - 'right' segments are flushed to the right edge of the row.
   *  - 'fill'  segment occupies the remaining space between the left and right groups.
   *    Only the first 'fill' segment in a row is honoured. */
  align?: 'left' | 'right' | 'fill';
}

/** Return type of ListBox.renderItem(). A plain string is treated as a single left-aligned segment. */
export type ListBoxRowSegments = string | ListBoxRowSegment[];

/** Control-specific properties for the ListBox control. Generic over the item type. */
export interface ListBoxProperties<T = string> {
  /** Initial items shown in the list. Default: []. */
  items?: T[];
  /** Initial selected index, or -1 for no selection. Default: 0 if items is non-empty, else -1. */
  selectedIndex?: number;
  /** Called when the selected index changes via handleKey(). */
  onChange?: (index: number, item: T) => void;
  /** Optional per-row renderer returning styled segments. Default: single text segment (item.toString()). */
  renderItem?: (item: T, ctx: ListBoxRenderContext) => ListBoxRowSegments;
  /** Row height in cells. Default: 1. Items occupy this many consecutive rows in the viewport. */
  rowHeight?: number;
  /** Stable key for reconciliation — currently stored only; future use: preserve scroll/selection across setItems(). */
  keyFn?: (item: T) => string;
}

/** Control-specific properties for the Tabs control. */
export interface TabsProperties {
  /** Tab titles shown in the header row. Default: []. */
  titles?: string[];
  /** Initially active tab index. Default: 0. */
  activeIndex?: number;
  /** Called when the active tab changes via handleKey(). */
  onChange?: (index: number, title: string) => void;
}

/** Control-specific properties for the Sparkline control. */
export interface SparklineProperties {
  /** Data values to plot as a one-row block-character chart. Default: []. */
  data?: number[];
  /** Minimum Y value; if omitted, derived from data. */
  min?: number;
  /** Maximum Y value; if omitted, derived from data. */
  max?: number;
  /** ANSI color number for the sparkline glyphs. Default: 75. */
  color?: number;
}

/** Control-specific properties for the Spinner control. */
export interface SpinnerProperties {
  /** Visual style of the spinner animation. Default: 'braille'. */
  style?: 'braille' | 'dots' | 'line' | 'circle' | 'arrow';
  /** Initial frame index. Default: 0. */
  frame?: number;
  /** Whether the spinner is actively animating. Default: true. */
  running?: boolean;
  /** ANSI color number for the spinner glyph. Default: 75. */
  color?: number;
}

/** Control-specific properties for the BarChart control. */
export interface BarChartProperties {
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
