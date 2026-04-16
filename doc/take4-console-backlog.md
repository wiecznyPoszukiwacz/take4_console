# take4-console — backlog rozwoju

> Zbiór zadań do implementacji w bibliotece
> [`take4-console`](https://github.com/wiecznyPoszukiwacz/take4_console).
> Każde zadanie jest niezależne i może być zrealizowane w osobnym PR.
>
> Priorytety:
> - **P0** — blokery migracji rpcoon z Ink/React na take4-console.
> - **P1** — fundament DX (developer experience), nie blokują migracji,
>   ale drastycznie podnoszą jakość biblioteki.
> - **P2** — bells & whistles, ambicja poziomu „blessed + Ink razem wzięte".
>
> Effort:
> - **S** < 1 dzień
> - **M** 1–3 dni
> - **L** > 3 dni

Łącznie 60 zadań. Kolejność realizacji rekomendowana na końcu dokumentu.

---

## P0 — blokery migracji rpcoon

### P0-1. Custom per-row rendering w ListBox · M

Dziś `ListBox.setItems(items: string[])` — jeden styl na wiersz.
rpcoon potrzebuje kolorowych ikon (`󰄬` zielona / `󰅖` czerwona),
dimmed-timestamp, yellow dirty-indicator, right-aligned meta.

```typescript
interface ListBoxProperties<T = string> {
  items?: T[];
  selectedIndex?: number;
  onChange?: (index: number, item: T) => void;
  /** Custom renderer returning styled segments. Default: single text segment. */
  renderItem?: (item: T, ctx: ListBoxRenderContext) => ListBoxRowSegments;
  /** Row height in cells. Default: 1. */
  rowHeight?: number;
  keyFn?: (item: T) => string;   // stable key for React-like reconciliation
}
interface ListBoxRenderContext {
  index: number;
  focused: boolean;   // list has focus
  selected: boolean;  // this row is selected
  width: number;      // inner width for the row
}
type ListBoxRowSegments =
  | string
  | Array<{ text: string; style?: StyleId; align?: 'left' | 'right' | 'fill' }>;
```

Rysowanie: segmenty układane sekwencyjnie, `align: 'right'` dokleja
do prawej krawędzi, `'fill'` wyrównuje (jeden fill segment per wiersz).

### P0-2. Rich text / multi-style writeText · S

Dziś `writeText(str, { style })` aplikuje jeden styl. Potrzebne
segmenty inline dla info-bar, history rows, command completion.

```typescript
type WriteTextInput =
  | string
  | Array<{ text: string; style?: StyleId }>
  | Array<{ text: string; attrs?: CellAttributes }>;   // bez pre-rejestracji

window.writeText(input: WriteTextInput, options?: WriteTextOptions): void;
```

Bonus: helper `writeMarkup("{error}err{/} {dim}details{/}")` rozwijający
nazwane style z registry.

### P0-3. Flex layout (auto-sizing) · L

Dziś: absolute / percent / edge-relative / presets. Brak `flexGrow`,
`gap`, auto rozmiar do treści.

```typescript
class Pos {
  static flex(order?: number): Pos;   // row/column slot position
}
class Size {
  static flex(grow?: number, shrink?: number, basis?: DimSpec): Size;
  static content(): Size;             // size = natural content
}
interface WindowProperties {
  layout?: 'absolute' | 'row' | 'column' | 'grid';
  gap?: number;                        // spacing between children
  padding?: number | { top; right; bottom; left };
  gridColumns?: number;               // for layout: 'grid'
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
}
```

Silnik: przy `addChild` + `render()` rozwiąż layout — z `flexGrow`
pro rata, `gap` między, `padding` wokół.

### P0-4. onKey preventDefault + kolejność · S

Dziś `WindowManagerOptions.onKey` wywoływane przed dispatchem, ale
brak sposobu anulowania (klawisz i tak idzie do focused control).
Aplikacje potrzebują global-first shortcut-ów (`q`, `?`, `:`).

```typescript
interface WindowManagerOptions {
  onKey?: (key: string, ctx: KeyContext) => boolean | void;
  //     ^ return true = consumed, don't dispatch to focused control
}
interface KeyContext {
  focusedControl: (Focusable & Window) | null;
  inDialog: boolean;
  dialogDepth: number;
}
```

Dodatkowo: `wm.bindKey('ctrl+s', handler)` — register-based alternative.

### P0-5. WindowManager.pause() / resume() · M

Dziś: `wm.stop()` demontuje terminal state; `wm.run()` bootstrapuje
na nowo. Dla spawn-u `$EDITOR` trzeba **zachować** stan Screen
i wrócić.

```typescript
class WindowManager {
  pause(options?: { leaveAltScreen?: boolean }): void;
  resume(options?: { rerender?: boolean }): void;
}
```

`pause()` — wyłącza raw mode, odłącza stdin listener, opcjonalnie
wychodzi z alt-screen. `resume()` — włącza raw mode, ponownie
rejestruje listenera, wchodzi do alt-screen (jeśli był), woła
`screen.render()`.

### P0-6. onChange w TextBox / TextArea · S

Dziś `TextBoxProperties` ma tylko `value`, `placeholder`, `cursor`.
Brak callbacka. Potrzebne do live-filter w method picker i
command completion.

```typescript
interface TextBoxProperties {
  value?: string;
  placeholder?: string;
  cursor?: number;
  onChange?: (value: string) => void;      // NEW
  onSubmit?: (value: string) => void;      // NEW: Enter
  onKeyDown?: (key: string) => boolean;    // NEW: pre-dispatch hook, true = handled
}
interface TextAreaProperties {
  /* jak wyżej + */
  insertTabAsSpaces?: number;              // 0 = Tab = focus-cycle, N = insert N spaces
  ctrlDDeletesForward?: boolean;           // default: false
}
```

### P0-7. Text measurement z East-Asian width · M

NerdFonts glyphs (`󰄬 󰑮 󰅖`), emoji, CJK — mogą zajmować 2 cell-e.
Dziś `writeText` traktuje każdy codepoint jako 1 cell, więc layout
się rozjeżdża.

```typescript
// Nowy moduł: src/Screen/textWidth.mts
export function charWidth(codepoint: number): 0 | 1 | 2;
export function stringWidth(str: string): number;

// Window:
getTextWidth(str: string): number;

// writeText() respektuje double-width automatycznie.
```

Implementacja: Unicode East Asian Width tabela (kompaktowa,
compile-time) + overrides dla popularnych NerdFonts ranges
(U+E000–F8FF PUA traktowane jako width 1 lub 2 konfigurowalnie
per-Screen).

### P0-8. Window.setVisible(bool) · S

```typescript
class Window {
  setVisible(visible: boolean): void;
  isVisible(): boolean;
}
```

Gdy `visible === false`: `render()` robi `clear()` i zwraca
pusty region (pomijamy wszystkie kroki paint). `getCell()`
throw'uje. Focus-cycle pomija.

### P0-9. Rozszerzenie BorderStyle · S

Obecnie `'single' | 'double' | 'rounded'`. Dodać:
- `'thick'` — heavy box-drawing (`━┃┏┓`);
- `'dashed'` — (`╌╎`);
- `'ascii'` — (`-|+`), fallback dla terminali bez Unicode;
- `'none'` — placeholder (same functional as false, ale jawny);
- `WindowBorder.chars?: Partial<BorderChars>` — custom per-side chars.

```typescript
interface BorderChars {
  horizontal: string;
  vertical: string;
  topLeft: string; topRight: string;
  bottomLeft: string; bottomRight: string;
  verticalLeft?: string;  // T-junctions (for tables)
  verticalRight?: string;
  horizontalTop?: string;
  horizontalBottom?: string;
  cross?: string;
}
```

### P0-10. InterfaceBuilder: register custom types · S

Dziś YAML obsługuje tylko wbudowane 15 typów. Custom kontrolki
wymagają placeholder + swap. Dodać:

```typescript
class InterfaceBuilder {
  registerType<P>(
    name: string,
    factory: (node: YamlWindowDef, registry: StyleRegistry) => Window,
  ): void;
}
// usage:
builder.registerType('yamlEditor', (node) => new YamlEditor(
  { pos: resolvePos(node.pos), size: resolveSize(node.size) },
  { value: node.value ?? '' }
));
```

W YAML: `type: yamlEditor`. Builder po prostu woła fabrykę
z zasolvowanymi Pos/Size i przekazuje inne pola jako `node`.

### P0-11. Screen: alt-screen + hide-cursor opcja · S

```typescript
interface ScreenOptions {
  altScreen?: boolean;      // default: false — enter alt-screen buffer on run
  hideCursor?: boolean;     // default: false — hide hardware cursor
  targetFps?: number;       // frame-rate cap; default: unlimited
}
new Screen(options?: ScreenOptions);
```

Screen robi `stdout.write('\x1b[?1049h\x1b[?25l')` w konstruktorze
i handler SIGTERM/SIGINT cleanup. Zmniejsza boilerplate w konsumentach.

### P0-12. SIGWINCH autoresize + event · S

```typescript
class Screen extends EventEmitter {
  on(event: 'resize', listener: (size: TerminalSize) => void): this;
  on(event: 'frame', listener: (stats: { ms: number }) => void): this;
}
```

Na SIGWINCH: Screen przelicza własny rozmiar, re-flow children
przez `reflowChildren()`, emituje 'resize'.

---

## P1 — fundament DX

### P1-13. Generics w ListBox/Tabs · S

```typescript
class ListBox<T = string> extends Window implements Focusable { … }
class Tabs<T = string>   extends Window implements Focusable { … }
```

Typesafe `getSelectedItem(): T | undefined`, `onChange(idx, item: T)`.

### P1-14. Chords i key aliases · M

```typescript
wm.bindKey('ctrl+s', handler);
wm.bindKey('g g',    handler);           // chord: two keys w/in 500ms
wm.bindKey('ctrl+shift+tab', handler);
```

Parser: `'ctrl+s'` → `'\x13'`, `'alt+a'` → `'\x1ba'`. Chord state
machine z timeoutem. `wm.unbindKey(key)`, `wm.listBindings()`.

### P1-15. Theme API first-class · M

Zamiast ręcznego `setBuiltinStyle + registerStyle`:

```typescript
interface Theme {
  name: string;
  builtin: Partial<Record<BuiltinStyleName, CellAttributes>>;
  named: Record<string, CellAttributes>;    // domain-specific styles
  border: { default; focused; disabled };   // default style per state
  borderStyle?: BorderStyle;
}
screen.applyTheme(theme: Theme): void;
screen.getTheme(): Theme;

// Built-in themes:
import { themes } from 'take4-console';
screen.applyTheme(themes.nord);     // nord, dracula, solarizedDark,
                                     // solarizedLight, monochrome, ayuMirage
```

### P1-16. Padding/margin · S

Część P0-3 jeśli nie zrobiona tam samodzielnie:
```typescript
interface WindowProperties {
  padding?: number | [vert, horiz] | { top; right; bottom; left };
  margin?:  number | [vert, horiz] | { top; right; bottom; left };
}
```

`getInnerSize()` i `getInnerOffset()` uwzględniają padding.

### P1-17. Z-index i non-modal overlays · M

Dziś overlay = dialog (modal focus). Niektóre UI (notifications,
tooltips, hover cards) chcą overlay bez zabierania focusu.

```typescript
interface WindowProperties { zIndex?: number; }
screen.addChild(window);   // respektuje zIndex w kolejności rysowania

// Convenience:
screen.toast('Saved!', { duration: 2000 });    // non-modal, auto-dismiss
```

### P1-18. Focus management API · S

```typescript
class WindowManager {
  focusNext(): void;
  focusPrev(): void;
  focusFirst(): void;
  focusLast(): void;
  focusById(id: string): void;          // integracja z InterfaceBuilder
  trapFocus(within: Window): () => void; // returns release fn
}
```

`trapFocus` — Tab cycle ograniczony do potomków `within`, nawet
poza dialog. Przydatne dla kompozytów.

### P1-19. Clipboard (OSC 52) · M

```typescript
import { clipboard } from 'take4-console';
clipboard.write(text);   // emits OSC 52 sequence — terminal stores
clipboard.read(): Promise<string>;  // OSC 52 query + parse response
```

Integracja z `TextBox`/`TextArea`: Ctrl+C/Ctrl+V/Ctrl+X przy focused
kontrolce z selekcją.

### P1-20. Selection w TextBox/TextArea · M

Shift+strzałki → rozszerza selekcję; Shift+Home/End; Ctrl+A select-all;
typing zamienia selekcję; Backspace usuwa selekcję; Ctrl+C copy.

Nowy state: `{ anchor, cursor }`; render → różne style w obrębie selekcji.

### P1-21. TextArea: soft-wrap + scroll · M

Dziś TextArea przewija poziomo (scrollX). Dodać:
```typescript
interface TextAreaProperties {
  wrap?: 'none' | 'char' | 'word';  // default: 'none'
  lineNumbers?: boolean;
}
```

Przy `'word'`: oblicz wrap, renderuj wirtualnie (view model
!== model).

### P1-22. onFocus / onBlur · S

```typescript
interface WindowProperties {
  onFocus?: () => void;
  onBlur?:  () => void;
}
```

Wywoływane przez `WindowManager.setFocus`. Umożliwia np.
selekcję tekstu przy focus, walidację przy blur.

### P1-23. Error boundary · S

Jeśli `control.render()` rzuca: złap exception, renderuj
placeholder „⚠ render error: message" w stylu error, loguj
przez `wm.onError` hook, kontynuuj renderowanie pozostałych
Windows.

```typescript
interface WindowManagerOptions {
  onError?: (err: Error, control: Window) => void;
}
```

### P1-24. Virtualized ListBox · L

Dla 100k+ items. Renderuje tylko widoczny zakres + bufor;
scrollbar optional.

```typescript
interface ListBoxProperties<T> {
  virtualized?: boolean;            // default: false (auto when items > 1000)
  estimatedRowHeight?: number;      // default: 1
}
```

### P1-25. Built-in Select/Dropdown · M

```typescript
class Select<T = string> extends Window implements Focusable {
  constructor(wp, cp: {
    items: T[];
    value?: T;
    placeholder?: string;
    renderItem?: (item: T) => string;
    onChange?: (value: T) => void;
  });
}
```

Closed: wygląda jak Button `▼ value`. Open: modal ListBox
(przez `wm.openDialog`).

### P1-26. Built-in Combobox / AutocompleteInput · M

TextBox + popup ListBox z fuzzy-match. Specyficznie dla
command palette, method picker.

```typescript
class Combobox<T = string> extends Window implements Focusable {
  constructor(wp, cp: {
    items: T[];
    value?: string;
    renderItem?: (item: T) => string;
    match?: (query: string, item: T) => boolean;
    fuzzy?: boolean;                 // default: true
    onChange?: (value: string) => void;
    onSelect?: (item: T) => void;
  });
}
```

### P1-27. Built-in Toast / Notification · S

```typescript
screen.toast(text, { duration?, style?, position? }): void;
```

Pokazuje window w rogu ekranu (domyślnie top-right), auto-dismiss
po `duration` ms, non-modal. Może być stacked.

### P1-28. Built-in prompt / alert · S

```typescript
wm.prompt(message, { default?: string }): Promise<string | null>;
wm.confirm(message): Promise<boolean>;
wm.alert(message): Promise<void>;
```

Modal dialogs, odpowiedniki `window.prompt/confirm/alert`.

### P1-29. InterfaceBuilder: variables / interpolation · S

```yaml
variables:
  appName: rpcoon
  version: 0.10.0
windows:
  - id: infoBar
    content: "{{appName}} v{{version}} — {{url}}"
```

```typescript
builder.buildFromFile(path, screen, wm, {
  variables: { url: 'http://localhost:8545' }
});
```

### P1-30. InterfaceBuilder: hot reload · M

```typescript
builder.watchFile(path, screen, wm, { onChange });
// rebuild tree in place, preserve Window state where id matches
```

Użyteczne w dev flow — edytujesz layout.yaml, aplikacja się
odświeża bez restartu.

### P1-31. Testing utilities · M

```typescript
import { createTestScreen, simulateInput, snapshotAnsi } from 'take4-console/testing';

const { screen, wm } = createTestScreen({ width: 80, height: 24 });
simulateInput(wm, 'hello\x1b[C\r');
expect(snapshotAnsi(screen)).toMatchSnapshot();
```

Oraz: `screen.toText()` (bez ANSI, tylko chars), `expectCell(x,y)`
matcher.

### P1-32. screen.toAnsi(): string · S

Eksport frame-u jako jeden string bez side-effect-u. Do
testowania, logowania, screenshot-ów, rsync-a po sieci.

### P1-33. Mouse wheel + drag · M

Dziś: `'press' | 'release' | 'move'`. Dodać:
```typescript
interface TerminalMouseEvent {
  type: 'press' | 'release' | 'move' | 'wheel' | 'drag';
  delta?: number;   // wheel
}
```

ListBox auto-scroll na wheel. Window drag-to-move (opt-in).

### P1-34. Focus-follows-mouse · S

```typescript
interface WindowManagerOptions {
  focusFollowsMouse?: boolean;     // default: false
}
// + per-control onMouseEnter / onMouseLeave
```

---

## P2 — bells & whistles

### P2-35. Built-in Table control · L

Sortowalne kolumny, resizing, virtual scroll, header row.

```typescript
class Table<T> extends Window implements Focusable {
  constructor(wp, cp: {
    columns: Array<{ id; title; render?: (row: T) => string; width?; align? }>;
    rows: T[];
    sortable?: boolean;
    onSelect?: (row: T) => void;
  });
}
```

### P2-36. Built-in Tree control · L

Expand/collapse, lazy children loading, checkboxy per-row (file
tree).

### P2-37. Built-in Form control · M

Kontener grupujący, z submit/reset, walidacja per-field,
focus-next-on-enter.

### P2-38. Built-in LogView · M

Append-only, auto-follow, scroll-back pause, filtrowanie,
syntax coloring per-log-level.

### P2-39. Built-in MarkdownView · M

Podzbiór markdown — headers, bold/italic, lists, inline code,
code blocks.

### P2-40. Built-in CodeEditor (syntax highlighting) · L

`extends TextArea`. Regex-based highlighter dla kilku języków
wbudowanych (JSON, YAML, TypeScript, Markdown, shell), rejestr
userowych gramatyk.

```typescript
class CodeEditor extends TextArea {
  constructor(wp, cp: TextAreaProperties & {
    language?: 'json'|'yaml'|'typescript'|'markdown'|'shell';
    tabSize?: number;
    lineNumbers?: boolean;
  });
}
```

### P2-41. Built-in CommandPalette · M

VS-Code style: fuzzy search, recently-used, scope'd commands.
```typescript
class CommandPalette extends Window { … }
wm.registerCommand({ id, title, keywords, handler, scope? });
wm.openCommandPalette();
```

### P2-42. Built-in Slider · S

Horizontal/vertical z thumbem, strzałki zmieniają wartość,
mouse drag.

### P2-43. Built-in DatePicker · M

Calendar view, arrow keys, today-highlight.

### P2-44. Built-in StatusBar preset · S

```typescript
class StatusBar extends Window {
  setSegments(segments: Array<{ text; style?; align?: 'left'|'center'|'right' }>): void;
}
```

Rozwiązuje typowy pattern (jak rpcoon status bar).

### P2-45. Built-in Breadcrumb / Tabs vertical · S

Warianty istniejącego Tabs.

### P2-46. Animations / tween · M

```typescript
import { tween, easing } from 'take4-console';
tween({ from: 0, to: 100, duration: 500, easing: easing.easeOutCubic,
  onUpdate: v => progressBar.setValue(v),
});
```

Integracja z `screen.on('frame')` do synchronizacji z renderingiem.

### P2-47. Frame-rate control · S

```typescript
new Screen({ targetFps: 60 });
screen.requestRender();  // coalesces multiple requests into one frame
```

Chroni przed > 1000 render()/sec w chaotycznych setterach.

### P2-48. Debug overlay · S

```typescript
wm.toggleDebug();   // F12 default
```

Pokazuje FPS, Window tree, focused control, cell grid overlay.

### P2-49. Icon library (NerdFonts) · S

```typescript
import { icons } from 'take4-console';
icons.check      // '󰄬'
icons.cross      // '󰅖'
icons.folder     // ''
// …
```

Tylko stałe + tabela Unicode, żeby user nie musiał szukać ręcznie.

### P2-50. ASCII fallback mode · M

```typescript
new Screen({ unicode: false });
```

Wszystkie box-drawing → ASCII (`-|+`), ikony → tekstowe
odpowiedniki (`[x]` zamiast `󰄬`). Dla CI, SSH do starych maszyn.

### P2-51. Plugin API · M

```typescript
import { definePlugin, registerPlugin } from 'take4-console';

const markdownPlugin = definePlugin({
  name: 'markdown',
  controls: { MarkdownView },
  themes: { github },
});
registerPlugin(markdownPlugin);
```

Konwencja: paczki `take4-plugin-*` na npm.

### P2-52. CLI scaffolder · S

```bash
npx create-take4-app my-tui
```

Generuje boilerplate: `package.json`, `tsconfig.json`, `src/index.mts`,
`src/layout.yaml`, Vitest config.

### P2-53. Examples gallery · M

W `examples/` → 10+ kompletnych demo: dashboard, chat, pipe-viewer,
http-client (rpcoon-lite!), file-browser, log-tail, progress-monitor,
form, dialog-showcase, theme-switcher.

### P2-54. Logging · S

```typescript
import { setLogger } from 'take4-console';
setLogger({ warn: (msg) => fs.appendFileSync('tui.log', msg) });
```

Wewnętrzne warningi (out-of-bounds writes, missing styles,
mismatched addChild) idą tam zamiast do `console.error`
(który psuje render).

### P2-55. Snapshot testing utility · S

```typescript
import { matchScreenSnapshot } from 'take4-console/testing';
matchScreenSnapshot(screen, 'dashboard.txt');
```

Plaintext snapshoty dla regresji UI.

### P2-56. Accessibility (OSC-based) · M

Gdzie terminal wspiera: emit OSC 177 (custom) z etykietami dla
screen readera. Zgodność z iTerm2/VTE/WezTerm extensions.

### P2-57. Mouse hover cards / tooltip · S

```typescript
window.setTooltip('Click to save');
// after 500ms hover: toast-like popup near cursor
```

### P2-58. Internationalization · S

```typescript
import { setLocale } from 'take4-console';
setLocale('pl');   // affects date formats, number separators in built-in controls
```

### P2-59. Double-buffer / damage tracking · L

Obecnie: cały region rysowany co render. Dla dużych Screen-ów
z rzadkimi zmianami można diff-ować i emitować tylko delta ANSI.
Profilowany feature-flag.

### P2-60. Server mode (SSH/WS) · L

```typescript
import { serveHttp } from 'take4-console/server';
serveHttp(screen, wm, { port: 3000, protocol: 'xterm.js' });
```

Aplikacja TUI dostępna w przeglądarce (xterm.js) przez WebSocket.
Wielosesyjność, broadcast, readonly view. Najbardziej ambitne.

---

## Kolejność realizacji (rekomendowana)

### Sprint 1 (P0) — ~2 tygodnie · odblokowuje migrację rpcoon

P0-1, P0-2, P0-4, P0-5, P0-6, P0-8, P0-9, P0-10, P0-11, P0-12,
potem P0-3 (flex layout), potem P0-7 (text width).

### Sprint 2 (P1 core) — ~2 tygodnie · profesjonalny DX

P1-13, P1-15 (themes), P1-18 (focus API), P1-20 (selection),
P1-22 (onFocus/Blur), P1-23 (error boundary), P1-25/26
(Select/Combobox), P1-31 (testing utilities).

### Sprint 3 (P1 rest + P2 must-haves) — ~2 tygodnie

P1-19 (clipboard), P1-21 (soft-wrap), P1-24 (virtualization),
P1-27 (toast), P1-28 (prompt), P1-30 (hot reload),
P2-44 (StatusBar), P2-47 (frame-rate), P2-49 (icons).

### Sprint 4+ (P2 ambicja)

P2-35 (Table), P2-40 (CodeEditor), P2-41 (CommandPalette),
P2-46 (animations), P2-53 (examples gallery), P2-60 (server mode).

---

## Po ukończeniu Sprint 1 → migracja rpcoon

Dopiero po P0-1…P0-12 rpcoon może być zmigrowany 1:1 bez regresów.
Do tego czasu migracja jest blokowana (zgodnie z zastrzeżeniem:
„nie próbuj obchodzić braków biblioteki take4-console").

Po migracji rpcoon automatycznie staje się testem integracyjnym
dla biblioteki — każda zmiana w take4 musi pozwolić rpcoon dalej
działać.
