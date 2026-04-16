# P0-9 — Rozszerzenie BorderStyle

> Dostarczone w `take4-console` 0.17.0 (2026-04-16) razem z P0-7.
> Zadanie z [`take4-console-backlog.md`](./take4-console-backlog.md#p0-9-rozszerzenie-borderstyle--s).

## Cel

`BorderStyle` w 0.16.0 oferował trzy warianty: `'single'`, `'double'`,
`'rounded'`. Migracja rpcoon i konsumenci-overlay'owi wymagają mocniejszej
ekspresji wizualnej (heavy frames dla focus, dashed dla disabled, ASCII jako
fallback dla terminali bez Unicode), oraz możliwości podmiany pojedynczych
glifów (custom corners w komponentach typu hero panel).

## API

### `BorderStyle`

```typescript
export type BorderStyle =
  | 'single'    // ─│┌┐└┘     classic light box drawing
  | 'double'    // ═║╔╗╚╝     double-line box drawing
  | 'rounded'   // ─│╭╮╰╯     light box with rounded corners
  | 'thick'     // ━┃┏┓┗┛     heavy / bold box drawing                  ← NEW
  | 'dashed'    // ╌╎┌┐└┘     dashed lines with light corners            ← NEW
  | 'ascii'     // -|+        plain ASCII fallback                       ← NEW
  | 'none';     // placeholder equivalent to no border (no insets)        ← NEW
```

### `BorderChars` (nowy interfejs)

```typescript
export interface BorderChars {
  horizontal: string;           // top + bottom edges
  vertical:   string;           // left + right edges
  topLeft:    string;
  topRight:   string;
  bottomLeft: string;
  bottomRight:string;
  // T-junctions (used by future Table / split-pane controls)
  verticalLeft?:    string;
  verticalRight?:   string;
  horizontalTop?:   string;
  horizontalBottom?:string;
  cross?:           string;
}
```

### `WindowBorder.chars`

```typescript
export interface WindowBorder {
  /* … existing fields … */
  /** Per-glyph overrides applied on top of the chosen `style`'s char set. */
  chars?: Partial<BorderChars>;
}
```

`chars` jest mergowany "spread-style" (`{ ...baseChars, ...border.chars }`),
więc każda nieustalona wartość spada do tego, co dostarcza wybrany
`style`. Override działa per-glyph — można podmienić tylko narożniki
i zostawić linie krawędzi z bazowego stylu.

## Przykłady

```typescript
new Window({
  pos: new Pos(2, 2),
  size: new Size(40, 12),
  border: { top: true, right: true, bottom: true, left: true, style: 'thick', color: 38 },
});

new Window({
  pos: Pos.bottomRight(),
  size: new Size(20, 5),
  border: { top: true, right: true, bottom: true, left: true, style: 'dashed' },
});

// Custom corners on top of the 'single' style:
new Window({
  pos: Pos.center(),
  size: new Size(30, 8),
  border: {
    top: true, right: true, bottom: true, left: true,
    style: 'single',
    chars: { topLeft: '◆', topRight: '◆' },
  },
});

// SSH-friendly fallback:
new Window({
  pos: new Pos(0, 0),
  size: new Size(30, 6),
  border: { top: true, right: true, bottom: true, left: true, style: 'ascii' },
});
```

## Zachowanie `'none'`

`'none'` jest jawnym placeholderem semantycznie równoważnym brakowi
ramki:
- `paintBorder()` wraca natychmiast (bez rysowania jakichkolwiek glifów),
- `borderInset()` zwraca `{0,0,0,0}` (brak inseta dla content area),
- `getInnerOffset()` / `getInnerSize()` traktują okno tak, jakby border
  nie był skonfigurowany.

To pozwala konsumentom przekazywać `border: { style: 'none' }` w sytuacjach,
gdzie typesystem wymaga obiektu `WindowBorder`, a logika dynamicznie wybiera,
czy ramka ma być rysowana — bez gałęzienia na `false`.

## YAML

`InterfaceBuilder` przekazuje cały obiekt `border` do `Window`-a bez
specjalnej obróbki, więc nowe style działają od razu w `layout.yaml`:

```yaml
- id: panelHeavy
  border: { top: true, right: true, bottom: true, left: true, style: thick, color: 38 }

- id: panelDashed
  border: { top: true, right: true, bottom: true, left: true, style: dashed, color: 33 }

- id: panelCustom
  border:
    top: true
    right: true
    bottom: true
    left: true
    style: single
    chars: { topLeft: '◆', topRight: '◆' }
```

## Tabela glifów

| Style    | h | v | tl | tr | bl | br | T-junctions / cross   |
| -------- | - | - | -- | -- | -- | -- | --------------------- |
| single   | ─ | │ | ┌ | ┐ | └ | ┘ | ┤ ├ ┴ ┬ ┼            |
| double   | ═ | ║ | ╔ | ╗ | ╚ | ╝ | ╣ ╠ ╩ ╦ ╬            |
| rounded  | ─ | │ | ╭ | ╮ | ╰ | ╯ | ┤ ├ ┴ ┬ ┼            |
| **thick**   | ━ | ┃ | ┏ | ┓ | ┗ | ┛ | ┫ ┣ ┻ ┳ ╋        |
| **dashed**  | ╌ | ╎ | ┌ | ┐ | └ | ┘ | ┤ ├ ┴ ┬ ┼        |
| **ascii**   | - | \| | + | + | + | + | + + + + +        |
| **none**    | (no glyphs — borderInset returns 0)                     |

T-junctions / cross są w tabeli kompletne dla każdego stylu — nie są
używane przez sam `paintBorder` (rysuje tylko prostokąt z czterema
rogami i krawędziami), ale `BorderChars` udostępnia je dla przyszłych
kontrolek typu `Table` / split-pane, które wewnętrznie rysują linie
krzyżujące krawędzie.

## Zmiany w demo

`src/layout.yaml`:
- `monitorPanel` używa `style: thick, color: 38` — pokazuje heavy box
  na panelu zasobów,
- `eventsPanel` używa `style: dashed, color: 33` — pokazuje dashed box
  na liście zdarzeń,
- `leftPanel` używa `chars: { topLeft: '◆', topRight: '◆' }` na bazie
  `'single'` — pokazuje override pojedynczych glifów.

## Testy

`tests/Window.test.mts` — dodany blok `extended border styles`
(6 testów) pokrywający:

- thick → ┏┓┗┛ ━ ┃
- dashed → ┌┐└┘ ╌ ╎
- ascii → +++ - |
- none → brak glifów + brak inseta (`getInnerOffset` `{0,0}`,
  `getInnerSize` cały obszar)
- chars override podmieniający narożniki bez ruszania krawędzi
- chars override podmieniający horizontal / vertical bez ruszania
  narożników

Pełny suite: **474 testy** przechodzą (`npx vitest run`).

## Kompatybilność wsteczna

- Istniejące style `'single'` / `'double'` / `'rounded'` mają identyczne
  glify jak w 0.16.0 (z dodatkiem T-junctions / cross w tablicy, ale
  `paintBorder` nadal rysuje tylko prostokątną ramkę).
- `WindowBorder` jest typem rozszerzonym o opcjonalne pole `chars` —
  istniejący kod bez `chars` kompiluje się i renderuje identycznie.
- Internal field `BORDER_CHARS` zmienił klucze z skróconych
  (`h`, `v`, `tl`, …) na pełne nazwy z `BorderChars` (`horizontal`,
  `vertical`, `topLeft`, …). To prywatne pole — nie ma wpływu na
  konsumentów biblioteki.

## Pliki zmienione

- `src/Screen/types.mts` — `BorderStyle` rozszerzony o `'thick'`,
  `'dashed'`, `'ascii'`, `'none'`; nowy interfejs `BorderChars`;
  `WindowBorder.chars?: Partial<BorderChars>`.
- `src/Screen/Window.mts` — `BORDER_CHARS` z pełnymi nazwami glifów
  + tabele dla nowych stylów; `borderInset()` traktuje `'none'` jako
  brak inseta; `paintBorder()` mergeuje `border.chars` na bazowy
  zestaw i bail-outuje przy `'none'`.
- `src/index.mts` — eksport `BorderChars`.
- `src/layout.yaml` — `monitorPanel` (thick), `eventsPanel` (dashed),
  `leftPanel` (chars override).
- `tests/Window.test.mts` — nowy blok 6 testów na rozszerzone style.
- `CHANGELOG.md`, `package.json` — wspólny bump 0.16.0 → 0.17.0
  (P0-7 i P0-9 łączone w jednym release na żądanie usera).
