# VirtualCursor — software caret z kontrolą migania i symbolu

Dodano w wersji **0.27.0** (2026-04-18). Poza backlogiem — feature
dołożony ad-hoc na życzenie.

## Motywacja

Dotychczasowy kursor w `TextBox` / `TextArea` był renderowany jako
„inverse-block" nad znakiem pod karetą — bez migania i bez możliwości
zmiany symbolu. `VirtualCursor` oddziela model kursora (glif + schedule
migania) od samego renderu kontrolki, więc:

- kursor może używać dowolnego glifu (np. `|`, `▎`, `▏`, `█`, ikon
  NerdFonts),
- miganie ma kilka gotowych trybów (`slow`, `fast`, `irregular`) lub
  jawne `{ onMs, offMs }`,
- można je całkowicie wyłączyć (`{ mode: 'off' }`) albo trzymać w stanie
  „zawsze widoczne" (`steady`, default).

## API

### Klasa `VirtualCursor`

```typescript
import { VirtualCursor, DEFAULT_CURSOR_SYMBOL } from 'take4-console';
import type { CursorBlink, VirtualCursorOptions } from 'take4-console';

const cursor = new VirtualCursor({ symbol: '|', blink: { mode: 'fast' } });

cursor.isVisible();        // true | false — sample wall-clock state
cursor.getSymbol();        // '|' (lub DEFAULT_CURSOR_SYMBOL gdy nie ustawiony)
cursor.hasCustomSymbol();  // true gdy podano symbol; false → inverse-block
cursor.setSymbol('▎');
cursor.setSymbol(undefined); // powrót do inverse-block

cursor.getBlink();
cursor.setBlink({ mode: 'custom', onMs: 400, offMs: 200 });

cursor.resetPhase();        // „zacznij fazę ON teraz" — używane przy pisaniu
cursor.getTickHintMs();     // najkrótsza faza w ms (lub null gdy static)
```

Tryby migania (`CursorBlink`):

| mode         | Opis                                                    |
| ------------ | ------------------------------------------------------- |
| `off`        | kursor nigdy nie jest rysowany                          |
| `steady`     | kursor zawsze widoczny (default)                        |
| `slow`       | 600 ms on / 600 ms off                                  |
| `fast`       | 250 ms on / 250 ms off                                  |
| `irregular`  | 180–520 ms on, 90–240 ms off (losowo dla każdej fazy)   |
| `custom`     | `{ mode: 'custom', onMs, offMs }`                       |

`isVisible()` pierwszy raz woła się w konstrukcji leniwie — phase
zaczyna się w momencie pierwszego sampla, nie przy `new VirtualCursor()`.
Dzięki temu zachowanie jest deterministyczne także w testach (`now`
jest parametrem).

### Integracja z `TextBox` / `TextArea`

Nowe pola w `TextBoxProperties` i `TextAreaProperties`:

```typescript
new TextBox(
  { pos, size, focused: true },
  {
    value: 'hello',
    cursorSymbol: '▎',
    cursorBlink: { mode: 'slow' },
  },
);
```

Runtime dostęp:

```typescript
const vc = textBox.getVirtualCursor();
vc.setBlink({ mode: 'irregular' });
vc.setSymbol('█');
```

**Backwards compat**: gdy `cursorSymbol` nie jest podany,
`hasCustomSymbol()` zwraca `false`, a kontrolka maluje legacy
inverse-block — tak jak przed 0.27.0.

### `WindowManager.enableCursorBlink()`

Kursor sam z siebie nie przerysuje terminala — `WindowManager` musi
okresowo zawołać `screen.render()`, żeby fazy on/off naprawdę trafiły
na ekran:

```typescript
wm.run();
wm.enableCursorBlink(80);   // 80 ms ≈ 12 Hz; domyślna wartość
// …
wm.disableCursorBlink();
```

- `intervalMs` jest klemowany do minimum 16 ms.
- Timer jest `unref()`owany, nie blokuje zamknięcia event-loopa.
- `pause()` sprząta timer; `resume()` go przywraca.
- `stop()` zdejmuje timer i (przy ponownym `run()`) trzeba wywołać
  `enableCursorBlink` ponownie.

### YAML

Builder rozpoznaje `cursorSymbol:` i `cursorBlink:` na kontrolkach
`textbox` / `textarea`:

```yaml
- id: tbEmail
  type: textbox
  pos: { x: 0, y: 5 }
  size: { fillWidth: 3 }
  value: "jan@example.com"
  cursorSymbol: "▎"
  cursorBlink: { mode: "slow" }
```

## Algorytm

`VirtualCursor` trzyma jedną wewnętrzną fazę `{ startedAt, visible, duration }`.
Każde wywołanie `isVisible(now)` iteruje — dopóki `now - startedAt >= duration`,
tworzy nową fazę o odwrotnej flagi `visible` i świeżej długości (dla
`irregular` losowanej z zakresów). To pozwala mieszać tryby i wywoływać
`isVisible` rzadko bez utraty deterministyczności.

`resetPhase(now)` jest wołany w `TextBox.handleKey()` i
`TextArea.handleKey()`, żeby kursor nie zniknął w trakcie aktywnego
pisania — niespokojne miganie w trakcie wpisywania jest wizualnym
szumem.

## Zmienione pliki

- `src/Screen/VirtualCursor.mts` (nowy)
- `src/Screen/types.mts` — `CursorBlink`, `VirtualCursorOptions`,
  pola `cursorSymbol`, `cursorBlink` w `TextBoxProperties`,
  `TextAreaProperties`, `YamlWindowDef`
- `src/Screen/controls/TextBox.mts`, `TextArea.mts` — integracja
- `src/Screen/WindowManager.mts` — `enableCursorBlink` / `disableCursorBlink`
- `src/Screen/InterfaceBuilder.mts` — propagacja YAML
- `src/index.mts` — eksport klasy, stałej i typów
- `src/layout.yaml`, `src/demo.mts` — demo dwóch trybów migania
- `tests/VirtualCursor.test.mts` (nowy)
- `tests/controls/TextBox.test.mts` — nowe scenariusze
- `tests/WindowManager.test.mts` — test timera
- `CHANGELOG.md`, `package.json` (0.27.0)

## Ograniczenia

- Miganie wymaga jawnego `enableCursorBlink()`. Bez niego `blink: 'slow'`
  nie będzie widoczne, bo `screen.render()` nie jest wołany
  spontanicznie.
- `getTickHintMs()` jest jedynie wskazówką — `enableCursorBlink` nie
  pyta kontrolek o ich trwający tryb; consumer powinien sam dobrać
  wartość (default 80 ms pokrywa wszystkie presety).
- Nie integruje się z hardware cursor terminala (Screen nadal trzyma
  go ukrytego via `hideCursor`).
