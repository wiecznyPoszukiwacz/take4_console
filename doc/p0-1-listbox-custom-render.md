# P0-1 — Custom per-row rendering w ListBox

> Dostarczone w `take4-console` 0.16.0 (2026-04-16).
> Zadanie z [`take4-console-backlog.md`](./take4-console-backlog.md#p0-1-custom-per-row-rendering-w-listbox--m).

## Cel

Do tej pory `ListBox.setItems(items: string[])` akceptował tylko jeden styl na
wiersz. Konsumenci (np. rpcoon) potrzebują kolorowych ikon, wyciemnionych
timestampów, żółtych markerów "dirty" oraz metadanych wyrównanych do prawej
krawędzi listy. Aktualnie `ListBox` jest generyczny (`ListBox<T>`) i obsługuje
per-row renderer zwracający styl'owane segmenty z wyrównaniem
`left` / `right` / `fill`.

## API

### Typy (`src/Screen/types.mts`)

```typescript
export interface ListBoxRenderContext {
    index:    number;   // 0-based index of the item in the list
    focused:  boolean;  // owning ListBox has keyboard focus
    selected: boolean;  // this row is the selected one
    width:    number;   // inner width (cells) available for the row
}

export interface ListBoxRowSegment {
    text:   string;
    style?: StyleId;                         // merged onto the row's base style
    align?: 'left' | 'right' | 'fill';       // default: 'left'
}

export type ListBoxRowSegments = string | ListBoxRowSegment[];

export interface ListBoxProperties<T = string> {
    items?:         T[];
    selectedIndex?: number;
    onChange?:      (index: number, item: T) => void;
    renderItem?:    (item: T, ctx: ListBoxRenderContext) => ListBoxRowSegments;
    rowHeight?:     number;                  // default: 1
    keyFn?:         (item: T) => string;     // stable key for future reconciliation
}
```

### `ListBox<T = string>`

| Metoda                                         | Opis                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `new ListBox<T>(wp, cp?)`                      | Konstruktor – `cp.items: T[]`, `cp.renderItem`, `cp.rowHeight`, …      |
| `setItems(items: T[])`                         | Zamienia listę; reset selekcji / scrolltop                             |
| `getItems(): T[]`                              | Zwraca aktualną listę                                                  |
| `getSelectedItem(): T \| undefined`            | Zwraca aktualnie wybrany element (lub `undefined` gdy pusta)           |
| `setRenderItem(fn \| undefined)`               | Wymienia renderer po konstrukcji                                       |
| `getRowHeight(): number`                       | Zwraca aktualnie ustawioną wysokość wiersza w komórkach                |
| `getItemKey(item: T): string`                  | Zwraca stały klucz: `keyFn(item)` jeśli podane, inaczej `String(item)` |

### Algorytm renderowania wiersza

Dla każdego widocznego slotu (czyli wiersza listy):

1. Wybierany jest **base style** wiersza:
   - `disabled` → `disabledStyleId`
   - `selected & focused` → jasny inwers (`focusedSelStyle`)
   - `selected` → muted highlight (`selectedStyleId`)
   - w p.p. → `normalStyleId`
2. Każdy wiersz slotu jest wypełniany spacjami w stylu `base` — dzięki czemu
   highlight selekcji pokrywa całą szerokość (nawet przy `rowHeight > 1`).
3. `renderItem(item, ctx)` jest wywoływany raz; zwraca `string` lub tablicę
   `ListBoxRowSegment[]`. Plain string traktowany jest jak jeden segment
   `{ text, align: 'left' }`.
4. Segmenty są dzielone na trzy grupy wg `align`:
   - `left`  — rysowane sekwencyjnie od kolumny 0 w prawo
   - `right` — sumaryczna szerokość jest przyklejana do prawej krawędzi
   - `fill`  — pierwsza taka wstawka zajmuje lukę między `left` a `right`
     (tekst jest skracany do dostępnej szerokości lub dopełniany spacjami).
5. Styl każdego segmentu jest mergowany ze stylem bazowym (`registry.merge`),
   dzięki czemu tło selekcji pozostaje widoczne pod foreground'em segmentu.

Jeśli suma szerokości `left + right` przekracza `width`, segmenty prawe są
obcinane od prawej krawędzi.

### `rowHeight`

`rowHeight > 1` zarezerwuje N kolejnych wierszy na slot (widoczna liczba
slotów = `floor(innerHeight / rowHeight)`). Segmenty są rysowane tylko w
pierwszym wierszu slotu; pozostałe wiersze są wypełnione stylem bazowym (do
wizualnego rozsunięcia / dwuliniowych list). PageUp/PageDn używają liczby
slotów, nie surowych wierszy.

### `keyFn`

Na tę chwilę `keyFn` jest tylko przechowywany i dostępny przez
`getItemKey(item)`. Docelowo posłuży do zachowywania scroll/selection przy
`setItems()` gdy kolejne listy mają tych samych kluczy (React-like
reconciliation). Nie zmienia obecnego zachowania `setItems()`.

## Przykład

```typescript
interface EventRow {
    timestamp: string;
    level:     'ok' | 'warn' | 'error';
    message:   string;
    count:     number;
}

const events = new ListBox<EventRow>(
    { pos: Pos.topLeft(), size: new Size(40, 10) },
    {
        renderItem: (row) => {
            const icon = row.level === 'ok' ? '✓' : row.level === 'warn' ? '⚠' : '✖';
            return [
                { text: `${icon} `,            align: 'left',  style: iconStyle[row.level] },
                { text: `[${row.timestamp}] `, align: 'left',  style: dimTsStyle },
                { text: row.message,           align: 'left' },
                { text: `×${row.count}`,       align: 'right', style: countStyle },
            ];
        },
    },
);
```

## Zmiany w demo

`src/demo.mts` + `src/layout.yaml`:

- `eventsList` to teraz `ListBox<EventRow>` (a nie `ListBox<string>`).
- YAML definiuje kontener (pozycję, rozmiar, border) bez `items:` — dane są
  wypełniane z `tick()` z timestampem, losowo dobranym `level` i counterem.
- Renderer wyświetla:
  - ✓/⚠/✖ kolorową ikonę (zielona/bursztynowa/czerwona)
  - `[HH:MM:SS] ` — dim gray
  - wiadomość w normalnym stylu
  - `×N` — żółte licznik wyrównany do prawej

## Testy

`tests/controls/ListBox.test.mts` — dodano zestaw testów (31 razem) pokrywający:

- generyczność (`ListBox<Row>`, `onChange` otrzymuje typ T)
- `renderItem` zwracający plain string
- `renderItem` z segmentem `right` (prawa krawędź)
- segment `fill` (przyklejanie pozostałej przestrzeni)
- kontekst renderera (`index`, `focused`, `selected`, `width`)
- `rowHeight > 1` (item zajmuje N wierszy)
- `handleKey` PgDn uwzględnia `rowHeight`
- `keyFn` + `getItemKey`
- `setRenderItem` po konstrukcji

Pełny suite: **433 testy** przechodzą.

## Kompatybilność wsteczna

- `ListBox` domyślnie pozostaje `ListBox<string>` — istniejący kod bez
  parametru generycznego kompiluje się bez zmian.
- `ListBoxProperties` jest generyczny (`ListBoxProperties<T = string>`);
  nieparametryzowane użycia zachowują się jak wcześniej.
- Bez `renderItem` domyślny render = `String(item)` w jednym lewym segmencie,
  co daje identyczny efekt wizualny co poprzednia implementacja.

## Pliki zmienione

- `src/Screen/types.mts` — nowe typy `ListBoxRenderContext`,
  `ListBoxRowSegment`, `ListBoxRowSegments`, `ListBoxProperties<T>`
- `src/Screen/controls/ListBox.mts` — pełny rewrite z generykiem, render
  segmentów, rowHeight, keyFn, setRenderItem
- `src/index.mts` — eksportuje nowe typy
- `src/demo.mts` + `src/layout.yaml` — custom renderer na eventsList
- `tests/controls/ListBox.test.mts` — 10 nowych testów
- `CHANGELOG.md`, `package.json` — bump 0.15.1 → 0.16.0
