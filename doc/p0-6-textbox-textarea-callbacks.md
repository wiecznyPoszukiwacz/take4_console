# P0-6 — `onChange` / `onSubmit` / `onKeyDown` w TextBox + TextArea

Backlog item: **P0-6** (Sprint 1, P0). Wersja: **0.21.0** (2026-04-16).

## Dlaczego

`TextBoxProperties` / `TextAreaProperties` do tej pory miały tylko stan
(`value`, `placeholder`, `cursor`). Brak callbacków znaczył, że
live-filter w method picker / command completion rpcoon musiałby
re-pytać controls po każdej klatce — rozwiązanie niechlujne i
niekompatybilne z ideą reactive UI.

## Dodane właściwości

### Wspólne (TextBox + TextArea)

```ts
interface TextBoxProperties {
  onChange?:  (value: string)           => void;
  onSubmit?:  (value: string)           => void;
  onKeyDown?: (key: string)             => boolean | void;
}

interface TextAreaProperties {
  onChange?:  (value: string)           => void;
  onSubmit?:  (value: string)           => void;
  onKeyDown?: (key: string)             => boolean | void;
  insertTabAsSpaces?:   number;   // default 0 (Tab = focus-cycle)
  ctrlDDeletesForward?: boolean;  // default false
}
```

### `onChange(value)`

- Odpalane **po** każdej zmianie `value` wywołanej z `handleKey`:
  wpisanie znaku, Backspace, Delete, Ctrl+D (jeśli włączony), wstawienie
  newline w TextArea, wstawienie spacji z `insertTabAsSpaces`.
- Porównanie starego i nowego value odbywa się **stringowo**
  (`getValue()` w TextArea), więc cursor-only moves i inne no-op keys
  nie wywołują callbacka.
- `setValue(...)` (imperatywne) celowo **nie** odpala `onChange`.

### `onSubmit(value)`

- TextBox: Enter (`\r` / `\n` / `'enter'`) nie wstawia znaku do
  value — wywołuje `onSubmit(value)`.
- TextArea: plain Enter **nadal** wstawia newline (podstawowa semantyka
  multi-line); submit jest pod aliasem `'ctrl+enter'`. Aplikacja, która
  chce przechwycić Ctrl+Enter, powinna parsować surowy klawisz terminala
  (w xterm-ach zazwyczaj `\n` bez `\r`) i przekierować przez
  `onKeyDown` lub `wm.bindKey('ctrl+enter', …)`.

### `onKeyDown(key)` — pre-dispatch hook

- Odpalany **przed** dowolną built-in logiką `handleKey`.
- Return `true` → konsumuje klawisz: built-in branch (insert, cursor
  move, delete, …) jest pominięty, `onChange` / `onSubmit` też nie
  odpalą (bo value się nie zmienia).
- Return `false` / `void` → normalna dalsza ścieżka.
- Symetryczne z `WindowManagerOptions.onKey` (P0-4) — te same
  semantics `boolean | void`.

### `insertTabAsSpaces` (tylko TextArea)

- `0` (default): Tab nie dociera do TextArea — `WindowManager`
  traktuje go jako focus-cycle.
- `N > 0`: `Focusable.capturesTab()` zwraca `true`, `WindowManager`
  pomija focus-cycle i `handleKey('\t')` wstawia `N` spacji.
- Shift-Tab **zawsze** cykluje focus — daje to kontrolowany escape
  z TextArea.

### `ctrlDDeletesForward` (tylko TextArea)

- `true`: `\x04` (Ctrl+D) kasuje znak po kursorze (tak samo jak
  Delete / `\x1b[3~`), włącznie z join-em linii na końcu linii.
- `false` (default): Ctrl+D przelatuje bez efektu.
- Wybór opt-in, bo Ctrl+D często jest przypisywany globalnie
  (np. exit / fuzzy-finder).

## Integracja z `WindowManager`

### `Focusable.capturesTab?()`

```ts
interface Focusable {
  …
  capturesTab?(): boolean;
}
```

`WindowManager.handleInput`:

```
if (key === '\t') {
  if (!focused?.capturesTab?.())  moveFocus(+1);
  else                            dispatch to focused.handleKey
}
```

Shift-Tab (`\x1b[Z`) pozostaje bezwarunkowym focus-cycle.

## Imperatywne settery

Dla przypadków, gdy callbacki trzeba dorzucić / zmienić po
skonstruowaniu kontrolki (np. w kodzie YAML-drivena), oba typy eksportują:

```ts
setOnChange(fn?: (value: string) => void): void;
setOnSubmit(fn?: (value: string) => void): void;
setOnKeyDown(fn?: (key: string) => boolean | void): void;
```

## InterfaceBuilder / YAML

`YamlWindowDef` zyskuje pola:

```yaml
- id: tbUsername
  type: textbox
  size: { fillWidth: 3 }
  onChange:  usernameChanged      # callback ID
  onSubmit:  usernameSubmitted
  onKeyDown: usernameKey
- id: editor
  type: textarea
  insertTabAsSpaces: 4
  ctrlDDeletesForward: true
```

Callbacki są rejestrowane przez `InterfaceBuilder.registerCallback(id,
fn)`; sygnatura fn to nadal `(...args: unknown[]) => void` — consumer
castuje args na pierwsza-pozycja-to-string.

## Demo

- `layout.yaml` — `tbUsername` dostał `onSubmit: usernameSubmitted`.
- `src/demo.mts` — `ib.registerCallback('usernameSubmitted', (args) => …)`
  wstawia event do log-u po Enter w username-ie.

## Pliki zmienione

- `src/Screen/types.mts` — rozszerzone `TextBoxProperties` /
  `TextAreaProperties`, `Focusable.capturesTab?`, `YamlWindowDef` (onSubmit,
  onKeyDown, insertTabAsSpaces, ctrlDDeletesForward).
- `src/Screen/controls/TextBox.mts` — callbacki + seter-y.
- `src/Screen/controls/TextArea.mts` — callbacki, seter-y,
  `capturesTab`, Tab-as-spaces, Ctrl+D delete-forward, ctrl+enter
  submit.
- `src/Screen/WindowManager.mts` — `handleInput` sprawdza
  `capturesTab()` przed `moveFocus(+1)`.
- `src/Screen/InterfaceBuilder.mts` — mapuje YAML `onChange` /
  `onSubmit` / `onKeyDown` / `insertTabAsSpaces` /
  `ctrlDDeletesForward` na TextBox/TextArea.
- `tests/controls/TextBox.test.mts` — 11 nowych testów.
- `tests/controls/TextArea.test.mts` — 14 nowych testów.
- `tests/WindowManager.test.mts` — 2 testy integracyjne dla
  `capturesTab`.
- `src/demo.mts` + `src/layout.yaml` — wire-up
  `usernameSubmitted`.
- `package.json` — 0.20.0 → 0.21.0.
- `CHANGELOG.md`, `CLAUDE.md` — wpis 0.21.0, tabela backlogu.

## Backwards compatibility

- Stare `{ value, placeholder, cursor }` → bez zmian.
- Brak breaking changes — nowe pola są opcjonalne, defaulty
  odtwarzają dotychczasowe zachowanie (`insertTabAsSpaces: 0`
  oznacza: "Tab nie dociera do TextArea", identycznie jak
  w 0.20.0 gdzie pole nie istniało).
- `Focusable.capturesTab?` jest opcjonalne — istniejące implementacje
  `Focusable` (Button, Checkbox, Radio, ListBox, Tabs, TextBox)
  działają bez dodatkowej zmiany.
