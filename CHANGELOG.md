# Changelog

## [0.25.0] – 2026-04-18

### Added — backlog P0-10 (InterfaceBuilder: register custom types)
- **`InterfaceBuilder#registerType(name, factory)`** — rejestruje niestandardową
  fabrykę kontrolki adresowalną przez `type: <name>` w YAML. Fabryka otrzymuje
  surowy `YamlWindowDef` oraz `CustomTypeContext` z wstępnie zresolvowanym
  `wp: WindowProperties`, aktywnym `registry: StyleRegistry` oraz pomocniczym
  `resolveCallback(id)` przekierowującym do wcześniej zarejestrowanych
  callbacków. Próba rejestracji pod nazwą wbudowanego typu rzuca wyjątkiem,
  żeby uniknąć cichego shadowingu.
- **`YamlWindowDef.props`** — wolne pole `Record<string, unknown>` forwardowane
  w całości do fabryki; wbudowane typy je ignorują.
- **Auto-focus registration** — jeśli fabryka zwróci `Window` z metodą
  `handleKey()`, builder automatycznie rejestruje go w `WindowManager` razem
  z łańcuchem rodziców, tak samo jak wbudowane `Button`/`TextBox`/itd.
- **Eksporty**: nowe typy `CustomTypeContext` oraz `CustomTypeFactory` są
  publicznie dostępne z `take4-console`.
- **Demo**: w `src/demo.mts` rejestrowany jest custom typ `badge` (klasa
  `Badge extends Window` malująca etykietę w render()), a `src/layout.yaml`
  używa go w pasku nagłówka (`id: buildBadge`, `props: { text, color }`).

## [0.24.0] – 2026-04-18

### Added — backlog P0-3 (flex layout / auto-sizing)
- **`WindowProperties.layout: 'absolute' | 'row' | 'column' | 'grid'`** — nowy,
  per-okienny tryb layoutu dla bezpośrednich dzieci. Domyślnie `'absolute'`,
  czyli dotychczasowe zachowanie (`Pos`/`Size` rozwiązuje każde dziecko
  niezależnie). `'row'` i `'column'` uruchamiają silnik flex (rozdzielenie osi
  głównej pro-rata `grow`, skurcz `shrink`, wyrównanie cross-axis), `'grid'`
  rozkłada dzieci w równe komórki wiersz-po-wierszu.
- **Nowe pola `WindowProperties`**: `gap` (odstęp między dziećmi w cellach),
  `padding` (uniform number | `[v, h]` tuple | per-side record; wpływa na
  `getInnerSize()` / `getInnerOffset()` — stackuje na border inset),
  `gridColumns` (liczba kolumn dla `grid`), `alignItems`
  (`start | center | end | stretch`, domyślnie `'stretch'`) oraz
  `justifyContent` (`start | center | end | space-between | space-around`).
- **`Pos.flex(order?)` / `Pos#getFlexOrder()`** — marker pozycji flex. Silnik
  layoutu parenta ustawia finalne `child.x / child.y`; `order` sortuje dzieci
  niezależnie od kolejności `addChild` (stabilne ties → kolejność wstawiania).
- **`Size.flex(grow?, shrink?, basis?)` / `Size.content()`** oraz osobne
  fabryki `flex()` i `content()` — `Size.flex(...)` zaznacza oba axes jako
  flex (silnik decyduje który jest main vs cross na podstawie parenta),
  `Size.content()` używa aktualnych wymiarów regionu dziecka jako naturalnego
  rozmiaru. Dla mieszanych osi: `new Size(flex(), 10)` / `new Size(content(),
  pct(50))`. `Size.isAbsolute()` zwraca `false` dla flex/content — `resolve()`
  daje bezpieczny fallback (basis dla flex, 1 dla content) dopóki silnik nie
  nadpisze wartości. Nowe gettery `getWidthSpec()` / `getHeightSpec()`.
- **Silnik layoutu w `Window`** — `addChild` i `setSize` (→ `reflowChildren`)
  delegują do `runLayout()`. Absolute path zachowany 1:1 dla back-compat;
  row / column liczą basis, rozdzielają `remainder` przez `grow` (całkowite,
  reszta od truncation trafia do ostatniego flex-a), skracają przy ujemnym
  remainderze przez `shrink`, aplikują stretch/align cross-axis i — gdy nic
  nie zjada slack'u — uruchamiają `justifyContent`. `grid` liczy równe komórki
  `(inner - gap * (cols|rows - 1)) / (cols|rows)`. Niewidoczne dzieci są
  pomijane, więc `setVisible(false)` wyjmuje je ze stacka.
- **YAML (InterfaceBuilder)** — wspiera `pos: flex` / `pos: { flex: N }`,
  `size: flex` / `size: content` / `size: { flex: { grow, shrink, basis } }`,
  a także per-axis `size: { width: content, height: { flex: { grow: 2 } } }`.
  Nowe pola `layout`, `gap`, `padding`, `gridColumns`, `alignItems`,
  `justifyContent` na każdej definicji okna.
- **`Window#blitChild`** czyta teraz `child.x / child.y` zamiast re-solve'ować
  `posSpec`, więc absolute i flex lecą tym samym kodem kompozycji.

### Demo
- `src/layout.yaml` — dolny pasek akcji (Delete / Cancel /  Save) przekonwertowany
  z trzech absolutnych pozycji na kontener `buttonRow` z `layout: row`,
  `gap: 1`, `alignItems: stretch` i dzieckiem-spacerem `{ size: flex }` między
  "Delete" a grupą "Cancel /  Save" — ten sam wygląd co wcześniej, zapisany
  deklaratywnie, automatycznie re-flow przy SIGWINCH.

## [0.23.0] – 2026-04-16

### Added — backlog P0-5 (WindowManager.pause / resume)
- **`WindowManager.pause(options?)` / `resume(options?)` / `isPaused()`** —
  tymczasowo zwalnia kontrolę nad terminalem bez niszczenia focus tree,
  rejestracji kontrolek ani stosu dialogów. `pause()` odłącza listener
  stdin, wyłącza raw mode + mouse tracking, pokazuje kursor i opcjonalnie
  (`{ leaveAltScreen: true }`) wychodzi z alt-screen buffer. `resume()`
  re-enter-uje alt-screen (jeśli pause go zamknął), re-enable mouse,
  ukrywa kursor z powrotem, re-attach stdin + raw mode i re-renderuje
  klatkę (chyba że `{ rerender: false }`). Obie metody są idempotentne.
  Typowe użycie: `pause({ leaveAltScreen: true })` → `spawnSync('$EDITOR')`
  → `resume()`.
- **`WindowManager.stop()`** rozpoznaje stan pauzy i nie powtarza teardownu
  stdin / mouse / raw mode, które pause już zrobiła — unika podwójnego
  `stdin.off('data', …)`. Reszta semantyki stop bez zmian.

### Demo
- `src/demo.mts` — `bindKey('ctrl+e')` pauzuje TUI (wychodzi z alt-screen),
  drukuje prompt `--- paused … Press Enter to return ---`, blokuje na
  `bash -c 'read -r _'` w podpowłoce i po `Enter` wywołuje `resume()`.
  Focus, helpMode i historia sparkline-ów są zachowane przez cały cykl.
- Status bar dostaje `Ctrl+E` w obu trybach (help / normal).

## [0.22.0] – 2026-04-16

### Added — backlog P0-8 (Window.setVisible)
- **`Window.setVisible(visible: boolean)` / `Window.isVisible(): boolean`** —
  ortogonalny do `disabled` przełącznik widoczności. Okna konstruują się
  jako `visible: true`; `setVisible(false)` zamienia `render()` w no-op
  (żadna faza `paintBackground → blitContent → paintBorder → children` się
  nie odpala), a przy przeglądzie dzieci rodzic **pomija** ukryte dziecko,
  więc jego dotychczasowy region nie jest blitowany — widoczne jest tło
  rodzica. `getCell` na ukrytym oknie rzuca wyjątek; `setVisible(true)`
  przywraca okno z nienaruszoną zawartością `content` (hide/show to
  logiczne ukrycie, a nie kasowanie buforu).
- **`WindowManager` respektuje widoczność** — nowy prywatny helper
  `isFocusable(control)` = `!disabled && visible`. Tab / Shift-Tab,
  `setFocus()`, auto-init focusa oraz mouse click hit-test pomijają
  niewidoczne kontrolki tak samo, jak od dawna pomijają disabled.

### Demo
- `src/demo.mts` — `bindKey('v')` toggle'uje widoczność panelu
  `chartsPanel` (Tabs). Status bar dostaje skrót `v` w trybie normal
  i help, żeby feature był używalny bez sięgania do docs.

## [0.21.0] – 2026-04-16

### Added — backlog P0-6 (onChange / onSubmit / onKeyDown w TextBox + TextArea)
- **`TextBoxProperties` / `TextAreaProperties`** rozszerzone o
  `onChange(value)`, `onSubmit(value)` i `onKeyDown(key)` (pre-dispatch
  hook z semantyką `boolean | void` — return `true` = consumed,
  identycznie jak `WindowManagerOptions.onKey` z P0-4).
- **`TextAreaProperties.insertTabAsSpaces`** (domyślnie `0`) — gdy
  `> 0`, Tab wstawia N spacji zamiast cyklować focus; Shift-Tab
  **zawsze** cykluje focus, dzięki czemu user ma kontrolowany escape
  z multi-line input-a.
- **`TextAreaProperties.ctrlDDeletesForward`** (domyślnie `false`) —
  opt-in forward-delete pod `\x04`.
- **`Focusable.capturesTab?()`** — opcjonalny hook sprawdzany przez
  `WindowManager`. `TextArea` implementuje go tak, by zwracał `true`
  wtedy i tylko wtedy gdy `insertTabAsSpaces > 0`.
- **Settery**: `TextBox.setOnChange/SetOnSubmit/SetOnKeyDown`,
  `TextArea.setOnChange/SetOnSubmit/SetOnKeyDown` — do wstrzykiwania
  callbacków po konstrukcji (np. przy YAML-buildowanych kontrolkach).
- **YAML / `InterfaceBuilder`** — nowe pola `YamlWindowDef`:
  `onSubmit`, `onKeyDown`, `insertTabAsSpaces`, `ctrlDDeletesForward`.
  Callbacki wiązane przez istniejące `ib.registerCallback(id, fn)`.

### Changed
- **`TextBox.handleKey`**: Enter (`\r` / `\n` / `'enter'`) nie
  wstawia znaku — odpala `onSubmit(value)`.
- **`TextArea.handleKey`**: alias `'ctrl+enter'` odpala `onSubmit`;
  plain Enter bez zmian (wstawia newline).
- **`WindowManager.handleInput`**: Tab najpierw pyta focused control
  o `capturesTab()` — gdy odpowiedź to `true`, `handleKey('\t')`
  dostaje klawisz zamiast standardowego `moveFocus(+1)`.

### Demo
- `layout.yaml` — `tbUsername` wiąże `onSubmit: usernameSubmitted`.
- `src/demo.mts` — registerCallback `usernameSubmitted` dopisuje
  event do log-u po Enter w polu username.

## [0.20.0] – 2026-04-16

### Added — backlog P0-4 (onKey preventDefault + kolejność)
- **`WindowManagerOptions.onKey`** — nowa sygnatura
  `(key: string, ctx: KeyContext) => boolean | void`. Zwrot `true`
  *konsumuje* klawisz: pomija exit-key check, Tab/Shift-Tab navigation
  i dispatch do focused control. Zwrot `void` / `false` zachowuje
  dotychczasowe pass-through — istniejący kod działa bez zmian.
- **`KeyContext`** — nowy typ publiczny: `{ focusedControl, inDialog,
  dialogDepth }`. Snapshot wzięty przed wywołaniem global handlerów,
  więc widzą spójny widok focus / dialog stack.
- **`WindowManager.bindKey(keySpec, handler)` / `unbindKey(keySpec, handler?)`**
  — register-based alternative dla global shortcut-ów. `bindKey` zwraca
  unbind-funkcję. `keySpec` akceptuje raw strings, nazwy (`enter`,
  `space`, `esc`, strzałki, `pageup/down`, `home/end`, …) oraz
  `ctrl+<letter>`. Wiele handlerów pod jeden klawisz — fire w kolejności
  rejestracji aż pierwszy zwróci `true`.
- **`KeyBindHandler`** — typ publiczny: `(ctx: KeyContext) => boolean | void`.

### Changed
- **Kolejność dispatchu** w `WindowManager.handleInput` — global
  handlery (`bindKey` → `onKey`) **przed** exit-key check / Tab /
  dispatch. Dzięki temu global shortcut może zablokować `q` exit
  (np. confirmation dialog), a TextBox nie "połyka" `?` / `:` / itp.
- **Demo (`src/demo.mts`)** — `bindKey('?')` toggluje help mode
  w status barze; `bindKey('ctrl+r')` wymusza `tick()` out-of-band.
  Status bar stale pokazuje skrót `?` zamiast tylko `q`.

## [0.19.0] – 2026-04-16

### Added — backlog P0-11 (Screen alt-screen + hide-cursor opcja)
- **`ScreenOptions`** — nowy interfejs publiczny: `altScreen?`, `hideCursor?`,
  `targetFps?`. `new Screen({ altScreen: true, hideCursor: true })` sam
  wchodzi w alt-screen buffer i ukrywa kursor — koniec boilerplate'u dla
  konsumentów-bez-WindowManagera.
- **`Screen.enterAltScreen` / `exitAltScreen` / `hideHardwareCursor` /
  `showHardwareCursor`** + odpowiadające `is…` queries. Wszystkie idempotentne;
  pozwalają zewnętrznemu kodowi (w tym `WindowManager`-owi) dzielić ten sam
  state machine.
- **`Screen.dispose`** — przywraca każdą zmianę w stanie terminala i
  odpina listenery sygnałów. Idempotentne. Połączone z `process.on('exit')`,
  więc cleanup last-chance odpalą się też przy `process.exit()` /
  naturalnym end-of-loop.
- **`Screen.getTargetFps`** — soft cap z `ScreenOptions` zwracany do inspekcji
  (pełny enforcement w P2-47).

### Added — backlog P0-12 (SIGWINCH autoresize + event)
- **`Screen` event API**: `screen.on('resize', listener)` i
  `screen.on('frame', listener)` (typed overloads). Pod spodem
  composed `EventEmitter`, więc Window class hierarchy zostaje płaska.
- **`Screen.resize(width?, height?)`** — pobiera nowe wymiary z
  `process.stdout` (lub z explicit args), reflowuje dzieci procentowe,
  emituje `'resize'`. Wywoływane automatycznie przez SIGWINCH handler.
- **`render()`** mierzy wall-clock i emituje `'frame'` z `{ ms }`
  po każdym wywołaniu — daje hak do telemetrii FPS / animation loopów.
- **`Window.setSize(width, height)`** — publiczny wrapper na
  `resizeRegions` (zmienione z `private` na `protected`). Reflowuje
  dzieci procentowe pod nowy parent area.

### Changed
- **`WindowManager.run/stop`** — używa `screen.enterAltScreen` /
  `hideHardwareCursor` zamiast pisać escape'y wprost. Tracking ownership
  przez `ownsAltScreen` / `ownsCursor`: jeżeli `Screen` ustawił stan
  w konstruktorze (`ScreenOptions`), `stop()` go nie wycofuje — alt-screen
  przeżywa restart WM-a aż do `Screen.dispose()`.
- **Demo (`src/demo.mts`)** — `new Screen({ altScreen: true, hideCursor: true })`,
  `screen.on('resize', …)` aktualizujący status bar i wykonujący `screen.render()`,
  `screen.dispose()` w `onExit` callbacku WindowManagera. Status bar wydzielony
  jako `redrawStatusBar()` żeby etykieta `${width}×${height}` mogła być
  przerysowana po resize.
- **`Screen` listener cap** — statyczny licznik aktywnych instancji bumpuje
  `process.setMaxListeners(10 + n*2)`, dispose dekrementuje. Eliminuje
  `MaxListenersExceededWarning` w suite-ach testowych z wieloma `new Screen()`.

### Tests
- 9 nowych testów w `tests/Screen.test.mts` (ScreenOptions, dispose,
  resize, frame event) + `afterEach(dispose)`.
- 1 nowy test w `tests/WindowManager.test.mts` (lifecycle: brak podwójnego
  toggle dla alt-screen i kursora) + `afterEach(dispose)`.
- Pełna suita: 499 testów, wszystkie zielone.

### Docs
- Dodano `doc/p0-11-and-p0-12-screen-lifecycle.md` — pełny opis API,
  cyklu życia, interakcji z WindowManager, backwards compatibility i
  zmienionych plików.

## [0.18.0] – 2026-04-16

### Added — backlog P0-2 (rich text / multi-style writeText)
- **`Window.writeText`** akceptuje teraz `WriteTextInput = string | WriteTextSegment[]`.
  Segmenty są renderowane inline — kursor „płynie" przez kolejne segmenty bez
  resetowania X, więc info-bary, history rows czy command completion nie
  wymagają ręcznego liczenia pozycji. Każdy segment może podać własny
  `style: StyleId` (mergowany z base) albo `attrs: CellAttributes` (rejestrowane
  ad hoc w `StyleRegistry`). Pusta tablica jest no-opem.
- **`Window.writeMarkup(template, options?)`** — mini-markup `{name}…{/}` dla
  nazwanych stylów z `StyleRegistry`. Tagi wspierają zagnieżdżanie
  (wewnętrzny styl jest mergowany na zewnętrzny), `{/}` zamyka najbliższy
  otwarty tag, `{{` / `}}` to escape literalnych nawiasów klamrowych, nieznane
  nazwy nie zmieniają stylu. Template kompilowany jest do `WriteTextSegment[]`
  i puszczany przez `writeText`, więc layout/width/clipping idą tą samą ścieżką.
- **`WriteTextSegment`**, **`WriteTextInput`** — nowe typy publiczne w
  `src/Screen/types.mts`, eksportowane z `take4-console` barrel-a.

### Changed
- **`Window.writeText` pętla renderująca**: zachowana (East-Asian width,
  zero-width skip, sentinel `''` dla wide chars, clipping). Dodano zewnętrzną
  pętlę po segmentach i jednorazowe policzenie bazowego stylu.
- **Demo (`src/demo.mts`)** — nagłówek ekranu używa `writeMarkup` z nazwanymi
  stylami `hdr:app` / `hdr:mode` / `hdr:sep` (rejestrowane przez
  `Screen.setBuiltinStyle`). Status bar przeszedł na segmentowy `writeText`
  z inline'owymi skrótami, separatorem i sekcją dim pokazującą emoji/CJK
  (double-width) — cała linia jednym wywołaniem.

### Docs
- Dodano `doc/p0-2-rich-text-writetext.md` — pełny opis API, algorytmu,
  gramatyki markup-u i kompatybilności wstecznej.

## [0.17.0] – 2026-04-16

### Added — backlog P0-7 (text measurement z East-Asian width)
- **`src/Screen/textWidth.mts`** — nowy moduł z funkcjami `charWidth(cp)`,
  `stringWidth(str)`, `setPuaWidth(1|2)`, `getPuaWidth()`. Tabela szerokości
  oparta o Unicode East Asian Width (kategorie W i F) plus zero-width
  control / combining / format / variation selectors / ZWJ / BOM.
- **`Window.getTextWidth(text)`** — zwraca display width tekstu w komórkach
  terminala, odpowiednik `stringWidth` dostępny na każdym Window/kontrolce.
- **`Window.writeText`** uwzględnia szerokość znaków:
  - znaki szerokie (CJK, emoji, double-width NerdFonts) zajmują dwie kolejne
    komórki — `''` w komórce kontynuacyjnej jako sentinel;
  - kursor wewnątrz pętli zaawansowuje się o `charWidth(ch)`;
  - znaki o szerokości 0 (combining, control) są pomijane;
  - wide znaki, których prawa połówka wykraczałaby poza inner-width, są
    pomijane w całości (zachowanie alignmentu).
- **`Screen.render`** pomija continuation cells (`ch === ''`), dzięki czemu
  ANSI output nie emituje stub'a — terminal po wide znaku już ma kursor
  zaawansowany o 2 kolumny.
- **Konfigurowalna szerokość PUA** (NerdFonts) przez `setPuaWidth(1|2)` —
  domyślnie `1` (większość patched fontów ma single-cell glyphs).
- Eksportowane z `take4-console` barrel-a: `charWidth`, `stringWidth`,
  `setPuaWidth`, `getPuaWidth`.

### Changed
- **Demo (`src/demo.mts`)** — kilka templates eventów ma double-width
  emoji (`'cache warmed 🚀'`, `'job completed 💾'`); demo prezentuje, że
  wide glyphs nie psują wyrównania w `ListBox` (przy emoji surrogate-pair,
  gdzie `length=2 = displayWidth=2`).

### Added — backlog P0-9 (rozszerzenie BorderStyle)
- **`BorderStyle`** rozszerzony o cztery nowe warianty:
  - `'thick'` — heavy box-drawing (`━┃┏┓┗┛`),
  - `'dashed'` — dashed lines z light corners (`╌╎┌┐└┘`),
  - `'ascii'` — fallback ASCII (`-|+`),
  - `'none'` — jawny placeholder równoważny brakowi ramki (bez insetów).
- **`BorderChars`** — nowy interfejs publiczny opisujący komplet glifów
  (krawędzie, narożniki, opcjonalne T-junctions i cross dla
  przyszłych kontrolek typu Table).
- **`WindowBorder.chars?: Partial<BorderChars>`** — per-glyph override
  aplikowany na bazowy zestaw wybranego `style`. Pozwala podmienić tylko
  wybrane znaki (np. narożniki) bez redefiniowania całej tabeli.
- Eksportowane z `take4-console` barrel-a: typ `BorderChars`.

### Changed — backlog P0-9
- **`Window.borderInset`** traktuje `style: 'none'` jako brak ramki —
  `getInnerOffset()` / `getInnerSize()` nie odejmują 1 cell-a po stronach.
- **`Window.paintBorder`** mergeuje `border.chars` na bazowy zestaw
  (`{ ...baseChars, ...border.chars }`) i przerywa się natychmiast dla
  `'none'`.
- **Internal `BORDER_CHARS`** używa pełnych nazw glifów z `BorderChars`
  (`horizontal`/`vertical`/`topLeft`/…) zamiast wcześniejszych skrótów
  (`h`/`v`/`tl`/…). Pole jest prywatne — bez wpływu na konsumentów.
- **Demo (`src/layout.yaml`)** — `monitorPanel` używa `style: thick`,
  `eventsPanel` używa `style: dashed`, `leftPanel` demonstruje override
  pojedynczych glifów (`chars: { topLeft: '◆', topRight: '◆' }`).

### Docs
- Dodano `doc/p0-7-text-width.md` — pełny opis API, algorytmu sentinela
  continuation cell, tabel Unicode i kompatybilności wstecznej.
- Dodano `doc/p0-9-border-styles.md` — opis nowych stylów, tabela
  glifów, semantyka `'none'` i przykłady override `chars`.

## [0.16.0] – 2026-04-16

### Added — backlog P0-1 (custom per-row rendering w ListBox)
- **`ListBox<T>` jest teraz generyczny** — element listy może być dowolnym typem
  (domyślnie `string`, co zachowuje wsteczną kompatybilność). `ListBoxProperties<T>`,
  `setItems(items: T[])`, `getSelectedItem(): T | undefined`, `onChange(idx, item: T)`.
- **`renderItem(item, ctx): string | ListBoxRowSegment[]`** — opcjonalny per-row
  renderer. Obsługuje segmenty z wyrównaniem `left` / `right` / `fill`; style
  segmentów są mergowane ze stylem bazowym wiersza (tło selekcji pozostaje widoczne).
- **`rowHeight`** — wysokość slotu w komórkach (domyślnie 1). `handleKey` PgUp/PgDn
  uwzględnia liczbę widocznych slotów, nie surowych wierszy.
- **`keyFn`** — stały klucz per-item, dostępny przez `getItemKey(item)`; przechowywany
  pod kątem późniejszej reconciliation w `setItems()`.
- **`setRenderItem(fn)`** — podmiana renderera po konstrukcji.
- Nowe typy w `src/Screen/types.mts`: `ListBoxRenderContext`, `ListBoxRowSegment`,
  `ListBoxRowSegments`. Eksportowane z `take4-console` barrel-a.

### Changed
- **Demo (`src/demo.mts` + `src/layout.yaml`)** — lista zdarzeń (`eventsList`) to teraz
  `ListBox<EventRow>` z customowym rendererem pokazującym kolorowe ikony (✓/⚠/✖),
  wyciemniony timestamp i licznik wyrównany do prawej krawędzi.

### Docs
- Dodano `doc/p0-1-listbox-custom-render.md` — pełny opis API, algorytmu
  renderowania segmentów i kompatybilności wstecznej.

## [0.15.1] – 2026-04-12

### Fixed
- Corrected `repository.url` in `package.json` (`take4-console` → `take4_console`).

## [0.15.0] – 2026-04-12

### Changed
- **Border defaults moved to `Window`** – each control now declares its default
  border shape via `defaultBorder` in `WindowProperties` instead of overriding
  `border: wp.border ?? { ... }` in the constructor. `Window` resolves the final
  border as `wp.border ?? wp.defaultBorder`.
- **Border color synced automatically** – `Window.render()` calls a private
  `syncBorderColor()` before painting the border. It updates the border color
  based on the current `disabled`/`focused` state using `BUILTIN_BORDER_DISABLED`,
  `BUILTIN_BORDER_FOCUSED`, and `BUILTIN_BORDER`. Controls no longer call
  `updateBorder({ ..., color })` at the start of every `render()`.
- **Text style auto-picked in `writeText()`** – when no `style` option is
  provided, `writeText()` automatically selects `disabledStyleId`, `focusedStyleId`,
  or `normalStyleId` based on the current control state. Controls only pass an
  explicit style for non-standard cases (e.g. `checkedStyleId`, `placeholderStyleId`).
- **`focusedStyleId` promoted to `Window`** – initialized from `BUILTIN_TEXT_FOCUSED`,
  shared by all interactive controls; per-control `focusedStyleId` fields removed.
- **`Window` background default changed** – background now defaults to 0
  (transparent) when not specified in `WindowProperties`; the BUILTIN_WINDOW_BG
  fallback is the responsibility of each control that needs it.

## [0.14.0] – 2026-04-12

### Changed
- **Common control properties moved to `Window`** – `focused`, `disabled`,
  `label`, `normalStyleId`, and `disabledStyleId` fields plus their
  getters/setters (`setFocused`/`isFocused`, `setDisabled`/`isDisabled`,
  `setLabel`/`getLabel`) now live in the `Window` base class as protected fields
  with public accessors. All 14 controls no longer duplicate these declarations.
- `setDisabled()` automatically calls `setActive(!disabled)` to keep the two
  flags in sync.
- Read-only controls (StatusLED, ProgressBar, ProgressBarV, LineChart, BarChart,
  Sparkline, Spinner) no longer override `isFocused()`/`setFocused()`/`isDisabled()`
  as no-ops — the inherited `Window` implementation is used instead.
- Renamed internal style fields for consistency: `TextBox`/`TextArea`
  `textStyleId` → `normalStyleId`; `Tabs` `normalTextStyleId` → `normalStyleId`,
  `disabledTextStyleId` → `disabledStyleId`.

## [0.13.0] – 2026-04-12

### Changed
- **Global StyleRegistry singleton** – eliminated the `registry?: StyleRegistry`
  parameter from every constructor (`Window`, all 14 controls). Instead, a single
  `StyleRegistry` is created by the `Screen` constructor and stored in a new
  module-level singleton (`src/Screen/RegistryHolder.mts`). All windows and
  controls automatically use that shared registry via `getRegistry()` without any
  explicit wiring. `InterfaceBuilder` no longer threads a registry argument through
  its internal `buildNode` helper.
- `Screen.getStyleRegistry()`, `Screen.registerStyle()`, and
  `Screen.setBuiltinStyle()` are preserved and now delegate to the singleton.
- New internal module `RegistryHolder.mts` exports `getRegistry()` /
  `setRegistry()` – avoids circular imports between `Screen` and `Window`.

## [0.12.0] – 2026-04-12

### Added
- **Library packaging** – the project now ships as a reusable npm package:
  - New `src/index.mts` barrel re-exports every public class, type, and
    built-in style constant (`Screen`, `Window`, `WindowManager`, all 15
    controls, `InterfaceBuilder`, `Pos`/`Size`/`Pct`/`pct`, all `*Options`
    interfaces, YAML schema types, `BUILTIN_*` constants)
  - `package.json` fields for publishing: `exports` map (ESM-only with
    type-aware conditional exports), `types`, `module`, `files`,
    `sideEffects: false`, `engines: node >= 18`, `keywords`, `repository`,
    `bugs`, `homepage`, `license`, `author`, and a `prepublishOnly` script
    that runs build + tests
  - `LICENSE` file (MIT)
- `npm run demo` script – alias for the tsx-based dev command

### Changed
- **Demo entry point** moved from `src/index.mts` to `src/demo.mts`. The
  library's `main`/`exports` now point at `dist/index.mjs` (the barrel),
  so `import { Screen } from 'take4-console'` no longer accidentally runs
  the demo — **breaking change for anyone importing the old internal
  index.mts path**
- `tsconfig.json` excludes `src/demo.mts` from the library build (the demo
  is tsx-only so `layout.yaml` keeps resolving from `src/` via
  `import.meta.url`)
- README rewritten with an **Installation**, **Quick start**, **Public
  API**, and **Running the bundled demo** section at the top; the
  existing architecture / custom-control / YAML reference content is kept
  below with a note that the example imports use relative paths because
  they target in-repo extension

---

## [0.11.0] – 2026-04-12

### Added
- **`ListBox`** – scrollable, focusable list of single-line items; supports ↑/↓, Home/End, PgUp/PgDn with automatic scrolling; emits `onChange(index, item)` when the selection moves
- **`Tabs`** – tabbed container that renders a header row and composites only the children tagged to the active tab; focusable with ←/→ to cycle tabs; new `addChildToTab(tabIndex, child)` API tags children without affecting standard `addChild()` semantics
- **`Sparkline`** – read-only one-row inline chart built from the eight-level block-character ramp (` ▁▂▃▄▅▆▇█`); supports width/data resampling via linear interpolation
- **`Spinner`** – read-only animated loader with five built-in frame styles (`braille`, `dots`, `line`, `circle`, `arrow`); advances via `step()` driven by an external clock; supports optional label to the right of the glyph
- New option interfaces: `ListBoxOptions`, `TabsOptions`, `SparklineOptions`, `SpinnerOptions`
- Extended `YamlWindowType` with `listbox`, `tabs`, `sparkline`, `spinner`
- New `YamlWindowDef.tab` field – when the parent is a `Tabs` control, children with a `tab:` field are routed through `addChildToTab()` automatically

### Changed
- **`LineChart.render()`** – rewrote the plotting pipeline: every plot column now receives an interpolated row via linear interpolation between data samples, and vertical transitions are drawn as self-contained steps (`╯│╭` / `╮│╰`) instead of disjoint per-data-point cells. Fixes the "jagged" / disconnected appearance when plot width exceeds the data-point count. The buggy `selectLineChar` enter/exit lookup table (which had `up`/`down` corner characters swapped) has been removed entirely.
- **Demo (`index.mts` + `layout.yaml`)** – added a `LIVE` braille spinner to the header, replaced the bottom-right charts panel with a three-tab `Tabs` control (Charts / Trends / Events) showing the original `LineChart`+`BarChart` on tab 0, three stacked `Sparkline` histories on tab 1, and a scrolling `ListBox` event log on tab 2. The timer now advances the spinner, shifts rolling sparkline buffers in sync with the progress bars, and prepends timestamped log entries to the event list.

---

## [0.10.0] – 2026-04-12

### Added
- **`StatusLED`** – read-only coloured status indicator (states: `ok`/`warn`/`error`/`off`; auto-sizes to label width)
- **`ProgressBar`** – horizontal progress bar using `█`/`░` block characters with optional centred percentage label
- **`ProgressBarV`** – vertical progress bar filling from the bottom upward
- **`LineChart`** – line chart using box-drawing characters (`─`, `│`, `╭`, `╮`, `╯`, `╰`) with Y-axis labels and X-axis
- **`BarChart`** – vertical bar chart with `█` columns and single-character labels in the bottom row
- All five controls are read-only (`isFocused()` always `false`) and YAML-compatible via `InterfaceBuilder` using types `statusled`, `progressbar`, `progressbarv`, `linechart`, `barchart`
- New option interfaces in `types.mts`: `StatusLEDOptions`, `ProgressBarOptions`, `ProgressBarVOptions`, `LineChartOptions`, `BarChartOptions`
- Extended `YamlWindowType` and `YamlWindowDef` to support the new controls

---

## [0.9.0] – 2026-04-12

### Added
- **Built-in named style system** – `Screen` pre-registers ten default styles under well-known names; controls look them up by name at render time and fall back to hardcoded defaults if the registry is fresh:
  - `BUILTIN_WINDOW_BG` (`builtin:window-bg`) – default background for windows and controls
  - `BUILTIN_BORDER` / `BUILTIN_BORDER_FOCUSED` / `BUILTIN_BORDER_DISABLED` – border foreground colours
  - `BUILTIN_TEXT` / `BUILTIN_TEXT_FOCUSED` / `BUILTIN_TEXT_DISABLED` / `BUILTIN_TEXT_PLACEHOLDER` / `BUILTIN_TEXT_CHECKED` – text colour variants
  - `BUILTIN_CURSOR` (`builtin:cursor`) – cursor inverse-highlight style
- **`StyleRegistry.registerNamed(name, attrs)`** – registers a style under a string name and returns its stable ID
- **`StyleRegistry.getNamed(name)`** – returns the StyleId associated with a name, or `undefined`
- **`StyleRegistry.getNamedForeground(name, fallback)`** – convenience helper that resolves the foreground `Color` of a named style (used by controls for border colours)
- **`Screen.setBuiltinStyle(name, attrs)`** – overrides any named style (built-in or custom) and returns the new ID; controls pick up the change on their next `render()` call
- **YAML `styles:` section** – `InterfaceBuilder` now parses an optional `styles:` list at the top of the layout document and registers each entry in `StyleRegistry` before building windows:
  ```yaml
  styles:
    - name: my-panel-bg
      background: 235
    - name: builtin:border-focused   # override built-in
      foreground: 214                # amber focused border
  windows:
    - background: my-panel-bg
  ```

### Changed
- **`WindowOptions.background`** changed from `Color | false` to `StyleId | undefined` — pass a registered StyleId or omit for transparent (0 = no background); **breaking change**
- **`YamlWindowDef.background`** changed from `Color | false` to `string | number | undefined` — string values are resolved as named style names, numbers are used directly as StyleIds; **breaking change**
- **`YamlLayout`** now includes an optional `styles?: YamlStyleDef[]` field
- All controls (`Button`, `TextBox`, `TextArea`, `Checkbox`, `Radio`) now resolve their default colours from the built-in named styles instead of hardcoded ANSI numbers; hardcoded values remain as fallbacks when no Screen registry is present

### Tests
- `Window.test.mts` — background-option tests updated: register a StyleId via `StyleRegistry` instead of passing a raw color number; added `StyleId 0 background leaves region blank` case

---

## [0.8.0] – 2026-04-11

### Added
- **`InterfaceBuilder`** (`src/Screen/InterfaceBuilder.mts`) – builds a window hierarchy from a YAML description:
  - `build(yamlText, screen, wm?)` – parses YAML, adds all top-level windows to Screen, returns `Map<string, Window>` keyed by YAML `id`
  - `buildFromFile(path, screen, wm?)` – async variant that reads a file first
  - `registerCallback(id, fn)` – registers a named function for use with `onPress` / `onChange` in YAML
  - Supports all widget types: `window`, `button`, `textbox`, `textarea`, `checkbox`, `radio`
  - Position spec: `{x, y}` (absolute / negative edge-relative / `"N%"` percentage), named presets (`center`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`), edge presets (`{preset: top|left|right|bottom, offset?}`)
  - Size spec: `{width, height}`, `"fill"`, `{fillWidth: N}`, `{fillHeight: N}`; `checkbox` and `radio` are auto-sized (no `size` needed)
  - Passes shared `StyleRegistry` from Screen to all created windows
  - When `wm` is provided, all focusable controls are automatically registered with `WindowManager` after the full tree is built (position resolution happens before registration)
- YAML schema types added to `types.mts`: `YamlAxisValue`, `YamlPosSpec`, `YamlSizeSpec`, `YamlWindowType`, `YamlWindowDef`, `YamlLayout`
- `yaml` package added as a runtime dependency

---

## [0.7.0] – 2026-04-11

### Added
- **`WindowManager`** (`src/Screen/WindowManager.mts`) – application input manager:
  - Captures raw stdin in TTY raw mode; parses escape sequences and SGR mouse events
  - `register(control, ...parents)` – registers a focusable control for Tab-cycling; parent chain is used to compute absolute screen position for mouse hit-testing
  - `unregister(control)` – removes a control from the focus list
  - `getFocused()` / `setFocus(control)` – read/set current focus
  - `openDialog(dialog, controls)` – pushes a modal dialog level; the dialog Window is added to Screen and its controls capture all focus until `closeDialog()` is called
  - `closeDialog()` – pops the topmost dialog, removes it from Screen, and restores previous focus context
  - `run()` – starts the event loop (raw mode, optional mouse tracking, hides cursor, initial render)
  - `stop()` – restores terminal state and fires `onExit` callback
  - Mouse support (SGR protocol): left-click focuses the clicked registered control (`mouse: true` option)
  - `handleInput(Buffer)` – public method so tests can drive input without a real TTY
- **`Focusable`** interface (`types.mts`) – `{ isFocused, setFocused, isDisabled, handleKey? }` satisfied by all interactive controls
- **`TerminalMouseEvent`** interface (`types.mts`) – typed mouse event from the terminal
- **`WindowManagerOptions`** interface (`types.mts`) – `exitKeys`, `onExit`, `onKey`, `onMouse`, `mouse`
- **`Button.handleKey(key)`** – Enter or Space activates `onPress` callback
- **`Checkbox.handleKey(key)`** – Space toggles `checked` and fires `onChange`
- **`Radio.handleKey(key)`** – Space selects the button and fires `onChange`
- `onPress?: () => void` added to `ButtonOptions`
- `onChange?: (checked: boolean) => void` added to `CheckboxOptions` and `RadioOptions`
- **`Window.removeChild(child)`** – removes a previously added child (used internally by `closeDialog`)
- Demo (`src/index.mts`) updated to use `WindowManager` with mouse support; press `q` or Ctrl+C to exit

---

## [0.6.0] – 2026-04-11

### Added
- **`Window.getInnerOffset()`** / **`Window.getInnerSize()`** – public methods returning the content area offset and dimensions after accounting for decorations (borders); used by `writeText`, `addChild`, `blitChild`
- **`Window.updateBorder()`** – protected method allowing subclasses to change the border config before each `render()` call (e.g. focus-state colour)
- **`Button`** (`src/Screen/controls/Button.mts`) – clickable button with rounded border, centred label, normal/focused/disabled states
- **`Checkbox`** (`src/Screen/controls/Checkbox.mts`) – `[✓]/[ ]` toggle; auto-sized to label width; checked/focused/disabled states
- **`Radio`** (`src/Screen/controls/Radio.mts`) – `(●)/( )` single-selection; auto-sized to label width; checked/focused/disabled states
- **`TextBox`** (`src/Screen/controls/TextBox.mts`) – single-line text input with scrolling, cursor, placeholder, `handleKey()` for terminal input
- **`TextArea`** (`src/Screen/controls/TextArea.mts`) – multi-line text input with 2-D cursor, scroll, placeholder, `handleKey()` for terminal input
- Control option types added to `types.mts`: `ControlOptions`, `ButtonOptions`, `TextBoxOptions`, `TextAreaOptions`, `CheckboxOptions`, `RadioOptions`

### Changed
- `Window.addChild()` now resolves child sizes and positions relative to the **inner content area** (excludes border cells) — **breaking change** for parents with borders
- `Window.writeText()` coordinates are now relative to the inner content area; text clips at inner boundaries, not full window edges — **breaking change** for windows with borders
- `Window.blitChild()` uses inner area dimensions for `Pos.resolve()` and offsets results by inner offset

---

## [0.5.0] – 2026-04-11

### Added
- **`Pos`** class (`src/Screen/Pos.mts`) – encodes window position with support for:
  - Absolute coordinates: `new Pos(5, 3)`
  - From-right/bottom edge (negative): `new Pos(-5, -3)` — own edge at distance from parent edge
  - Percentage of parent: `new Pos(pct(50), pct(25))`
  - Named edge presets: `Pos.topLeft()`, `Pos.topRight()`, `Pos.bottomLeft()`, `Pos.bottomRight()`, `Pos.center()`, `Pos.left(y?)`, `Pos.right(y?)`, `Pos.top(x?)`, `Pos.bottom(x?)`
- **`Size`** class (`src/Screen/Size.mts`) – encodes window dimensions with support for:
  - Absolute pixels: `new Size(30, 10)`
  - Percentage of parent: `new Size(pct(50), pct(100))`
  - Fill shortcuts: `Size.fill()`, `Size.fillWidth(h)`, `Size.fillHeight(w)`
- **`Pct`** class and **`pct(n)`** helper – wrap percentage values for use in `Pos` and `Size`
- `AxisSpec` and `DimSpec` type aliases added to `types.mts`

### Changed
- **`Window` constructor** signature changed from `(x, y, width, height, options?, registry?)` to `(pos: Pos, size: Size, options?, registry?)` — **breaking change**
- `Window.addChild()` now resolves percentage-based child sizes immediately against parent dimensions
- `Window` internal `blitChild()` re-resolves position via `Pos.resolve()` on every `render()` call

### Notes
- For windows with percentage-based sizes, call `parent.addChild(child)` before writing content.

---

## [0.4.0] - 2026-04-11

### Added
- `StyleRegistry` class (`src/Screen/StyleRegistry.mts`) – central style store with integer IDs and deduplication; `register()`, `get()`, `merge()`
- `StyleId = number` type alias (`src/Screen/types.mts`)
- `Screen.registerStyle(attrs): StyleId` – public API for registering styles
- `Screen.getStyleRegistry(): StyleRegistry` – returns the screen's registry for sharing with child Windows
- `Window.mergeStyle(x, y, styleId)` – replaces `setAttributes`; merges a style ID onto an existing cell

### Changed
- `Region` now stores `number[]` (style IDs) instead of `CellAttributes[]`; replaced `getAttrs()` with `getStyleIds()`, `setAttributes()` with `setStyleId()`, `getCell()` removed in favour of `getChar()` + `getStyleId()`
- `Window.setCell(x, y, char, styleId?)`, `fill(char, styleId?)`, `writeText(text, options?)` all accept `StyleId` instead of `CellAttributes`
- `WriteTextOptions` no longer extends `CellAttributes`; uses `style?: StyleId` field instead
- `Window` constructor gains optional `registry?: StyleRegistry` parameter for sharing ID spaces
- `tsconfig.json` – added `"types": ["node"]` to resolve `process` global

### Removed
- `Window.setAttributes()` (replaced by `mergeStyle()`)
- `Region.getAttrs()`, `Region.getCell()`, `Region.setAttributes()`

---

## [0.3.0] - 2026-04-11

### Added
- `Window.writeText(text, options?)` – built-in text utility; position defaults to (0,0), supports `\n`, silently clips out-of-bounds characters (`src/Screen/Window.mts`)
- `WriteTextOptions` interface extending `CellAttributes` with optional `x`/`y` (`src/Screen/types.mts`)

### Changed
- `src/index.mts` – removed local `writeText` helper; all calls use `win.writeText()`

---

## [0.2.0] - 2026-04-11

### Added
- `Screen` class with terminal cell grid (`src/Screen/Screen.mts`)
- Type declarations: `Color`, `CellAttributes`, `Cell`, `TerminalSize` (`src/Screen/types.mts`)
- Methods: `getSize`, `getCell`, `setChar`, `setCell`, `setAttributes`, `clear`, `fill`
- Unit tests for all `Screen` methods (`src/Screen/Screen.test.mts`)

## [0.1.0] - 2026-04-11

### Added
- Initial project setup (Node.js + TypeScript, ESM, Vitest)
