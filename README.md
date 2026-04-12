# take4-console

A terminal cell-grid rendering library for Node.js. Build rich text-mode
interfaces out of nested `Window`s with styles, borders, percentage layouts,
focus-aware keyboard/mouse input, and a YAML-driven layout builder.

Ships 15 built-in controls — buttons, text inputs, checkboxes, radios,
listboxes, tabs, status LEDs, progress bars, line/bar/sparkline charts,
spinners — and an extension API for adding your own. Pure ESM, TypeScript
first, zero runtime dependencies besides a YAML parser, one `stdout.write()`
per frame.

> **Requirements:** Node.js ≥ 18, a terminal that supports ANSI escape
> sequences and 256-colour / 24-bit colour. NerdFonts glyphs are supported
> (box-drawing, braille, block characters).

---

## Installation

```bash
npm install take4-console
```

The package is published as an **ES module** — use `import`, not `require`.
TypeScript declarations ship inside the package (`dist/index.d.mts`), so no
`@types/...` companion is needed.

---

## Quick start

```typescript
import {
  Screen,
  WindowManager,
  Button,
  TextBox,
  Pos,
  Size,
} from 'take4-console';

// 1. Create the root screen — sized automatically to the terminal.
const screen = new Screen();
screen.fill(' ', screen.registerStyle({ background: 234 }));

// 2. Add a couple of controls. Controls share the screen's style registry
//    so they can resolve built-in named styles.
const registry = screen.getStyleRegistry();

const name = new TextBox(
  new Pos(2, 2),
  new Size(30, 3),
  { placeholder: 'your name' },
  registry,
);
screen.addChild(name);

const ok = new Button(
  new Pos(2, 6),
  new Size(10, 3),
  { label: 'OK', onPress: () => console.error(`hello, ${name.getValue()}`) },
  registry,
);
screen.addChild(ok);

// 3. Start the input loop. Tab cycles focus; q / Ctrl+C exits.
const wm = new WindowManager(screen, {
  exitKeys: ['q', '\x03'],
  onExit:   () => process.exit(0),
  mouse:    true,
});
wm.register(name);
wm.register(ok);
wm.run();
```

Or build the same UI declaratively from a YAML file via `InterfaceBuilder`
— see [section 7](#7-yaml--interfacebuilder-integration).

---

## Public API

Every symbol below is exported from the package root:

```typescript
import {
  // ── Core ───────────────────────────────────────────────────────────────
  Screen, Window, Region, StyleRegistry, WindowManager,

  // ── Geometry ───────────────────────────────────────────────────────────
  Pos, Size, Pct, pct,

  // ── Interactive controls (focusable) ───────────────────────────────────
  Button, TextBox, TextArea, Checkbox, Radio, ListBox, Tabs,

  // ── Read-only display controls ─────────────────────────────────────────
  StatusLED, ProgressBar, ProgressBarV,
  LineChart, BarChart, Sparkline, Spinner,

  // ── YAML layout builder ────────────────────────────────────────────────
  InterfaceBuilder,

  // ── Built-in style name constants ──────────────────────────────────────
  BUILTIN_WINDOW_BG,
  BUILTIN_BORDER, BUILTIN_BORDER_FOCUSED, BUILTIN_BORDER_DISABLED,
  BUILTIN_TEXT,   BUILTIN_TEXT_FOCUSED,   BUILTIN_TEXT_DISABLED,
  BUILTIN_TEXT_PLACEHOLDER, BUILTIN_TEXT_CHECKED, BUILTIN_CURSOR,
} from 'take4-console';

import type {
  // Primitives
  Color, StyleId, Cell, CellAttributes, TerminalSize,

  // Window / border
  BorderStyle, WindowBorder, WindowOptions, WriteTextOptions,

  // Control option interfaces
  ControlOptions,
  ButtonOptions, TextBoxOptions, TextAreaOptions,
  CheckboxOptions, RadioOptions,
  StatusLEDOptions, ProgressBarOptions, ProgressBarVOptions,
  LineChartOptions, BarChartOptions,
  ListBoxOptions, TabsOptions, SparklineOptions, SpinnerOptions,

  // Focus & input
  Focusable, TerminalMouseEvent, WindowManagerOptions,

  // YAML schema
  YamlLayout, YamlWindowDef, YamlPosSpec, YamlSizeSpec,
  YamlWindowType, YamlStyleDef, YamlAxisValue,
} from 'take4-console';
```

Full control reference is in [section 9](#9-built-in-controls-reference);
style names are in [section 8](#8-built-in-style-reference); YAML layouts
in [section 7](#7-yaml--interfacebuilder-integration).

---

## Running the bundled demo

The repository ships a live demo that exercises every built-in control:

```bash
git clone https://github.com/arcymag/take4-console.git
cd take4-console
npm install
npm run demo          # tsx src/demo.mts
```

Press `q` or `Ctrl+C` to exit. The demo's source (`src/demo.mts`) and layout
(`src/layout.yaml`) are good starting points for your own application.

---

## Table of contents

1. [Core concepts](#1-core-concepts)
2. [Architecture overview](#2-architecture-overview)
3. [Style system](#3-style-system)
4. [Implementing a custom control — step by step](#4-implementing-a-custom-control--step-by-step)
   - 4.1 [Define the options interface](#41-define-the-options-interface)
   - 4.2 [Create the class skeleton](#42-create-the-class-skeleton)
   - 4.3 [Constructor: registry, super, styles](#43-constructor-registry-super-styles)
   - 4.4 [State setters and getters](#44-state-setters-and-getters)
   - 4.5 [Rendering pipeline](#45-rendering-pipeline)
   - 4.6 [Dynamic borders](#46-dynamic-borders)
   - 4.7 [Keyboard input — the Focusable interface](#47-keyboard-input--the-focusable-interface)
   - 4.8 [Registering with WindowManager](#48-registering-with-windowmanager)
   - 4.9 [Writing tests](#49-writing-tests)
5. [Complete example 1: ProgressBar (read-only)](#5-complete-example-1-progressbar-read-only)
6. [Complete example 2: NumberStepper (interactive)](#6-complete-example-2-numberstepper-interactive)
7. [YAML / InterfaceBuilder integration](#7-yaml--interfacebuilder-integration)
8. [Built-in style reference](#8-built-in-style-reference)
9. [Built-in controls reference](#9-built-in-controls-reference)

> **Note on import paths.** Examples in sections 4–6 use **relative imports**
> (e.g. `from '../Window.mjs'`) because they show how to build a new control
> *inside this repository*. If you are extending the library from an external
> package, substitute `from 'take4-console'` instead.

---

## License

MIT © Jarosław Mężyk

---

## 1. Core concepts

| Concept | What it is |
|---|---|
| `Window` | A rectangular region with a position, size, optional border and background. Everything is a Window — layouts, dialogs, and controls. |
| `Region` | A flat `chars[]` + `styleIds[]` buffer. Every Window has two: `content` (user writes) and `region` (composited on render). |
| `StyleRegistry` | Maps integer `StyleId` → `CellAttributes`. Identical attribute objects always get the same ID (deduplication). ID 0 = empty style. |
| `StyleId` | An opaque integer. Never construct cell attributes directly — always call `registry.register(attrs)` and keep the returned ID. |
| `Screen` | A `Window` sized to the terminal. Owns the root `StyleRegistry`. Serialises its `region` into a single ANSI escape string and writes it with one `process.stdout.write()`. |
| `Pos` | Encodes position: absolute `new Pos(x, y)`, edge-relative `new Pos(-1, -1)`, percentage, or named preset (`Pos.center()`, …). |
| `Size` | Encodes size: absolute `new Size(w, h)`, percentage, or fill shorthand (`Size.fill()`, `Size.fillWidth(h)`, …). |

---

## 2. Architecture overview

```
Screen (extends Window)
  └─ Window            ← user creates these, nests them
       └─ Region       ← flat cell buffer (chars[] + styleIds[])
```

The render pipeline for every `Window.render()` call:

```
1. paintBackground()   fill region with background style (if any)
2. blitContent()       overlay the content buffer (what the user wrote)
3. paintBorder()       draw box-drawing characters on edges
4. child loop          render each child and blit its region onto ours
```

**Two-buffer design:**

- `content` (private): what you write with `setCell`, `writeText`, `fill`, etc. Persists across `render()` calls.
- `region` (protected): rebuilt from scratch on every `render()`. Read by `getCell()` and `blitChild`.

Write to `content` → it shows up in `region` after the next `render()`.

---

## 3. Style system

### StyleRegistry

```typescript
const id = registry.register({ foreground: 75, bold: true }); // returns stable integer
registry.get(id);   // → { foreground: 75, bold: true }
registry.merge(baseId, overId); // spread-merge, overId wins conflicts
```

ID 0 is always `{}` (empty / no style). Merging anything with 0 is a no-op.

### Named styles

`Screen` pre-registers ten *built-in* named styles. Controls look them up by name and fall back to hardcoded defaults when running without a Screen (e.g. in unit tests):

```typescript
import { BUILTIN_TEXT_FOCUSED } from './types.mjs';

const styleId = registry.getNamed(BUILTIN_TEXT_FOCUSED)    // may be undefined (no Screen)
             ?? registry.register({ foreground: 255, bold: true }); // hardcoded fallback
```

Override a built-in style for the entire application:

```typescript
screen.setBuiltinStyle(BUILTIN_BORDER_FOCUSED, { foreground: 214 }); // amber focused borders
```

### CellAttributes fields

| Field | Type | Effect |
|---|---|---|
| `foreground` | `Color` | Text colour (ANSI 0–255 or `'#rrggbb'`) |
| `background` | `Color` | Cell background colour |
| `bold` | `boolean` | Bold / bright |
| `dim` | `boolean` | Dimmed / half-brightness |
| `italic` | `boolean` | Italic |
| `underline` | `boolean` | Underline |
| `strikethrough` | `boolean` | Strikethrough |
| `blink` | `boolean` | Blinking |
| `inverse` | `boolean` | Swap foreground ↔ background |

---

## 4. Implementing a custom control — step by step

### 4.1 Define the options interface

Add your options to `src/Screen/types.mts`. Extend `ControlOptions` so the control inherits `background?`, `border?`, `active?`, `focused?`, `disabled?`.

```typescript
// src/Screen/types.mts

/** Options for the Gauge control. */
export interface GaugeOptions extends ControlOptions {
  /** Current value, 0–max. Default: 0. */
  value?: number;
  /** Maximum value. Default: 100. */
  max?: number;
  /** Called when the value changes via handleKey(). */
  onChange?: (value: number) => void;
}
```

### 4.2 Create the class skeleton

Place the file in `src/Screen/controls/MyControl.mts`. Import your interface and the built-in style constants you need.

```typescript
// src/Screen/controls/Gauge.mts

import type { GaugeOptions, StyleId } from '../types.mjs';
import {
  BUILTIN_WINDOW_BG,
  BUILTIN_BORDER,
  BUILTIN_BORDER_FOCUSED,
  BUILTIN_BORDER_DISABLED,
  BUILTIN_TEXT,
  BUILTIN_TEXT_FOCUSED,
  BUILTIN_TEXT_DISABLED,
} from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

export class Gauge extends Window {
  // state
  private value:    number;
  private max:      number;
  private focused:  boolean;
  private disabled: boolean;
  private onChange?: (value: number) => void;

  // cached style IDs
  private filledStyleId:   StyleId;
  private emptyStyleId:    StyleId;
  private labelStyleId:    StyleId;
  private disabledStyleId: StyleId;

  // ...
}
```

### 4.3 Constructor: registry, super, styles

**Key pattern:** create (or receive) the `StyleRegistry` *before* calling `super()` so you can use it for both the `super()` options and your own style lookups.

```typescript
public constructor(pos: Pos, size: Size, options?: GaugeOptions, registry?: StyleRegistry) {
  // 1. Resolve registry first so we can use it before AND after super().
  const reg   = registry ?? new StyleRegistry();

  // 2. Resolve background: use option, fall back to built-in, fall back to hardcoded.
  const bgId  = options?.background
    ?? reg.getNamed(BUILTIN_WINDOW_BG)
    ?? reg.register({ background: 237 });

  // 3. Initial border colour (overridden every render() anyway).
  const borderColor = options?.disabled
    ? reg.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
    : reg.getNamedForeground(BUILTIN_BORDER, 240);

  // 4. Call super with the resolved options and the registry.
  super(pos, size, {
    background: bgId,
    border: {
      top: true, right: true, bottom: true, left: true,
      style: 'single',
      color: borderColor,
    },
    active: !(options?.disabled ?? false),
  }, reg);

  // 5. Store state (after super, this.* is available).
  this.value    = Math.max(0, Math.min(options?.value    ?? 0,   options?.max ?? 100));
  this.max      = Math.max(1, options?.max ?? 100);
  this.focused  = options?.focused  ?? false;
  this.disabled = options?.disabled ?? false;
  this.onChange = options?.onChange;

  // 6. Register / look up style IDs.
  //    Always use the same `reg` local, not `this.registry` — they are the same object,
  //    but using `reg` avoids the "before super" restriction for any future refactors.
  this.filledStyleId   = reg.register({ background: 75 });
  this.emptyStyleId    = reg.register({ background: 238 });
  this.labelStyleId    = reg.getNamed(BUILTIN_TEXT)          ?? reg.register({ foreground: 252 });
  this.disabledStyleId = reg.getNamed(BUILTIN_TEXT_DISABLED) ?? reg.register({ foreground: 245, dim: true });
}
```

**Rules:**
- Never pass `CellAttributes` directly to `setCell` / `writeText` / `fill`. Always convert to a `StyleId` first.
- If you share a `Screen`'s registry, the built-in named styles will be found by `getNamed`. If you construct the control standalone (e.g. in a test), they won't — hence the hardcoded fallback on every line.

### 4.4 State setters and getters

Every stateful field needs a setter and a getter. The setters do *not* call `render()` — the caller decides when to re-render.

```typescript
/** Sets the current value (clamped to 0–max). */
public setValue(value: number): void {
  this.value = Math.max(0, Math.min(value, this.max));
}

/** Returns the current value. */
public getValue(): number {
  return this.value;
}

/** Sets the focused state. Affects border colour and label style on next render(). */
public setFocused(focused: boolean): void {
  this.focused = focused;
}

/** Returns whether the control currently has focus. */
public isFocused(): boolean {
  return this.focused;
}

/** Sets the disabled state. Dims the control and disables interaction on next render(). */
public setDisabled(disabled: boolean): void {
  this.disabled = disabled;
  this.setActive(!disabled);  // Window.setActive() controls the global dim on render
}

/** Returns whether the control is currently disabled. */
public isDisabled(): boolean {
  return this.disabled;
}
```

### 4.5 Rendering pipeline

Override `render()` and follow this fixed order:

```
1. this.clear()          — reset content buffer (mandatory at top of render)
2. draw your content     — writeText / setCell / fill
3. super.render()        — triggers Window pipeline: paintBackground → blitContent → paintBorder → children
```

**Never call `super.render()` first** — the base class's `paintBackground` and `blitContent` steps would overwrite your content.

```typescript
public override render(): void {
  // ── 1. Clear ──────────────────────────────────────────────────────────────
  this.clear();

  // ── 2. Draw content ───────────────────────────────────────────────────────
  const { width, height } = this.getInnerSize();  // excludes border cells
  const filled = Math.round((this.value / this.max) * width);

  for (let x = 0; x < width; x++) {
    const styleId = x < filled ? this.filledStyleId : this.emptyStyleId;
    this.setCell(x, 0, ' ', styleId);
  }

  // Centred "value / max" label.
  const label  = `${this.value}/${this.max}`;
  const labelX = Math.max(0, Math.floor((width - label.length) / 2));
  const style  = this.disabled ? this.disabledStyleId : this.labelStyleId;
  this.writeText(label, { x: labelX, y: 0, style });

  // ── 3. Composite ──────────────────────────────────────────────────────────
  super.render();
}
```

**Coordinate system in `writeText` / `setCell`:**

Coordinates passed to `writeText` are always relative to the *inner content area* (i.e. the area inside any borders). `(0, 0)` is always the top-left of the content area regardless of whether a border is present. The same applies to coordinates returned by `getInnerSize()`. Use `getInnerOffset()` only when you need to translate to absolute cell coordinates for direct `Region` manipulation.

### 4.6 Dynamic borders

Controls typically change their border colour based on state (focused / disabled). Use `updateBorder()` — a `protected` method inherited from `Window` — at the top of `render()`, before calling `super.render()`:

```typescript
public override render(): void {
  this.clear();

  // Resolve border colour from the named style (falls back to a hardcoded ANSI number).
  const borderColor = this.disabled
    ? this.registry.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
    : this.focused
      ? this.registry.getNamedForeground(BUILTIN_BORDER_FOCUSED, 75)
      : this.registry.getNamedForeground(BUILTIN_BORDER, 240);

  this.updateBorder({
    top: true, right: true, bottom: true, left: true,
    style: 'single',
    color: borderColor,
  });

  // ... draw content ...
  super.render();
}
```

`updateBorder` replaces the border config for the next `render()` only — it does not persist. You must call it every time inside `render()`.

### 4.7 Keyboard input — the Focusable interface

To integrate with `WindowManager`'s Tab-cycle and keyboard dispatch, your control must satisfy the `Focusable` interface:

```typescript
// From types.mts:
interface Focusable {
  isFocused():              boolean;
  setFocused(focused: boolean): void;
  isDisabled():             boolean;
  handleKey?(key: string):  void;  // optional — omit if the control is read-only
}
```

Your class satisfies this automatically if it has `isFocused`, `setFocused`, `isDisabled`, and optionally `handleKey`. TypeScript uses structural typing, so no explicit `implements Focusable` keyword is required (though you may add it for clarity).

`handleKey` receives raw terminal escape strings **and** human-readable aliases:

| Physical key | Raw string | Alias |
|---|---|---|
| Enter | `'\r'` or `'\n'` | `'enter'` |
| Space | `' '` | `'space'` |
| Backspace | `'\x7f'` | `'backspace'` |
| Delete | `'\x1b[3~'` | `'delete'` |
| ← | `'\x1b[D'` | `'left'` |
| → | `'\x1b[C'` | `'right'` |
| ↑ | `'\x1b[A'` | `'up'` |
| ↓ | `'\x1b[B'` | `'down'` |
| Home | `'\x1b[H'` | `'home'` |
| End | `'\x1b[F'` | `'end'` |

Example for a Gauge that increments/decrements with arrow keys:

```typescript
public handleKey(key: string): void {
  if (this.disabled) return;

  let changed = false;
  if (key === '\x1b[C' || key === 'right') {
    this.value = Math.min(this.value + 1, this.max);
    changed = true;
  } else if (key === '\x1b[D' || key === 'left') {
    this.value = Math.max(this.value - 1, 0);
    changed = true;
  }

  if (changed) this.onChange?.(this.value);
}
```

### 4.8 Registering with WindowManager

Register your control after adding it to the window tree:

```typescript
const screen = new Screen();
const wm     = new WindowManager(screen);

const gauge = new Gauge(Pos.center(), new Size(30, 3), { max: 50 }, screen.getStyleRegistry());
screen.addChild(gauge);

// Register for Tab focus cycle. Pass all ancestor Windows after the control.
wm.register(gauge);    // top-level control (no parent chain needed)
// — OR —
wm.register(gauge, panel, screen);  // control is inside panel which is inside screen

wm.run();
```

`WindowManager.register(control, ...parents)` uses the parent chain to compute absolute screen coordinates for mouse hit-testing. Pass parents from closest to farthest (innermost first).

### 4.9 Writing tests

Tests run via Vitest. Import controls directly — no Screen or WindowManager needed.

Patterns to test:

```typescript
import { describe, it, expect } from 'vitest';
import { Gauge } from '../../src/Screen/controls/Gauge.mjs';
import { Pos }   from '../../src/Screen/Pos.mjs';
import { Size }  from '../../src/Screen/Size.mjs';

describe('Gauge', () => {
  // ── 1. Constructor / state ─────────────────────────────────────────────────
  it('defaults to value 0', () => {
    const g = new Gauge(new Pos(0, 0), new Size(20, 3));
    expect(g.getValue()).toBe(0);
  });

  it('clamps value to max in constructor', () => {
    const g = new Gauge(new Pos(0, 0), new Size(20, 3), { value: 999, max: 50 });
    expect(g.getValue()).toBe(50);
  });

  // ── 2. render() — visual output ───────────────────────────────────────────
  it('renders a border', () => {
    const g = new Gauge(new Pos(0, 0), new Size(10, 3));
    g.render();
    expect(g.getCell(0, 0).char).toBe('┌');
    expect(g.getCell(9, 2).char).toBe('┘');
  });

  it('filled portion has a distinct background', () => {
    const g = new Gauge(new Pos(0, 0), new Size(12, 3), { value: 50, max: 100 });
    g.render();
    // inner width = 10 (border on both sides); 50% = 5 cells filled
    const filledBg = g.getCell(1, 1).attributes.background; // first inner cell
    const emptyBg  = g.getCell(9, 1).attributes.background; // last inner cell
    expect(filledBg).not.toBe(emptyBg);
  });

  // ── 3. handleKey ──────────────────────────────────────────────────────────
  it('right arrow increments value', () => {
    const g = new Gauge(new Pos(0, 0), new Size(20, 3), { value: 5, max: 10 });
    g.handleKey('right');
    expect(g.getValue()).toBe(6);
  });

  it('does not exceed max', () => {
    const g = new Gauge(new Pos(0, 0), new Size(20, 3), { value: 10, max: 10 });
    g.handleKey('right');
    expect(g.getValue()).toBe(10);
  });

  it('disabled control ignores key presses', () => {
    const g = new Gauge(new Pos(0, 0), new Size(20, 3), { value: 5, disabled: true });
    g.handleKey('right');
    expect(g.getValue()).toBe(5);
  });

  // ── 4. Focusable interface ────────────────────────────────────────────────
  it('isFocused / setFocused round-trip', () => {
    const g = new Gauge(new Pos(0, 0), new Size(20, 3));
    g.setFocused(true);
    expect(g.isFocused()).toBe(true);
  });

  it('focused state changes border color', () => {
    const g       = new Gauge(new Pos(0, 0), new Size(10, 3), { focused: false });
    const gFocused = new Gauge(new Pos(0, 0), new Size(10, 3), { focused: true  });
    g.render();
    gFocused.render();
    const normalColor  = g.getCell(0, 0).attributes.foreground;
    const focusedColor = gFocused.getCell(0, 0).attributes.foreground;
    expect(normalColor).not.toBe(focusedColor);
  });
});
```

---

## 5. Complete example 1: ProgressBar (read-only)

A simple horizontal progress bar with a percentage label. No keyboard interaction.

> **Note:** a real `ProgressBar` is shipped as a built-in control in `src/Screen/controls/ProgressBar.mts` (see section 9). The walkthrough below is kept as a tutorial — it shows the minimum viable implementation of a read-only control and is a good starting point if you want to build your own.

```typescript
// src/Screen/controls/ProgressBar.mts

import type { ControlOptions, StyleId } from '../types.mjs';
import { BUILTIN_WINDOW_BG, BUILTIN_TEXT, BUILTIN_TEXT_DISABLED } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

export interface ProgressBarOptions extends ControlOptions {
  /** Current value, 0–max. Default: 0. */
  value?: number;
  /** Maximum value. Default: 100. */
  max?: number;
  /** ANSI color for the filled portion. Default: 75 (blue). */
  fillColor?: number;
}

export class ProgressBar extends Window {
  private value:         number;
  private max:           number;
  private filledStyleId: StyleId;
  private emptyStyleId:  StyleId;
  private labelStyleId:  StyleId;
  private disabledId:    StyleId;

  /** Creates a ProgressBar. Recommended height: 1 (no border) or 3 (with border). */
  public constructor(pos: Pos, size: Size, options?: ProgressBarOptions, registry?: StyleRegistry) {
    const reg   = registry ?? new StyleRegistry();
    const bgId  = options?.background
      ?? reg.getNamed(BUILTIN_WINDOW_BG)
      ?? reg.register({ background: 237 });

    super(pos, size, {
      background: bgId,
      border: options?.border,
      active: !(options?.disabled ?? false),
    }, reg);

    this.max   = Math.max(1, options?.max   ?? 100);
    this.value = Math.max(0, Math.min(options?.value ?? 0, this.max));

    this.filledStyleId = reg.register({ background: options?.fillColor ?? 75 });
    this.emptyStyleId  = reg.register({ background: 238 });
    this.labelStyleId  = reg.getNamed(BUILTIN_TEXT)          ?? reg.register({ foreground: 255, bold: true });
    this.disabledId    = reg.getNamed(BUILTIN_TEXT_DISABLED) ?? reg.register({ foreground: 245, dim: true });
  }

  /** Sets the current value (clamped to 0–max). Caller must call render() afterwards. */
  public setValue(value: number): void {
    this.value = Math.max(0, Math.min(value, this.max));
  }

  /** Returns the current value. */
  public getValue(): number {
    return this.value;
  }

  /** ProgressBar is not interactive — returns false. */
  public isFocused(): boolean { return false; }

  /** No-op; ProgressBar cannot receive focus. */
  public setFocused(_focused: boolean): void {}

  /** Returns whether the control is disabled. */
  public isDisabled(): boolean { return !this.active; }  // active reflects disabled state

  public override render(): void {
    this.clear();

    const { width } = this.getInnerSize();
    const pct        = this.value / this.max;
    const filled     = Math.round(pct * width);

    // Draw bar cells.
    for (let x = 0; x < width; x++) {
      this.setCell(x, 0, ' ', x < filled ? this.filledStyleId : this.emptyStyleId);
    }

    // Draw centred percentage label over the bar.
    const label   = `${Math.round(pct * 100)}%`;
    const labelX  = Math.max(0, Math.floor((width - label.length) / 2));
    const labelId = this.isDisabled() ? this.disabledId : this.labelStyleId;
    this.writeText(label, { x: labelX, y: 0, style: labelId });

    super.render();
  }
}
```

Usage:

```typescript
const screen = new Screen();
const bar    = new ProgressBar(
  Pos.center(),
  new Size(30, 1),
  { value: 42, max: 100, fillColor: 75 },
  screen.getStyleRegistry(),
);
screen.addChild(bar);

// Later, update and re-render:
bar.setValue(75);
screen.render();
```

---

## 6. Complete example 2: NumberStepper (interactive)

A control that lets the user increment/decrement a numeric value with ← / → arrow keys. Shows the full Focusable pattern with dynamic border colouring.

```typescript
// src/Screen/controls/NumberStepper.mts

import type { ControlOptions, StyleId } from '../types.mjs';
import {
  BUILTIN_WINDOW_BG,
  BUILTIN_BORDER,
  BUILTIN_BORDER_FOCUSED,
  BUILTIN_BORDER_DISABLED,
  BUILTIN_TEXT,
  BUILTIN_TEXT_FOCUSED,
  BUILTIN_TEXT_DISABLED,
} from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { StyleRegistry } from '../StyleRegistry.mjs';

export interface NumberStepperOptions extends ControlOptions {
  value?: number;
  min?:   number;
  max?:   number;
  step?:  number;
  onChange?: (value: number) => void;
}

export class NumberStepper extends Window {
  private value:    number;
  private min:      number;
  private max:      number;
  private step:     number;
  private focused:  boolean;
  private disabled: boolean;
  private onChange?: (value: number) => void;

  private normalStyleId:   StyleId;
  private focusedStyleId:  StyleId;
  private disabledStyleId: StyleId;

  /** Creates a NumberStepper. Minimum recommended size: width 10, height 3. */
  public constructor(pos: Pos, size: Size, options?: NumberStepperOptions, registry?: StyleRegistry) {
    const reg   = registry ?? new StyleRegistry();
    const bgId  = options?.background
      ?? reg.getNamed(BUILTIN_WINDOW_BG)
      ?? reg.register({ background: 237 });
    const borderColor = options?.disabled
      ? reg.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
      : reg.getNamedForeground(BUILTIN_BORDER, 240);

    super(pos, size, {
      background: bgId,
      border: {
        top: true, right: true, bottom: true, left: true,
        style: 'rounded',
        color: borderColor,
      },
      active: !(options?.disabled ?? false),
    }, reg);

    this.min      = options?.min      ?? 0;
    this.max      = options?.max      ?? 99;
    this.step     = options?.step     ?? 1;
    this.value    = Math.max(this.min, Math.min(options?.value ?? this.min, this.max));
    this.focused  = options?.focused  ?? false;
    this.disabled = options?.disabled ?? false;
    this.onChange = options?.onChange;

    this.normalStyleId   = reg.getNamed(BUILTIN_TEXT)          ?? reg.register({ foreground: 252 });
    this.focusedStyleId  = reg.getNamed(BUILTIN_TEXT_FOCUSED)  ?? reg.register({ foreground: 255, bold: true });
    this.disabledStyleId = reg.getNamed(BUILTIN_TEXT_DISABLED) ?? reg.register({ foreground: 245, dim: true });
  }

  public getValue():  number  { return this.value; }
  public isFocused(): boolean { return this.focused; }
  public isDisabled(): boolean { return this.disabled; }

  public setValue(value: number): void {
    this.value = Math.max(this.min, Math.min(value, this.max));
  }

  public setFocused(focused: boolean): void {
    this.focused = focused;
  }

  public setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.setActive(!disabled);
  }

  public handleKey(key: string): void {
    if (this.disabled) return;
    let changed = false;

    if (key === '\x1b[C' || key === 'right') {
      this.value = Math.min(this.value + this.step, this.max);
      changed = true;
    } else if (key === '\x1b[D' || key === 'left') {
      this.value = Math.max(this.value - this.step, this.min);
      changed = true;
    }

    if (changed) this.onChange?.(this.value);
  }

  public override render(): void {
    this.clear();

    // Update border colour based on current state.
    const borderColor = this.disabled
      ? this.registry.getNamedForeground(BUILTIN_BORDER_DISABLED, 238)
      : this.focused
        ? this.registry.getNamedForeground(BUILTIN_BORDER_FOCUSED, 75)
        : this.registry.getNamedForeground(BUILTIN_BORDER, 240);
    this.updateBorder({
      top: true, right: true, bottom: true, left: true,
      style: 'rounded',
      color: borderColor,
    });

    // Draw "◀ value ▶" centred in the inner area.
    const { width, height } = this.getInnerSize();
    const label  = `◀ ${this.value} ▶`;
    const labelX = Math.max(0, Math.floor((width - label.length) / 2));
    const labelY = Math.floor(height / 2);
    const style  = this.disabled ? this.disabledStyleId
                 : this.focused  ? this.focusedStyleId
                 : this.normalStyleId;
    this.writeText(label, { x: labelX, y: labelY, style });

    super.render();
  }
}
```

Usage with WindowManager:

```typescript
import { Screen }        from './src/Screen/Screen.mjs';
import { WindowManager } from './src/Screen/WindowManager.mjs';
import { NumberStepper } from './src/Screen/controls/NumberStepper.mjs';
import { Pos }           from './src/Screen/Pos.mjs';
import { Size }          from './src/Screen/Size.mjs';

const screen  = new Screen();
const wm      = new WindowManager(screen, { exitKeys: ['\x03'] });

const stepper = new NumberStepper(
  Pos.center(),
  new Size(16, 3),
  { value: 10, min: 0, max: 99, step: 5, onChange: v => console.error(`value: ${v}`) },
  screen.getStyleRegistry(),
);
screen.addChild(stepper);
wm.register(stepper);

wm.run();
```

---

## 7. YAML / InterfaceBuilder integration

`InterfaceBuilder` (`src/Screen/InterfaceBuilder.mts`) builds a window hierarchy from a YAML description:

```typescript
const screen  = new Screen();
const wm      = new WindowManager(screen);
const builder = new InterfaceBuilder();
const result  = await builder.buildFromFile('layout.yaml', screen, wm);
// result is a Map<string, Window> keyed by the YAML `id` field
```

Focusable controls are automatically registered with `WindowManager` after the full tree is built, so Tab-cycling works out of the box.

### 7.1 Supported widget types

All eleven built-in control classes are directly instantiable from YAML via the `type:` field:

| `type:` | Class | Requires `size:`? | Key YAML fields |
|---|---|---|---|
| `window` | `Window` | yes | `background`, `border`, `active`, `content`, `children` |
| `button` | `Button` | yes | `label`, `focused`, `disabled`, `onPress` |
| `textbox` | `TextBox` | yes | `value`, `placeholder`, `focused`, `disabled`, `onChange` |
| `textarea` | `TextArea` | yes | `value`, `placeholder`, `focused`, `disabled`, `onChange` |
| `checkbox` | `Checkbox` | no (auto-sized) | `label`, `checked`, `focused`, `disabled`, `onChange` |
| `radio` | `Radio` | no (auto-sized) | `label`, `checked`, `focused`, `disabled`, `onChange` |
| `statusled` | `StatusLED` | no (auto-sized) | `state` (`ok`/`warn`/`error`/`off`), `label` |
| `progressbar` | `ProgressBar` | yes | `barValue`, `max`, `showLabel`, `fillColor`, `emptyColor` |
| `progressbarv` | `ProgressBarV` | yes | `barValue`, `max`, `fillColor`, `emptyColor` |
| `linechart` | `LineChart` | yes | `data`, `min`, `max`, `chartColor` |
| `barchart` | `BarChart` | yes | `data`, `barLabels`, `max`, `chartColor`, `barWidth` |

Custom (user-defined) control classes are not auto-discoverable. To use one with a YAML layout, either:

1. **Place a `window` placeholder** at the desired geometry, retrieve it from the returned map, and construct your control in code at the same `pos`/`size`.
2. **Extend `InterfaceBuilder`** and override `buildNode` to handle additional `type` values.

### 7.2 Position, size, and background

```yaml
pos:  { x: 2, y: 5 }              # absolute
pos:  { x: -10, y: -3 }           # edge-relative (negative = from right/bottom)
pos:  { x: "50%", y: "25%" }      # percentage of parent
pos:  center                      # named preset
pos:  { preset: bottom, offset: 2 }

size: { width: 30, height: 10 }
size: { width: "80%", height: "100%" }
size: fill                        # fill both axes
size: { fillWidth: 3 }            # fill width, height = 3
size: { fillHeight: 20 }          # fill height, width = 20

background: 237                   # numeric StyleId (rarely used directly)
background: my-panel-bg           # name of a style defined in `styles:` section
background: builtin:window-bg     # name of a built-in style (see section 8)
```

### 7.3 Named styles

YAML layouts may declare named styles in an optional top-level `styles:` section. Entries are registered in the Screen's `StyleRegistry` **before** any window is built, so they are available as values for any `background:` field. Named styles may also **override** built-in names (e.g. `builtin:border-focused`) to re-skin every control in the application.

```yaml
styles:
  - name: panel-bg                # custom name
    background: 235
  - name: builtin:border-focused  # override the built-in focused border colour
    foreground: 214               # amber

windows:
  - id: sidebar
    pos: topLeft
    size: { width: 30, height: "100%" }
    background: panel-bg          # reference the custom style by name
```

### 7.4 Callbacks

`onPress` and `onChange` YAML fields reference **callback IDs** registered with `InterfaceBuilder.registerCallback(id, fn)` before `build()` is called:

```typescript
const builder = new InterfaceBuilder();
builder.registerCallback('save',   () => saveSettings());
builder.registerCallback('toggle', (checked: boolean) => setDarkMode(checked));
await builder.buildFromFile('layout.yaml', screen, wm);
```

```yaml
- id: btnSave
  type: button
  pos: { x: -15, y: -4 }
  size: { width: 10, height: 3 }
  label: "Save"
  onPress: save                    # → fires the 'save' callback
- id: cbDark
  type: checkbox
  pos: { x: 1, y: 1 }
  label: "Dark mode"
  onChange: toggle                 # → fires the 'toggle' callback
```

### 7.5 Full example

```yaml
styles:
  - name: builtin:border-focused
    foreground: 214               # amber focused borders everywhere

windows:
  - id: dialog
    pos: center
    size: { width: "80%", height: "80%" }
    background: builtin:window-bg
    border: { top: true, right: true, bottom: true, left: true, style: rounded, color: 240 }
    children:
      - id: ledStatus
        type: statusled
        pos: { x: 2, y: 2 }
        state: ok
        label: "API online"

      - id: pbCpu
        type: progressbar
        pos: { x: 2, y: 4 }
        size: { width: 30, height: 1 }
        barValue: 73
        max: 100
        fillColor: 75

      - id: chart
        type: linechart
        pos: { x: 2, y: 6 }
        size: { width: 60, height: 15 }
        data: [5, 18, 8, 45, 22, 60, 38, 72, 50, 65]
        chartColor: 75
```

After `build()`, retrieve any window or control from the returned map and drive it at runtime:

```typescript
const result = await builder.buildFromFile('layout.yaml', screen, wm);
const ledStatus = result.get('ledStatus') as StatusLED;
const pbCpu     = result.get('pbCpu')     as ProgressBar;

setInterval(() => {
  pbCpu.setValue(readCpuPercent());
  ledStatus.setState(isHealthy() ? 'ok' : 'warn');
  screen.render();
}, 1000);
```

---

## 8. Built-in style reference

All names are exported as constants from `src/Screen/types.mts`.

| Constant | Name string | Default attributes |
|---|---|---|
| `BUILTIN_WINDOW_BG` | `builtin:window-bg` | `{ background: 237 }` |
| `BUILTIN_BORDER` | `builtin:border` | `{ foreground: 240 }` |
| `BUILTIN_BORDER_FOCUSED` | `builtin:border-focused` | `{ foreground: 75 }` |
| `BUILTIN_BORDER_DISABLED` | `builtin:border-disabled` | `{ foreground: 238 }` |
| `BUILTIN_TEXT` | `builtin:text` | `{ foreground: 252 }` |
| `BUILTIN_TEXT_FOCUSED` | `builtin:text-focused` | `{ foreground: 255, bold: true }` |
| `BUILTIN_TEXT_DISABLED` | `builtin:text-disabled` | `{ foreground: 245, dim: true }` |
| `BUILTIN_TEXT_PLACEHOLDER` | `builtin:text-placeholder` | `{ foreground: 242, italic: true }` |
| `BUILTIN_TEXT_CHECKED` | `builtin:text-checked` | `{ foreground: 76, bold: true }` |
| `BUILTIN_CURSOR` | `builtin:cursor` | `{ inverse: true }` |

Override any of these for the whole application:

```typescript
// Amber focused borders everywhere.
screen.setBuiltinStyle(BUILTIN_BORDER_FOCUSED, { foreground: 214 });
```

Or override in YAML before building the layout:

```yaml
styles:
  - name: builtin:border-focused
    foreground: 214
windows:
  - ...
```

---

## 9. Built-in controls reference

Every control extends `Window` and lives under `src/Screen/controls/`. All of them accept an optional `StyleRegistry` as the final constructor parameter so they can share the Screen's registry and pick up named styles. Size behaviour, interactivity, and key methods are summarised below.

### Interactive controls (Focusable — registerable with `WindowManager`)

| Class | Size | Purpose | Key methods |
|---|---|---|---|
| `Button` | manual | Clickable button with rounded border and centred label. Enter/Space triggers `onPress`. | `setLabel`, `setFocused`, `setDisabled` |
| `TextBox` | manual | Single-line text input with scrolling, cursor, and placeholder. | `setValue`/`getValue`, `setCursor`/`getCursor`, `handleKey` |
| `TextArea` | manual | Multi-line text input with 2-D cursor and scrolling. | `setValue`/`getValue`, `setCursor`/`getCursor` (2-D), `handleKey` |
| `Checkbox` | auto | `[✓]`/`[ ]` toggle auto-sized to `4 + label.length`. Space toggles. | `setChecked`/`isChecked`, `setFocused`, `setDisabled` |
| `Radio` | auto | `(●)`/`( )` single-selection auto-sized to `4 + label.length`. Space selects. | `setChecked`/`isChecked`, `setFocused`, `setDisabled` |

### Read-only display controls (added 0.10.0)

| Class | Size | Purpose | Key methods |
|---|---|---|---|
| `StatusLED` | auto (`2 + label.length` × 1) | Coloured dot (●) with optional trailing label. States: `ok` / `warn` / `error` / `off`. | `setState`, `getState`, `setLabel` |
| `ProgressBar` | manual | Horizontal bar (`█`/`░`) with optional centred percentage label. | `setValue`/`getValue`, `setMax`/`getMax` |
| `ProgressBarV` | manual | Vertical bar (`█`/`░`) that fills from the bottom upward. | `setValue`/`getValue`, `setMax`/`getMax` |
| `LineChart` | manual | Line chart using box-drawing characters (`─`, `│`, `╭`, `╮`, `╯`, `╰`) with labelled Y-axis and X-axis. Min height 3, min width 4. | `setData`/`getData`, `setMin`/`setMax` |
| `BarChart` | manual | Vertical bar chart (`█`) with a one-row label strip at the bottom and configurable bar width. | `setData`/`getData`, `setLabels`, `setMax` |

Read-only controls have no-op `setFocused` and always return `false` from `isFocused()` and `isDisabled()`, so they coexist safely in a `WindowManager.register()` call but never enter the focus cycle.

All controls honour the built-in named style system (section 3): if a `Screen` registry is shared, borders and text colours track `screen.setBuiltinStyle(...)` overrides automatically on the next `render()`.
