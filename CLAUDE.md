# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # run demo (tsx, no build needed)
npm test           # run all tests once
npm run test:watch # watch mode
npm run build      # compile to dist/
```

Run a single test file:
```bash
npx vitest run tests/Window.test.mts
```

Run tests matching a name pattern:
```bash
npx vitest run --reporter=verbose -t "writeText"
```

## Architecture

The library is a terminal cell-grid rendering engine. Everything is a `Window`.

```
Screen (extends Window)
  └─ Window  ←─ user creates these, nests them
       └─ Region  ←─ flat cell buffer (chars[] + styleIds[])
```

### StyleRegistry (`src/Screen/StyleRegistry.mts`)
Central store for visual styles. Maps `StyleId` (integer) → `CellAttributes`. ID 0 is always `{}` (no style).

- `register(attrs): StyleId` – deduplicates: identical attrs always return the same ID
- `get(id): CellAttributes` – lookup
- `merge(baseId, overId): StyleId` – spread merge, returns ID of the result

Styles are registered in `Screen` via `screen.registerStyle(attrs)`. Child windows that share the same ID space should be created with `screen.getStyleRegistry()` passed to the constructor.

### Region (`src/Screen/Region.mts`)
Owns two flat arrays indexed by `y * width + x`:
- `chars: string[]` – one character per cell
- `styleIds: number[]` – integer style ID per cell (resolved via StyleRegistry)

Exposed via `getChars()` / `getStyleIds()` (readonly views) for rendering. Region has no registry reference – it stores only raw IDs.

### Window (`src/Screen/Window.mts`)
Has **two** Region instances:
- `content` (private) – what the user writes via `setCell`, `writeText`, `fill`, etc. Survives `render()` calls.
- `region` (protected) – the composited display buffer, rebuilt on every `render()`.

Each Window owns a `StyleRegistry` (`protected registry`). Constructor accepts an optional `registry?` param; if omitted, a fresh registry is created. When windows share a screen's registry (passed explicitly), IDs are transferable between them.

`render()` pipeline (order matters):
1. `paintBackground()` – fills `region` with background style ID + optional dim
2. `blitContent()` – overlays `content` onto `region`, merging style IDs via `registry.merge()`
3. `paintBorder()` – draws box-drawing chars onto `region` edges with a registered border style ID
4. child loop – recursively renders children and blits their `region` onto this `region`; `blitChild` re-registers child styles into the parent's registry

`getCell(x, y)` reads from `region` and resolves the style ID through `this.registry`, returning `Cell { char, attributes }`. Before `render()`, `region` mirrors `content` because all write methods update both.

Public write API uses `StyleId`:
- `setCell(x, y, char, styleId?)` – sets char and style ID
- `fill(char, styleId?)` – fills all cells
- `mergeStyle(x, y, styleId)` – merges a style onto a cell (replaces `setAttributes`)
- `writeText(text, { x?, y?, style?: StyleId }?)` – writes text with optional style

### Screen (`src/Screen/Screen.mts`)
Extends `Window`. Constructor reads `process.stdout.columns/rows` and creates a `StyleRegistry`. `render()` calls `super.render()` (compositing), then serializes `this.region` into a single ANSI escape string and writes it with one `process.stdout.write()` call. Always starts with `\x1b[H` (cursor home) and ends with `\x1b[0m` (reset).

- `registerStyle(attrs): StyleId` – register a style in Screen's registry
- `getStyleRegistry(): StyleRegistry` – share the registry with child Windows

ANSI color encoding: 256-color `38;5;n` for `number`, true-color `38;2;r;g;b` for hex strings.

### Types (`src/Screen/types.mts`)
All interfaces and type aliases live here. Notable:
- `StyleId = number` – integer handle into a StyleRegistry
- `CellAttributes` – all SGR attributes (bold, dim, italic, foreground, background, …)
- `WindowOptions` – constructor options: `background` (`StyleId`), `border`, `active`
- `WriteTextOptions` – `{ x?, y?, style?: StyleId }`
- `WindowBorder` – per-side flags + `style` (`single`/`double`/`rounded`) + `color`
- Per-control option interfaces: `ButtonOptions`, `TextBoxOptions`, `TextAreaOptions`, `CheckboxOptions`, `RadioOptions`, `StatusLEDOptions`, `ProgressBarOptions`, `ProgressBarVOptions`, `LineChartOptions`, `BarChartOptions`, `ListBoxOptions`, `TabsOptions`, `SparklineOptions`, `SpinnerOptions`
- `BUILTIN_*` string constants (`BUILTIN_WINDOW_BG`, `BUILTIN_BORDER`, …) – names for the ten default styles pre-registered by `Screen`; controls look them up via `registry.getNamed(...)` with hardcoded fallbacks

### Controls (`src/Screen/controls/`)
All controls extend `Window`. Constructor signature: `(pos, size?, options?)` — `size` is omitted for auto-sized controls (`Checkbox`, `Radio`, `StatusLED`). Common properties (`focused`, `disabled`, `label`, `normalStyleId`, `disabledStyleId`) and their getters/setters are inherited from `Window`.

**Interactive (`Focusable`, registerable with `WindowManager`):**
- `Button` – clickable button; `onPress` on Enter/Space
- `TextBox` – single-line text input with scrolling + cursor
- `TextArea` – multi-line text input with 2-D cursor
- `Checkbox` – `[✓]/[ ]` toggle, auto-sized to label
- `Radio` – `(●)/( )` single-selection, auto-sized to label
- `ListBox` (added 0.11.0) – scrollable list; ↑/↓/PgUp/PgDn/Home/End; `onChange(index, item)`
- `Tabs` (added 0.11.0) – tabbed container; ←/→ to cycle; per-child tagging via `addChildToTab(index, child)`; only the active tab's children are composited on render

**Read-only display:**
- `StatusLED` (0.10.0) – coloured dot + optional label (`ok`/`warn`/`error`/`off`)
- `ProgressBar` (0.10.0) – horizontal block-character bar with percentage label
- `ProgressBarV` (0.10.0) – vertical block-character bar filling from the bottom
- `LineChart` (0.10.0) – line chart with labelled Y-axis and X-axis, box-drawing chars
- `BarChart` (0.10.0) – vertical bar chart with per-bar labels
- `Sparkline` (0.11.0) – one-row inline chart using the eight-level block-character ramp (` ▁▂▃▄▅▆▇█`)
- `Spinner` (0.11.0) – animated loader; styles: `braille`/`dots`/`line`/`circle`/`arrow`; advanced manually via `step()`

Read-only controls inherit `isFocused()`/`setFocused()`/`isDisabled()`/`setDisabled()` from `Window` (no longer overridden as no-ops).

### InterfaceBuilder (`src/Screen/InterfaceBuilder.mts`)
Builds a window tree from a YAML description. `build(yamlText, screen, wm?)` / `buildFromFile(path, screen, wm?)` return `Map<string, Window>` keyed by YAML `id`.

- Supports all 15 built-in control classes via `type:` (`window`, `button`, `textbox`, `textarea`, `checkbox`, `radio`, `statusled`, `progressbar`, `progressbarv`, `linechart`, `barchart`, `listbox`, `tabs`, `sparkline`, `spinner`)
- `tab: N` on a child routes it through `addChildToTab(N, child)` when the immediate parent is a `Tabs` control
- Optional top-level `styles:` section registers named styles (including built-in overrides) before windows are built
- `registerCallback(id, fn)` wires `onPress` / `onChange` YAML fields to runtime callbacks
- Focusable controls are auto-registered with the `WindowManager` after the tree is built

## Key conventions

- Source files use `.mts`; imports reference `.mjs` (NodeNext resolution)
- All class members carry explicit access modifiers (`public`/`protected`/`private`); no underscore prefix for private members
- Type/interface declarations belong in `types.mts`, not inline in class files
- Version bump + CHANGELOG entry required after each feature batch
- Styles are always registered before use; never pass `CellAttributes` directly to cell methods
- Child windows that need style IDs from Screen must share the registry: `new Window(..., screen.getStyleRegistry())`
