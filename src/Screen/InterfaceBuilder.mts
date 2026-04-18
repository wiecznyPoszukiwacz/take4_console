import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import type {
  YamlLayout,
  YamlWindowDef,
  YamlPosSpec,
  YamlSizeSpec,
  YamlDimValue,
  YamlAxisValue,
  StyleId,
  Focusable,
  WindowProperties,
} from './types.mjs';
import { Window } from './Window.mjs';
import { Screen } from './Screen.mjs';
import { WindowManager } from './WindowManager.mjs';
import { Pos, Pct, pct } from './Pos.mjs';
import { Size, flex, content } from './Size.mjs';
import type { DimValue } from './Size.mjs';
import { getRegistry } from './RegistryHolder.mjs';
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
  if (spec === 'flex')        return Pos.flex();
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
    if ('flex' in spec) {
      return Pos.flex(spec.flex ?? 0);
    }
    if ('x' in spec && 'y' in spec) {
      return new Pos(parseAxisValue(spec.x), parseAxisValue(spec.y));
    }
  }
  throw new Error(`Invalid pos spec: ${JSON.stringify(spec)}`);
}

/** Converts a single axis value within a Size spec — extends the plain-axis
 *  parser with the 'flex' / 'content' shorthands and the `{ flex: {...} }` /
 *  `{ content: true }` objects so each axis can be chosen independently. */
function parseDimValue(v: YamlDimValue): DimValue {
  if (v === 'flex')    return flex();
  if (v === 'content') return content();
  if (typeof v === 'object' && v !== null) {
    if ('flex' in v) {
      const basis = v.flex.basis !== undefined ? parseAxisValue(v.flex.basis) : 0;
      return flex(v.flex.grow ?? 1, v.flex.shrink ?? 1, basis);
    }
    if ('content' in v && v.content === true) return content();
  }
  return parseAxisValue(v as YamlAxisValue);
}

/** Converts a YamlSizeSpec to a Size instance. */
function parseSize(spec: YamlSizeSpec): Size {
  if (spec === 'fill')    return Size.fill();
  if (spec === 'flex')    return Size.flex();
  if (spec === 'content') return Size.content();
  if (typeof spec === 'object') {
    if ('fillWidth'  in spec) return Size.fillWidth(parseAxisValue(spec.fillWidth));
    if ('fillHeight' in spec) return Size.fillHeight(parseAxisValue(spec.fillHeight));
    if ('flex' in spec) {
      const basis = spec.flex.basis !== undefined ? parseAxisValue(spec.flex.basis) : 0;
      return Size.flex(spec.flex.grow ?? 1, spec.flex.shrink ?? 1, basis);
    }
    if ('width' in spec && 'height' in spec) {
      return new Size(parseDimValue(spec.width), parseDimValue(spec.height));
    }
  }
  throw new Error(`Invalid size spec: ${JSON.stringify(spec)}`);
}

/** Resolves a YAML background value (style name or numeric StyleId) to a StyleId.
 *  String values are looked up by name in the global registry (returns 0 if not found).
 *  Numeric values are passed through as-is. Undefined becomes undefined (transparent). */
function resolveBackground(bg: string | number | undefined): StyleId | undefined {
  if (bg === undefined) return undefined;
  if (typeof bg === 'string') return getRegistry().getNamed(bg) ?? 0;
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
    const pending: PendingRegistration[] = [];
    const contentWrites: Array<{ win: Window; text: string }> = [];

    // Register YAML-defined named styles before building the window tree.
    if (layout.styles) {
      const registry = getRegistry();
      for (const styleDef of layout.styles) {
        const { name, ...attrs } = styleDef;
        registry.registerNamed(name, attrs);
      }
    }

    for (const def of layout.windows) {
      const win = this.buildNode(def, result, pending, contentWrites, []);
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
    result: Map<string, Window>,
    pending: PendingRegistration[],
    contentWrites: Array<{ win: Window; text: string }>,
    parentChain: Window[],
  ): Window {
    const pos      = parsePos(def.pos);
    const bgId     = resolveBackground(def.background);

    /** Common window properties shared by all control types. */
    const wp: WindowProperties = {
      pos,
      size:           def.size ? parseSize(def.size) : undefined,
      background:     bgId,
      border:         def.border,
      active:         def.active,
      focused:        def.focused,
      disabled:       def.disabled,
      label:          def.label,
      layout:         def.layout,
      gap:            def.gap,
      padding:        def.padding,
      gridColumns:    def.gridColumns,
      alignItems:     def.alignItems,
      justifyContent: def.justifyContent,
    };

    let win: Window;

    switch (def.type ?? 'window') {
      case 'button': {
        const pressCb = def.onPress ? this.callbacks.get(def.onPress) : undefined;
        wp.size = wp.size ?? this.requireSize(def);
        const btn = new Button(wp, {
          onPress: pressCb ? () => pressCb() : undefined,
        });
        pending.push({ control: btn, parents: [...parentChain] });
        win = btn;
        break;
      }

      case 'textbox': {
        wp.size = wp.size ?? this.requireSize(def);
        const tbChange    = def.onChange  ? this.callbacks.get(def.onChange)  : undefined;
        const tbSubmit    = def.onSubmit  ? this.callbacks.get(def.onSubmit)  : undefined;
        const tbKeyDown   = def.onKeyDown ? this.callbacks.get(def.onKeyDown) : undefined;
        const tb = new TextBox(wp, {
          value:       def.value,
          placeholder: def.placeholder,
          onChange:    tbChange  as ((value: string) => void)                 | undefined,
          onSubmit:    tbSubmit  as ((value: string) => void)                 | undefined,
          onKeyDown:   tbKeyDown as ((key: string) => boolean | void)         | undefined,
        });
        pending.push({ control: tb, parents: [...parentChain] });
        win = tb;
        break;
      }

      case 'textarea': {
        wp.size = wp.size ?? this.requireSize(def);
        const taChange    = def.onChange  ? this.callbacks.get(def.onChange)  : undefined;
        const taSubmit    = def.onSubmit  ? this.callbacks.get(def.onSubmit)  : undefined;
        const taKeyDown   = def.onKeyDown ? this.callbacks.get(def.onKeyDown) : undefined;
        const ta = new TextArea(wp, {
          value:               def.value,
          placeholder:         def.placeholder,
          onChange:            taChange  as ((value: string) => void)         | undefined,
          onSubmit:            taSubmit  as ((value: string) => void)         | undefined,
          onKeyDown:           taKeyDown as ((key: string) => boolean | void) | undefined,
          insertTabAsSpaces:   def.insertTabAsSpaces,
          ctrlDDeletesForward: def.ctrlDDeletesForward,
        });
        pending.push({ control: ta, parents: [...parentChain] });
        win = ta;
        break;
      }

      case 'checkbox': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        const cb = new Checkbox(wp, {
          checked:  def.checked,
          onChange: changeCb ? (checked: boolean) => changeCb(checked) : undefined,
        });
        pending.push({ control: cb, parents: [...parentChain] });
        win = cb;
        break;
      }

      case 'radio': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        const r = new Radio(wp, {
          checked:  def.checked,
          onChange: changeCb ? (checked: boolean) => changeCb(checked) : undefined,
        });
        pending.push({ control: r, parents: [...parentChain] });
        win = r;
        break;
      }

      case 'statusled': {
        const led = new StatusLED(wp, {
          state: def.state,
        });
        win = led;
        break;
      }

      case 'progressbar': {
        wp.size = wp.size ?? this.requireSize(def);
        const pb = new ProgressBar(wp, {
          value:      def.barValue,
          max:        def.max,
          showLabel:  def.showLabel,
          fillColor:  def.fillColor,
          emptyColor: def.emptyColor,
        });
        win = pb;
        break;
      }

      case 'progressbarv': {
        wp.size = wp.size ?? this.requireSize(def);
        const pbv = new ProgressBarV(wp, {
          value:      def.barValue,
          max:        def.max,
          fillColor:  def.fillColor,
          emptyColor: def.emptyColor,
        });
        win = pbv;
        break;
      }

      case 'linechart': {
        wp.size = wp.size ?? this.requireSize(def);
        const lc = new LineChart(wp, {
          data:  def.data,
          min:   def.min,
          max:   def.max,
          color: def.chartColor,
        });
        win = lc;
        break;
      }

      case 'barchart': {
        wp.size = wp.size ?? this.requireSize(def);
        const bc = new BarChart(wp, {
          data:     def.data,
          labels:   def.barLabels,
          max:      def.max,
          barColor: def.chartColor,
          barWidth: def.barWidth,
        });
        win = bc;
        break;
      }

      case 'listbox': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        wp.size = wp.size ?? this.requireSize(def);
        const lb = new ListBox(wp, {
          items:         def.items,
          selectedIndex: def.selectedIndex,
          onChange:      changeCb ? (idx: number, item: string) => changeCb(idx, item) : undefined,
        });
        pending.push({ control: lb, parents: [...parentChain] });
        win = lb;
        break;
      }

      case 'tabs': {
        const changeCb = def.onChange ? this.callbacks.get(def.onChange) : undefined;
        wp.size = wp.size ?? this.requireSize(def);
        const tabs = new Tabs(wp, {
          titles:      def.titles,
          activeIndex: def.activeIndex,
          onChange:    changeCb ? (idx: number, title: string) => changeCb(idx, title) : undefined,
        });
        pending.push({ control: tabs, parents: [...parentChain] });
        win = tabs;
        break;
      }

      case 'sparkline': {
        wp.size = wp.size ?? this.requireSize(def);
        const sp = new Sparkline(wp, {
          data:  def.data,
          min:   def.min,
          max:   def.max,
          color: def.chartColor,
        });
        win = sp;
        break;
      }

      case 'spinner': {
        const sp = new Spinner(wp, {
          style:   def.spinnerStyle,
          frame:   def.frame,
          running: def.running,
          color:   def.chartColor,
        });
        win = sp;
        break;
      }

      default: {
        wp.size = wp.size ?? this.requireSize(def);
        win = new Window(wp);
        break;
      }
    }

    if (def.id) result.set(def.id, win);
    // Defer content write – the window may not have its final size yet.
    if (def.content) contentWrites.push({ win, text: def.content });

    if (def.children) {
      for (const childDef of def.children) {
        const child = this.buildNode(childDef, result, pending, contentWrites, [win, ...parentChain]);
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
