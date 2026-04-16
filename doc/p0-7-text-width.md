# P0-7 — Text measurement z East-Asian width

> Dostarczone w `take4-console` 0.17.0 (2026-04-16).
> Zadanie z [`take4-console-backlog.md`](./take4-console-backlog.md#p0-7-text-measurement-z-east-asian-width--m).

## Cel

`writeText()` traktował dotąd każdy codepoint jako jeden cell. CJK
(`日 本 語`), emoji (`🚀 💾`) i double-width NerdFonts zajmują w terminalu
**dwa** cell-e — przez co layout się rozjeżdżał, a wyrównane do prawej meta
nakładały się na tekst poprzedniego segmentu.

`0.17.0` dodaje moduł `textWidth.mts` z tabelami szerokości znaków na
podstawie Unicode East Asian Width (kategorie W i F) plus zero-width
control / combining ranges, oraz integruje go z `Window.writeText()`
i `Screen.render()` — aplikacje konsumujące bibliotekę dostają poprawne
wyrównanie automatycznie, bez zmiany API.

## API

### `src/Screen/textWidth.mts`

```typescript
export const charWidth   : (codepoint: number) => 0 | 1 | 2;
export const stringWidth : (str: string)       => number;
export const setPuaWidth : (width: 1 | 2)      => void;
export const getPuaWidth : ()                  => 1 | 2;
```

| Funkcja                  | Opis                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `charWidth(cp)`          | Zwraca 0, 1 lub 2 dla codepointa. Zero-width: control, combining, ZWJ, BOM, VS.       |
| `stringWidth(str)`       | Sumuje `charWidth` po wszystkich codepointach (iteruje `for..of`, więc surrogate pairs są jednym wynikiem). |
| `setPuaWidth(1\|2)`      | Ustawia szerokość komórek dla Private Use Area (NerdFonts). Domyślnie 1.              |
| `getPuaWidth()`          | Zwraca aktualnie skonfigurowaną szerokość PUA.                                        |

### `Window`

```typescript
class Window {
  /* nowe */
  public getTextWidth(text: string): number;
}
```

`getTextWidth` jest cienkim wrapperem nad `stringWidth` — zachowuje spójną
ergonomię (kontrole zapisują tekst metodą `Window.writeText`, więc symetrycznie
mierzą go metodą `Window.getTextWidth`).

## Algorytm renderowania szerokich znaków

1. `writeText` iteruje po codepointach (`for..of`), wylicza `charWidth(cp)`.
2. Codepoint o szerokości 0 (kombinujące, control, ZWJ) jest **pomijany** —
   nie zaawansowuje kursora.
3. Codepoint o szerokości 1 jest zapisywany do bieżącej komórki, kursor
   przesuwa się o 1.
4. Codepoint o szerokości 2 jest zapisywany do bieżącej komórki **wraz z
   sentinelem `''`** w komórce następnej; kursor przesuwa się o 2.
5. Jeśli prawa połówka znaku szerokiego nie zmieści się w obszarze inner
   (`cx + 1 >= ox + iw`), znak jest pomijany w całości — w przeciwnym razie
   terminal zrenderowałby go obcięty od prawej, niszcząc layout.
6. `Screen.render()` iteruje po wszystkich komórkach. Komórki z `''` są
   pomijane przy konkatenacji do bufora ANSI — terminal już przesunął kursor
   o dwie pozycje przy lewej połówce, więc kolejne komórki trafiają we
   właściwe kolumny.

### Dlaczego `''` a nie `' '`?

Sentinel `''` jest semantycznie odróżnialny od pustej komórki wypełnionej
spacją (która ma szerokość 1). `Screen.render()` rozpoznaje go po identyczności
(`ch === ''`) i nie emituje żadnego znaku — dzięki temu liczba kolumn zajętych
w terminalu zgadza się z liczbą buforowych komórek (każdy szeroki znak konsumuje
2 buforowe cell-e, a zwraca 2 terminalowe cell-e).

### PUA / NerdFonts

Codepointy `U+E000..F8FF` (BMP PUA) oraz `U+F0000..FFFFD` /
`U+100000..10FFFD` (planar PUA) traktowane są jako szerokość konfigurowalna
przez `setPuaWidth`. Domyślnie `1`, bo większość patched-NerdFonts renderuje
glify w jednej komórce. Aplikacje używające szerokich glifów mogą przełączyć
to globalnie:

```typescript
import { setPuaWidth } from 'take4-console';
setPuaWidth(2);
```

### Tabele Unicode

`textWidth.mts` zawiera dwie posortowane tabele interwałów:

- **`ZERO_RANGES`** — control, combining, format, ZWJ, BOM, variation
  selectors. Kompaktowe pokrycie najczęściej spotykanych zero-width zakresów
  (Latin / Cyrillic / Hebrew / Arabic combining + zero-width spaces +
  variation selectors).
- **`WIDE_RANGES`** — kategorie W i F z Unicode East Asian Width: Hangul,
  CJK Unified Ideographs (BMP + Ext A/B/C/D/E/F/G), Hiragana, Katakana,
  Yi, fullwidth ASCII, emoji w Supplementary Multilingual Plane, Misc
  Symbols, Transport, Supplemental Symbols, Tangut, Kana Supplement.

Lookup robi binary search w `O(log n)` po liczbie interwałów (~50 wide
i ~40 zero), co jest znikomym kosztem nawet przy długich napisach.

### Limitacje

- **Combining marks** są pomijane (nie ma sposobu nałożyć je na poprzedni
  cell w aktualnym modelu bufora). Tekst `e\u0301` wyrenderuje się jako
  `e` bez akcentu. Pełne wsparcie wymaga grapheme-aware bufora — zadanie na
  dalszy roadmap.
- **`ListBox` per-row segmenty** używają `text.length` (UTF-16 code units),
  nie `stringWidth`, do advancingu lewego/prawego kursora. Dla emoji w
  Supplementary plane (surrogate pair) `length=2 = display width 2`, więc
  alignment się zgadza. Dla BMP CJK `length=1 ≠ width 2` — alignment będzie
  wadliwy. Refactor ListBox to nakieruje go na `getTextWidth` jest planowany
  jako follow-up.

## Zmiany w demo

`src/demo.mts` — kilka templates eventów ma double-width emoji
(`'cache warmed 🚀'`, `'job completed 💾'`) — uruchamiany demo pokazuje, że
ListBox / writeText nie psują wyrównania, gdy wide glify trafią do logu.

Inne kontrolki (header NerdFont glyph ``) działają jak wcześniej — PUA
domyślnie ma width 1, więc rendering jest identyczny z 0.16.0.

## Testy

- `tests/textWidth.test.mts` (nowy) — 17 testów: ASCII / control /
  combining / variation selectors / CJK / Hangul / fullwidth / emoji /
  CJK Ext B / PUA z setPuaWidth / non-CJK Latin extended / `stringWidth`
  na mieszanych ciągach.
- `tests/Window.test.mts` — dodany blok `writeText() with wide characters`
  (8 testów) + blok `getTextWidth()` (3 testy): wide CJK w 2 komórkach,
  cursor zaawansowanie o 2, emoji w supplementary plane, clipping na prawej
  krawędzi, pomijanie combining marks i control codes, PUA respektuje
  `setPuaWidth`, newline + wide znak.
- `tests/Screen.test.mts` — 2 testy potwierdzające, że render skipping
  sentinela `''` działa zarówno przy ręcznym `setCell`, jak i przez
  `Window.writeText` zagnieżdżony przez Screen.

Pełny suite: **474 testy** przechodzą (`npx vitest run`).

## Kompatybilność wsteczna

- `writeText()` z czystym ASCII / Latin extended ma identyczne zachowanie
  jak w 0.16.0 (wszystkie te znaki mają szerokość 1).
- `Window.getCell()` zwraca cell normalnie; dla continuation-cell po wide
  znaku `cell.char === ''`. Konsumenci czytający bufor przez `getCell` mogą
  to wykryć i pominąć.
- `Screen.render()` produkuje krótszy ANSI string przy obecności wide znaków
  (skipping continuation cells) — to oszczędność, nie regresja.
- Kontrole, które zapisują tekst przez `writeText()`, automatycznie
  korzystają z poprawnego liczenia szerokości — nie wymaga to ich zmiany.

## Pliki zmienione

- `src/Screen/textWidth.mts` — nowy moduł z `charWidth` / `stringWidth` /
  `setPuaWidth` / `getPuaWidth`.
- `src/Screen/Window.mts` — `writeText()` używa `charWidth`, dodano
  `getTextWidth()`.
- `src/Screen/Screen.mts` — `render()` skipuje continuation cells (`ch === ''`).
- `src/index.mts` — eksport `charWidth`, `stringWidth`, `setPuaWidth`,
  `getPuaWidth`.
- `src/demo.mts` — kilka eventów z double-width emoji do live-testu.
- `tests/textWidth.test.mts` — nowy plik testów.
- `tests/Window.test.mts` — dodany blok wide-char + getTextWidth.
- `tests/Screen.test.mts` — dwa testy renderowania wide znaków.
- `CHANGELOG.md`, `package.json` — bump 0.16.0 → 0.17.0.
