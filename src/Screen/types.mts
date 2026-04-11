/** Text and background color, expressed as ANSI color number (0–255) or hex string (e.g. '#ff0000'). */
export type Color = number | string;

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
  /** Background color, or false for transparent. Default: false. */
  background?: Color | false;
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
export type YamlWindowType = 'window' | 'button' | 'textbox' | 'textarea' | 'checkbox' | 'radio';

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
  /** Background color. false means transparent. */
  background?: Color | false;
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
}

/** Top-level YAML layout document consumed by InterfaceBuilder. */
export interface YamlLayout {
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
