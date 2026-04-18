# P1-20: Selection w TextBox / TextArea

Ticket z backlogu: **P1-20**. Wersja: **0.28.0**.

## Cel

Dodać model zaznaczenia do kontrolek wejścia tekstowego, żeby użytkownik
mógł wyróżnić fragment wartości i operować na nim (zamiana przez
wpisanie, usunięcie przez `Backspace` / `Delete`, zaznaczenie wszystkiego
przez `Ctrl+A`, rozszerzanie selekcji przez `Shift` + strzałki).

## Model

Selekcja jest jednym `anchor`em trzymanym obok pozycji kursora:

- `TextBox` — `selectionAnchor: number | null` (indeks znaku w stringu).
- `TextArea` — `selectionAnchor: { x: number; y: number } | null`
  (pozycja 2-D, tak jak kursor).

`null` znaczy "selekcja nieaktywna". Kiedy `anchor === cursor`, również
zwracamy `null` — selekcja jest zawsze niepusta, żeby kod wyżej nie
musiał osobno sprawdzać tej sytuacji. Zakres zwracany przez
`getSelection()` jest znormalizowany (`start` ≤ `end` w porządku
dokumentu), żeby konsumenci nie martwili się kierunkiem rysowania.

## API (identyczne wzorce w obu kontrolkach)

```typescript
// TextBox
getSelection(): { start: number; end: number } | null;
getSelectedText(): string;
setSelection(anchor: number, cursor: number): void;
selectAll(): void;
clearSelection(): void;

// TextArea
getSelection(): { start: {x:number;y:number}; end: {x:number;y:number} } | null;
getSelectedText(): string;               // zawiera '\n' dla selekcji wieloliniowej
setSelection(anchor: {x,y}, cursor: {x,y}): void;
selectAll(): void;
clearSelection(): void;
```

`setValue()` oraz `setCursor()` czyszczą kotwicę — stara pozycja
wskazywałaby na nieaktualny bufor. `setSelection()` jest publicznym
wejściem, gdy konsument chce jednocześnie przesunąć kursor i zachować
anchor.

## Klawiatura

| Klawisz                  | `TextBox`                          | `TextArea`                         |
| ------------------------ | ---------------------------------- | ---------------------------------- |
| `shift+left`  / `\x1b[1;2D` | anchor + kursor w lewo           | anchor + kursor w lewo (wrap linii) |
| `shift+right` / `\x1b[1;2C` | anchor + kursor w prawo          | anchor + kursor w prawo (wrap)     |
| `shift+up`    / `\x1b[1;2A` | —                                | anchor + kursor wiersz wyżej       |
| `shift+down`  / `\x1b[1;2B` | —                                | anchor + kursor wiersz niżej       |
| `shift+home`  / `\x1b[1;2H` | anchor + kursor do 0            | anchor + kursor do 0 w wierszu     |
| `shift+end`   / `\x1b[1;2F` | anchor + kursor do końca         | anchor + kursor do końca wiersza   |
| `ctrl+a` / `\x01`        | selectAll                          | selectAll                           |
| `left`                   | kolaps do startu selekcji          | kolaps do startu selekcji           |
| `right`                  | kolaps do końca selekcji           | kolaps do końca selekcji            |
| `home` / `end` / `up` / `down` | czyszczą kotwicę, potem ruch | czyszczą kotwicę, potem ruch        |
| znak drukowalny          | zamiana selekcji na wpisany znak   | zamiana selekcji na wpisany znak    |
| `backspace`              | usuwa selekcję (lub znak wstecz)   | usuwa selekcję (lub znak / join)    |
| `delete` / `ctrl+d`*     | usuwa selekcję (lub znak do przodu)| usuwa selekcję (lub znak / join)    |
| `enter`                  | `onSubmit`, nie mutuje wartości    | usuwa selekcję, potem split wiersza |
| `tab` (soft-tab)         | —                                  | usuwa selekcję, wstawia spacje      |

*`ctrl+d` tylko gdy `ctrlDDeletesForward: true` w `TextAreaProperties`.

## Renderowanie

W trakcie `render()` po zwykłym rysowaniu tekstu iterujemy po komórkach
w zasięgu selekcji i przepisujemy je używając stylu zmergowanego:

```typescript
const merged = this.registry.merge(this.normalStyleId, this.selectionStyleId);
```

Podświetlenie jest zawsze nad tekstem, ale pod kursorem — `VirtualCursor`
wygrywa w tym samym miejscu, żeby caret zawsze był widoczny.

`BUILTIN_TEXT_SELECTION` pre-rejestrowany w `StyleRegistry` daje
kontrastowe tło (ANSI 24) + biały tekst (231). Można nadpisać globalnie:

```typescript
screen.overrideStyle('builtin:text-selection', { background: 238, bold: true });
```

## Kompatybilność wsteczna

- Domyślnie kotwica = `null`, więc zachowanie przed-0.28 jest zachowane
  bit-in-bit: samo pisanie, arrow-keys bez shift, backspace, delete, etc.
  działają tak jak dotąd.
- `setValue()` zawsze zeruje kotwicę — poprzednie wywołania `setValue()`
  nie mogły mieć aktywnej selekcji, więc jest to no-op dla istniejących
  callerów.
- Nie ma nowych pól w `TextBoxProperties` / `TextAreaProperties`, więc
  YAML (`InterfaceBuilder`) nie wymaga zmian.

## Zmienione pliki

- `src/Screen/types.mts` — `BUILTIN_TEXT_SELECTION`.
- `src/Screen/StyleRegistry.mts` — preregistracja nowego stylu.
- `src/Screen/controls/TextBox.mts` — selekcja + zaktualizowany
  `handleKey` + renderowanie.
- `src/Screen/controls/TextArea.mts` — j.w. z wsparciem `shift+up/down`.
- `tests/controls/TextBox.test.mts` — 15 nowych testów.
- `tests/controls/TextArea.test.mts` — 11 nowych testów.
- `src/demo.mts` — pre-selekcja pierwszych znaków w `tbUsername`.
- `CHANGELOG.md`, `package.json`, `CLAUDE.md` — wersja 0.28.0.
