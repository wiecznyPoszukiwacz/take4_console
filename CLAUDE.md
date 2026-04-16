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

## Backlog execution — currently in progress

We are working through the backlog defined in
[`doc/take4-console-backlog.md`](./doc/take4-console-backlog.md). The user
points to one backlog item at a time (by id, e.g. `P0-2`); Claude delivers the
full change in a single PR-style batch before moving on to the next.

### Working rules per backlog item

Every task must produce **all** of the following, in this order, before the
next task starts:

1. **Implementation** in `src/`, following all conventions above. Types live
   in `src/Screen/types.mts`; public API is re-exported from
   `src/index.mts`.
2. **Tests** in `tests/` — extend the existing test file for the affected
   class/module; full suite must stay green (`npx vitest run`). TypeScript must
   type-check cleanly (`npx tsc --noEmit`).
3. **Demo / kitchen-sink update** — wire the new feature into
   `src/demo.mts` + `src/layout.yaml` so it is exercised visibly at runtime.
   If the feature cannot be shown, explain why in the commit message.
4. **Per-task documentation** in `doc/<id>-<slug>.md` (e.g.
   `doc/p0-1-listbox-custom-render.md`) — API, algorithm, examples, backwards
   compatibility notes, and the list of files changed.
5. **Version bump** in `package.json` — minor bump per backlog batch (P0-1
   landed as 0.16.0); patch bumps only for fixups that don't ship new API.
6. **CHANGELOG entry** under the new version, linked back to the backlog id
   (e.g. "Added — backlog P0-1 (custom per-row rendering w ListBox)").
7. **Backlog progress update in this file** — tick the item off in the
   progress table below and update "currently working on" if relevant.
8. **Commit + push** on `develop`. The commit message body names the backlog
   id and the version bump. Never amend previous commits for a new task; each
   backlog item gets its own commit.

### Rules that are easy to forget

- `renderItem`-style generic APIs must default to the pre-existing string
  behaviour so that consumers of the old API continue to compile and render
  identically without opt-in.
- When a feature changes the shape of data accepted via YAML
  (`layout.yaml`), either update the YAML so the demo keeps rendering, or
  remove the stale data and populate it at runtime from `demo.mts`.
- Don't touch unrelated uncommitted changes in the working tree (e.g.
  `README.md` edits) when staging a backlog commit — stage only the files
  that belong to the current task.
- Tests that need `BUILTIN_*` styles must instantiate a `Screen` first so the
  global registry is primed; otherwise `writeText` without an explicit style
  blows up.

### Backlog progress

Totals: **60 items** — P0: 12, P1: 22, P2: 26.

| Sprint | Id    | Title                                   | Version | Status |
| ------ | ----- | --------------------------------------- | ------- | ------ |
| 1      | P0-1  | Custom per-row rendering w ListBox      | 0.16.0  | ✅ done (2026-04-16) |
| 1      | P0-2  | Rich text / multi-style writeText       | 0.18.0  | ✅ done (2026-04-16) |
| 1      | P0-3  | Flex layout (auto-sizing)               | —       | ⏳ pending |
| 1      | P0-4  | onKey preventDefault + kolejność        | 0.20.0  | ✅ done (2026-04-16) |
| 1      | P0-5  | WindowManager.pause() / resume()        | —       | ⏳ pending |
| 1      | P0-6  | onChange w TextBox / TextArea           | 0.21.0  | ✅ done (2026-04-16) |
| 1      | P0-7  | Text measurement z East-Asian width     | 0.17.0  | ✅ done (2026-04-16) |
| 1      | P0-8  | Window.setVisible(bool)                 | 0.22.0  | ✅ done (2026-04-16) |
| 1      | P0-9  | Rozszerzenie BorderStyle                | 0.17.0  | ✅ done (2026-04-16) |
| 1      | P0-10 | InterfaceBuilder: register custom types | —       | ⏳ pending |
| 1      | P0-11 | Screen: alt-screen + hide-cursor opcja  | 0.19.0  | ✅ done (2026-04-16) |
| 1      | P0-12 | SIGWINCH autoresize + event             | 0.19.0  | ✅ done (2026-04-16) |

P1 / P2 items are tracked only in `doc/take4-console-backlog.md` until their
sprint begins; they will be appended to this table as they land.

**Currently working on:** Sprint 1 (P0 — blokery migracji rpcoon). Next up:
whichever P0-x the user calls out. Sprint 1 ends when all twelve P0 items
ship — that unblocks the rpcoon migration.
