# P0-2 — Rich text / multi-style writeText

> Dostarczone w `take4-console` 0.18.0 (2026-04-16).
> Zadanie z [`take4-console-backlog.md`](./take4-console-backlog.md#p0-2-rich-text--multi-style-writetext--s).

## Cel

Dotychczas `Window.writeText(str, { style })` aplikował jeden styl na cały
napis. Konsumenci biblioteki (info-bar, historia komend, command completion,
status line) potrzebują inline'owych segmentów różnych kolorów/atrybutów —
bez robienia osobnego `writeText` per kawałek i ręcznego liczenia pozycji X.

P0-2 dodaje:

1. Segmentowy wariant `writeText(input: WriteTextInput, options?)`.
2. Helper `writeMarkup(template: string, options?)` rozwijający mini-tagi
   `{name}…{/}` na nazwane style z `StyleRegistry`.

## API

### Typy (`src/Screen/types.mts`)

```typescript
export interface WriteTextSegment {
    text:   string;                 // literal text for this segment
    style?: StyleId;                // pre-registered style, merged with base
    attrs?: CellAttributes;         // inline attrs (registered on the fly)
}

export type WriteTextInput =
    | string
    | WriteTextSegment[];

export interface WriteTextOptions {
    x?: number;
    y?: number;
    /** Base style merged UNDER every segment. Default: auto-picked from
     *  disabled/focused/normal state. Pass `0` to suppress. */
    style?: StyleId;
}
```

### `Window.writeText(input, options?)`

- `input: string` — zachowanie sprzed 0.18.0, jeden styl na cały tekst.
- `input: WriteTextSegment[]` — segmenty renderowane inline; kursor
  „płynie" przez kolejne segmenty bez resetu X.
- Dla każdego segmentu:
  - `style` (jeśli podany) jest **mergowany** z `options.style` (base).
    Base daje np. foreground panelu, segment dokłada `bold` lub nadpisuje
    kolor — atrybuty segmentu wygrywają przy konflikcie.
  - Jeśli brak `style`, a jest `attrs` — `attrs` są rejestrowane ad hoc
    w `StyleRegistry` i mergowane z base.
  - Jeśli brak obu — stosowany jest sam base.
- `\n` wewnątrz `text` działa jak w wersji string: reset `x = startX`,
  `y++`. Działa też między segmentami (cursor trzymany globalnie).
- Wszystkie dotychczasowe reguły (clipping, East-Asian width, skip
  zero-width, skip control chars) są zachowane — segmenty używają tej
  samej pętli renderującej, więc nie ma rozjazdów.
- Pusta tablica segmentów jest no-opem.

### `Window.writeMarkup(template, options?)`

Szybki sposób na „stringową" wersję segmentów z użyciem named styles.

Gramatyka:

| Konstrukcja     | Znaczenie                                                         |
| --------------- | ----------------------------------------------------------------- |
| `{name}…{/}`    | segment stylizowany named style'em o kluczu `name`                |
| `{/}`           | zamyka najbliższy otwarty tag                                     |
| `{{` / `}}`     | literalne `{` / `}`                                               |
| `{unknown}`     | nieznane nazwy nie zmieniają stylu bieżącego segmentu             |

Tagi **można zagnieżdżać** — atrybuty z tagu wewnętrznego są mergowane na
atrybuty zewnętrznego, więc `{red}a{bold}b{/}c{/}` daje:

- `a` → red,
- `b` → red + bold,
- `c` → red.

Kompilator markup-u po prostu zamienia template na `WriteTextSegment[]`
i woła `writeText(segments, options)` — całe layout/width/clipping idzie
przez jedną ścieżkę.

## Przykłady

```typescript
// Inline rich-text (segmenty):
window.writeText([
    { text: '✓ ',        style: okId    },
    { text: '[12:05] ',  style: dimId   },
    { text: 'ready',     attrs: { bold: true } },
], { x: 0, y: 0, style: panelFg });

// Named-style markup:
screen.setBuiltinStyle('err',   { foreground: 196, bold: true });
screen.setBuiltinStyle('muted', { foreground: 244, dim: true });

window.writeMarkup(
    '{err}FATAL{/} {muted}could not reach API{/}',
    { x: 1, y: 0 },
);
```

## Algorytm

1. `writeText` normalizuje wejście: string → `[{ text: input }]`.
2. Base `StyleId` jest ustalany raz: `options.style` lub auto-pick
   (disabled → `disabledStyleId`, focused → `focusedStyleId`, inaczej
   `normalStyleId`).
3. Dla każdego segmentu wylicza efektywny `segId`:
   - `seg.style` ma pierwszeństwo, `merge(base, seg.style)`.
   - Inaczej `seg.attrs` → rejestracja + merge.
   - Inaczej `segId = base`.
4. Pętla per-codepoint (ta sama co w stringowej wersji):
   rozpoznaje szerokie glify (dwie komórki + sentinel `''`),
   pomija zero-width codepoints, klipuje do inner-area, honoruje `\n`.

`writeMarkup` parsuje `{` / `}` liniowo. Dla każdego otwartego tagu
aktualny top stacka to `merge(parent_top, named_style_id)`; dla
nieznanej nazwy top stacka przechodzi „as is" (dziedziczenie
zewnętrzne). `{/}` zdejmuje top.

## Wsteczna kompatybilność

- Stara sygnatura `writeText(str: string, options?)` działa bez zmian —
  `WriteTextInput = string | WriteTextSegment[]` to union, więc istniejący
  kod kompiluje się i renderuje identycznie.
- Wszystkie kontrolki w `src/Screen/controls/*` nadal przekazują stringi;
  nic nie trzeba tam zmieniać.
- YAML (`InterfaceBuilder`) nadal pakuje `content:` jako string —
  segmenty/markup są feature'em runtime.

## Zmienione pliki

- `src/Screen/types.mts` — nowe typy `WriteTextSegment`, `WriteTextInput`;
  doprecyzowany opis `WriteTextOptions.style`.
- `src/Screen/Window.mts` — nowa sygnatura `writeText(input, options?)`,
  nowa metoda `writeMarkup(template, options?)`.
- `src/index.mts` — eksport typów `WriteTextSegment`, `WriteTextInput`.
- `src/demo.mts` — nagłówek ekranu używa `writeMarkup`; status bar
  demonstruje segmentowy `writeText` z inline'owymi skrótami, separatorami
  i sekcją dim z emoji/CJK.
- `tests/Window.test.mts` — dwie nowe grupy testów
  (`writeText() with rich-text segments`, `writeMarkup()`, łącznie 15 testów).
- `CHANGELOG.md`, `package.json`, `CLAUDE.md` (backlog progress table).
