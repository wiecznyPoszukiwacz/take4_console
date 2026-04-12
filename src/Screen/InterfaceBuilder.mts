import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import type {
  YamlLayout,
  YamlWindowDef,
  YamlPosSpec,
  YamlSizeSpec,
  YamlAxisValue,
  StyleId,
  Focusable,
} from './types.mjs';
import { Window } from './Window.mjs';
import { Screen } from './Screen.mjs';
import { WindowManager } from './WindowManager.mjs';
import { Pos, Pct, pct } from './Pos.mjs';
import { Size } from './Size.mjs';
import { StyleRegistry } from './StyleRegistry.mjs';
import { Button }       from './controls/Button.mjs';
import { TextBox }      from './controls/TextBox.mjs';
import { TextArea }     from './controls/TextArea.mjs';
import { Checkbox }     from './controls/Checkbox.mjs';
import { Radio }        from './controls/Radio.mjs';
import { StatusLED }    from './controls/StatusLED.mjs';
import { ProgressBar }  from './controls/ProgressBar.mjs';
import { ProgressBarV } from './controls/ProgressBarV.mjs';
import { LineChart }    from './controls/LineChart.mjs';
import { BarChart }     from './controls/BarChart.mjs';
import { ListBox }      from './controls/ListBox.mjs';
import { Tabs }         from './controls/Tabs.mjs';
import { Sparkline }    from './controls/Sparkline.mjs';
import { Spinner }      from './controls/Spinner.mjs';

// ── Internal helpers ──────────────────────────────────────────────────────────

/** A focusable control with its resolved parent chain, queued for WM registration. */
interface PendingRegistration {
  control: Focusable & Window;
  parents: Window[];
}

/** Converts a YamlAxisValue ("N%", or a number) to a number or Pct instance. */
function parseAxisValue(v: YamlAxisValue): number | Pct {
  if (typeof v === 'string') {
    const m = v.match(/^(-?\d+(?:\.\d+)?)%$/);
    if (!m) throw new Error(`Invalid axis value: "${v}". Expected a number or "N%" string.`);
    return pct(parseFloat(m[1]));
  }
  return v;
}

/** Converts a YamlPosSpec to a Pos instance. */
function parsePos(spec: YamlPosSpec | undefined): Pos {
  if (!spec) return new Pos(0, 0);
  if (spec === 'center')      return Pos.center();
  if (spec === 'topLeft')     return Pos.topLeft();
  if (spec === 'topRight')    return Pos.topRight();
  if (spec === 'bottomLeft')  return Pos.bottomLeft();
  if (spec === 'bottomRight') return Pos.bottomRight();
  if (typeof spec === 'object') {
    if ('preset' in spec) {
      const off = spec.offset !== undefined ? parseAxisValue(spec.offset) : 0;
      switch (spec.preset) {
        case 'top':    return Pos.top(off);
        case 'left':   return Pos.left(off);
        case 'right':  return Pos.right(off);
        case 'bottom': return Pos.bottom(off);
      }
    }
    if ('x' in spec && 'y' in spec) {
      return new Pos(parseAxisValue(spec.x), parseAxisValue(spec.y));
    }
  }
  throw new Error(`Invalid pos spec: ${JSON.stringify(spec)}`);
}

/** Converts a YamlSizeSpec to a Size instance. */
function parseSize(spec: YamlSizeSpec): Size {
  if (spec === 'fill') return Size.fill();
  if (typeof spec === 'object') {
    if ('fillWidth'  in spec) return Size.fillWidth(parseAxisValue(spec.fillWidth));
    if ('fillHeight' in spec) return Size.fillHeight(parseAxisValue(spec.fillHeight));
    if ('width' in spec && 'height' in spec) {
      return new Size(parseAxisValue(spec.width), parseAxisValue(spec.height));
    }
  }
  throw new Error(`Invalid size spec: ${JSON.stringify(spec)}`);
}

/** Resolves a YAML background value (style name or numeric StyleId) to a StyleId.
 *  String values are looked up by name in the registry (returns 0 if not found).
 *  Numeric values are passed through as-is. Undefined becomes undefined (transparent). */
function resolveBackground(bg: string | number | undefined, registry: StyleRegistry): StyleId | undefined {
  if (bg === undefined) return undefined;
  if (typeof bg === 'string') return registry.getNamed(bg) ?? 0;
  return bg;
}

// ── InterfaceBuilder ──────────────────────────────────────────────────────────

/** Builds a window hierarchy from a YAML description.
 *
 * Usage:
 *   1. Create an InterfaceBuilder and call registerCallback() for any onPress/onChange IDs.
 *   2. Call build(yamlText, screen) or buildFromFile(path, screen).
 *   3. Optionally pass a WindowManager to automatically register all focusable controls.
 *   4. The returned Map<string, Window> gives access to windows by their YAML id.
 *
 * YAML schema:
 *   windows:
 *     - id: myBtn
 *       type: button          # window | button | textbox | textarea | checkbox | radio
 *       pos: center           # {x, y} | center | topLeft | topRight | bottomLeft | bottomRight | {preset: top|left|right|bottom, offset?}
 *       size: { width: 20, height: 3 }  # {width, height} | fill | {fillWidth: N} | {fillHeight: N}
 *       label: "Click me"
 *       onPress: my_callback
 *       children:
 *         - ...
 */
export class InterfaceBuilder {
  private callbacks: Map<string, (...args: unknown[]) => void>;

  /** Creates an InterfaceBuilder with an empty callback registry. */
  public constructor() {
    this.callbacks = new Map();
  }

  /** Registers a named callback for use with onPress or onChange in YAML definitions. */
  public registerCallback(id: string, fn: (...args: unknown[]) => void): void {
    this.callbacks.set(id, fn);
  }

  /** Builds the UI from a YAML string, adds all top-level windows to Screen,
   *  and registers focusable controls with WindowManager if provided.
   *  Styles defined in the `styles:` section are registered before any windows are built.
   *  Returns a map of all windows and controls keyed by their YAML id. */
  public build(yamlText: string, screen: Screen, wm?: WindowManager): Map<string, Window> {
    const layout        = parse(yamlText) as YamlLayout;
    const result        = new Map<string, Window>();
    const registry      = screen.getStyleRegistry();
    const pending: PendingRegistration[] = [];
    const contentWrites: Array<{ win: Window; text: string }> = [];

    // Register YAML-defined named styles before building the window tree.
    if (layout.styles) {
      for (const styleDef of layout.styles) {
        const { name, ...attrs } = styleDef;
        registry.registerNamed(name, attrs);
      }
    }

    for (const def of layout.windows) {
      const win = this.buildNode(def, registry, result, pending, contentWrites, []);
      // Adding to screen resolves percentage-based sizes for the entire subtree.
      screen.addChild(win);
    }

    // Write static content after sizing so text lands in correctly-sized regions.
    for (const { win, text } of contentWrites) {
      win.writeText(text);
    }

    if (wm) {
      for (const { control, parents } of pending) {
        wm.register(control, ...parents);
      }
    }

    return result;
  }

  /** Builds the UI from a YAML file. See build() for details. */
  public async buildFromFile(filePath: string, screen: Screen, wm?: WindowManager): Promise<Map<string, Window>> {
    const text = await readFile(filePath, 'utf8');
    return this.build(text, screen, wm);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /** Recursively creates a single widget and all of its children from a YamlWindowDef.
   *  Static content strings are collected into contentWrites instead of being written
   *  immediately, so they are applied after all sizes are resolved. */
  private buildNode(
    def: YamlWindowDef,
    registry: StyleRegistry,
    result: Map<string, Window>,
    pending: PendingRegistration[],
    contentWrites: Array<{ win: Window; text: string }>,
    parentChain: Window[],
  ): Window {
    const pos      = parsePos(def.pos);
    const bgId     = resolveBackground(def.background, registry);
    const baseOpts = { background: bgId, border: def.border, active: def.active };

    let win: Window;

    switch (def.type ?? 'window') {
      case 'button': {
        const pressCb = def.onPress ? this.callbacks.get(def.onPress) : undefined;
        const btn = new Button(pos, this.requireSize(def), {
          ...baseOpts,
          label:    def.label,
          focused:  def.focused,
          disabled: def.disabled,
          onPress:  pressCb ? () => pressCb() : undefined,
        }, registry);
        pending.push({ control: btn, parents: [...parentChain] });
        win = btn;
        break;
      }

      case 'textbox': {
        const tb = new TextBox(pos, this.requireSize(def), {
          ...baseOpts,
          value:       def.value,
          placeholder: def.placeholder,
          focused:     def.focused,
          disabled:    def.disabled,
        }, registry);
        pending.push({ control: tb, parents: [...parentChain] });
        win = tb;
        break;
      }

      case 'textarea': {
        const ta = new TextArea(pos, this.requireSize(def), {
          ...baseOpts,
          value:       def.value,
          placeholder: def.placeholder,
          focused:     def.focused,
          disabled:    def.disabled,
        }, registry);
        pending.push({ control: ta, parents: [...parentChain] });
        win = ta;
        break;
      }

      case 'checkbox': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        const cb = new Checkbox(pos, def.label ?? '', {
          ...baseOpts,
          checked:  def.checked,
          focused:  def.focused,
          disabled: def.disabled,
          onChange: changeCb ? (checked: boolean) => changeCb(checked) : undefined,
        }, registry);
        pending.push({ control: cb, parents: [...parentChain] });
        win = cb;
        break;
      }

      case 'radio': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        const r = new Radio(pos, def.label ?? '', {
          ...baseOpts,
          checked:  def.checked,
          focused:  def.focused,
          disabled: def.disabled,
          onChange: changeCb ? (checked: boolean) => changeCb(checked) : undefined,
        }, registry);
        pending.push({ control: r, parents: [...parentChain] });
        win = r;
        break;
      }

      case 'statusled': {
        const led = new StatusLED(pos, {
          ...baseOpts,
          state: def.state,
          label: def.label,
        }, registry);
        win = led;
        break;
      }

      case 'progressbar': {
        const pb = new ProgressBar(pos, this.requireSize(def), {
          ...baseOpts,
          value:      def.barValue,
          max:        def.max,
          showLabel:  def.showLabel,
          fillColor:  def.fillColor,
          emptyColor: def.emptyColor,
        }, registry);
        win = pb;
        break;
      }

      case 'progressbarv': {
        const pbv = new ProgressBarV(pos, this.requireSize(def), {
          ...baseOpts,
          value:      def.barValue,
          max:        def.max,
          fillColor:  def.fillColor,
          emptyColor: def.emptyColor,
        }, registry);
        win = pbv;
        break;
      }

      case 'linechart': {
        const lc = new LineChart(pos, this.requireSize(def), {
          ...baseOpts,
          data:  def.data,
          min:   def.min,
          max:   def.max,
          color: def.chartColor,
        }, registry);
        win = lc;
        break;
      }

      case 'barchart': {
        const bc = new BarChart(pos, this.requireSize(def), {
          ...baseOpts,
          data:     def.data,
          labels:   def.barLabels,
          max:      def.max,
          barColor: def.chartColor,
          barWidth: def.barWidth,
        }, registry);
        win = bc;
        break;
      }

      case 'listbox': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        const lb = new ListBox(pos, this.requireSize(def), {
          ...baseOpts,
          items:         def.items,
          selectedIndex: def.selectedIndex,
          focused:       def.focused,
          disabled:      def.disabled,
          onChange:      changeCb ? (idx: number, item: string) => changeCb(idx, item) : undefined,
        }, registry);
        pending.push({ control: lb, parents: [...parentChain] });
        win = lb;
        break;
      }

      case 'tabs': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        const tabs = new Tabs(pos, this.requireSize(def), {
          ...baseOpts,
          titles:      def.titles,
          activeIndex: def.activeIndex,
          focused:     def.focused,
          disabled:    def.disabled,
          onChange:    changeCb ? (idx: number, title: string) => changeCb(idx, title) : undefined,
        }, registry);
        pending.push({ control: tabs, parents: [...parentChain] });
        win = tabs;
        break;
      }

      case 'sparkline': {
        const sp = new Sparkline(pos, this.requireSize(def), {
          ...baseOpts,
          data:  def.data,
          min:   def.min,
          max:   def.max,
          color: def.chartColor,
        }, registry);
        win = sp;
        break;
      }

      case 'spinner': {
        const sp = new Spinner(pos, {
          ...baseOpts,
          style:   def.spinnerStyle,
          label:   def.label,
          frame:   def.frame,
          running: def.running,
          color:   def.chartColor,
        }, registry);
        win = sp;
        break;
      }

      default: {
        win = new Window(pos, this.requireSize(def), baseOpts, registry);
        break;
      }
    }

    if (def.id) result.set(def.id, win);
    // Defer content write – the window may not have its final size yet.
    if (def.content) contentWrites.push({ win, text: def.content });

    if (def.children) {
      for (const childDef of def.children) {
        const child = this.buildNode(childDef, registry, result, pending, contentWrites, [win, ...parentChain]);
        if (win instanceof Tabs && childDef.tab !== undefined) {
          win.addChildToTab(childDef.tab, child);
        } else {
          win.addChild(child);
        }
      }
    }

    return win;
  }

  /** Returns a parsed Size from the definition or throws if size is missing. */
  private requireSize(def: YamlWindowDef): Size {
    if (!def.size) {
      const label = def.id ? `"${def.id}"` : (def.type ?? 'window');
      throw new Error(`Missing required "size" for ${label}.`);
    }
    return parseSize(def.size);
  }
}
