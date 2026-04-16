# P0-4 — `onKey` preventDefault + kolejność

Backlog item: **P0-4** (Sprint 1, P0). Wersja: **0.20.0** (2026-04-16).

## Dlaczego

Do tej pory `WindowManagerOptions.onKey` odpalał się przed dispatchem, ale
nie mógł go anulować — każdy klawisz trafiał również do focused control,
co uniemożliwiało globalne shortcut-y pokroju `q`, `?`, `:` (pisane np. do
focused TextBoxa). rpcoon potrzebuje takich skrótów do command palette,
help overlay i exit confirmation — bez preventDefault musielibyśmy
ręcznie filtrować klawisze w każdej focused kontrolce.

## Zmiany w API

### `WindowManagerOptions.onKey` — nowa sygnatura

```ts
interface WindowManagerOptions {
  onKey?: (key: string, ctx: KeyContext) => boolean | void;
  // ^ return true = event consumed
}
```

- `boolean | void` jest backward-compatible z dotychczasowym `void`.
- Zwrócenie `true` pomija: exit-key check, nawigację Tab/Shift-Tab i
  dispatch do focused control.
- Zwrócenie `false` / `undefined` zachowuje dotychczasowe pass-through.
- `KeyContext` to snapshot wzięty **przed** wywołaniem handlerów — handlery
  widzą spójny widok focused-a nawet jeśli jedno z nich przeniesie focus.

### `KeyContext`

```ts
interface KeyContext {
  focusedControl: (Focusable & Window) | null;
  inDialog:       boolean;
  dialogDepth:    number;  // 0 = main, 1 = first dialog, …
}
```

### `wm.bindKey(keySpec, handler)` — register-based alternative

```ts
type KeyBindHandler = (ctx: KeyContext) => boolean | void;

class WindowManager {
  bindKey(keySpec: string, handler: KeyBindHandler): () => void;
  unbindKey(keySpec: string, handler?: KeyBindHandler): boolean;
}
```

`keySpec` akceptuje:
- raw terminal strings: `'\r'`, `'q'`, `'\x1b[A'`, …
- nazwy: `'enter'`, `'return'`, `'space'`, `'tab'`, `'esc'`,
  `'escape'`, `'backspace'`, `'del'`, `'delete'`, `'up'`, `'down'`,
  `'left'`, `'right'`, `'home'`, `'end'`, `'pageup'`, `'pagedown'`.
- `'ctrl+<letter>'` → ASCII control codes (`\x01`–`\x1a`).

`bindKey` zwraca unbind-funkcję — wywołanie jej usuwa dokładnie ten
handler, nawet jeśli pod ten sam `keySpec` zostało zarejestrowanych wiele.
`unbindKey(spec)` bez drugiego argumentu usuwa wszystkie handlery dla
danego klawisza.

## Kolejność dispatchu

Dla każdego klawisza w strumieniu stdin:

1. **Mouse event** (jeśli `mouse: true` i klawisz to SGR) — ścieżka
   bez zmian.
2. Budowany jest `KeyContext` (snapshot focus / dialog stack).
3. **`bindKey` handlers** w kolejności rejestracji. Pierwszy, który
   zwraca `true` → *consumed*, koniec ścieżki.
4. **`onKey`** — jeśli zwraca `true` → *consumed*, koniec ścieżki.
5. **Exit keys** (`exitKeys`, default `['\x03']`) — dopiero teraz, po
   handlerach globalnych. Dzięki temu global shortcut może zablokować
   exit (np. confirmation dialog dla `q`).
6. **Tab / Shift-Tab** — `moveFocus(+1/-1)`.
7. **Dispatch** do focused control poprzez `handleKey`.

`renderFrame()` odpala się po każdym kroku, który mógł zmienić stan
(consumed przez global handler, nawigacja focus, dispatch do control).

## Przykłady

### Zablokowanie `q` gdy TextBox ma focus

Shell-style exit — `q` kończy program, ale nie wtedy, gdy użytkownik
wpisuje tekst:

```ts
const wm = new WindowManager(screen, {
  exitKeys: ['q', '\x03'],
  onKey: (key, ctx) => {
    if (key === 'q' && ctx.focusedControl instanceof TextBox) {
      return true; // swallow q — user is typing
    }
  },
});
```

### Globalny command palette

```ts
wm.bindKey(':', (ctx) => {
  if (ctx.inDialog) return; // don't shadow dialog's own ':'
  openCommandPalette();
  return true;
});
```

### Help overlay toggle (jak w demo)

```ts
let helpMode = false;
wm.bindKey('?', () => {
  helpMode = !helpMode;
  redrawStatusBar();
  return true;
});
```

### Łańcuch handlerów

Można zarejestrować wiele handlerów pod jeden klawisz — fire w kolejności
rejestracji aż pierwszy zwróci `true`:

```ts
wm.bindKey('escape', () => logEscapes()); // non-consuming tracer
wm.bindKey('escape', (ctx) => {
  if (ctx.inDialog) { wm.closeDialog(); return true; }
});
wm.bindKey('escape', () => { quit(); return true; });
```

## Backwards compatibility

- Stare `onKey?: (key: string) => void` działa dalej — TypeScript
  akceptuje węższą sygnaturę jako podzbiór nowej, zwrot `void` jest
  traktowany jak `false`.
- Kod, który nie używa `bindKey` ani nie zwraca `true` z `onKey`,
  dostaje identyczny behaviour co w 0.19.0.

## Algorytm normalizacji `keySpec`

`normaliseKeySpec(spec)`:
1. `length <= 1` → zwróć as-is (raw char).
2. Lowercase lookup w `KEY_ALIASES` (mapa nazwa → raw).
3. Match `^ctrl\+([a-z])$` → `String.fromCharCode(letter - 'a' + 1)`.
4. Fallback: zwróć `spec` bez zmian (raw escape sequences, custom CSI).

## Pliki zmienione

- `src/Screen/types.mts` — `KeyContext`, `KeyBindHandler`, nowa
  sygnatura `WindowManagerOptions.onKey`, import `Window`.
- `src/Screen/WindowManager.mts` — `keyBindings` map, `bindKey`,
  `unbindKey`, `dispatchGlobalKey`, update kolejności w `handleInput`,
  pomocnicze `KEY_ALIASES` + `normaliseKeySpec`.
- `tests/WindowManager.test.mts` — 11 nowych testów
  (onKey consume, exit-key block, KeyContext, bindKey, friendly
   names, ordering, unbind, dialog context).
- `src/demo.mts` — `bindKey('?', …)` toggluje help mode w status
  barze; `bindKey('ctrl+r', tick)` force-refresh.
- `package.json` — 0.19.0 → 0.20.0.
- `CHANGELOG.md` — wpis 0.20.0 / backlog P0-4.
- `CLAUDE.md` — tabela backlogu: P0-4 ✅.
