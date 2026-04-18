# P0-3 — Flex layout (auto-sizing)

> Dostarczone w `take4-console` 0.24.0 (2026-04-18).
> Zadanie z [`take4-console-backlog.md`](./take4-console-backlog.md#p0-3-flex-layout-auto-sizing--l).

## Cel

Dotychczasowe layouty opierały się wyłącznie na absolutnym Pos + Size
(optional Pct). Autorzy rpcoon / aplikacji konsumujących bibliotekę chcieli
deklaratywnych, responsywnych pasków narzędzi i formularzy z:
- wspólnym `gap` między dziećmi,
- elementem „spacer" który zjada leftover (`flex-grow`),
- dopasowaniem rozmiarów do treści (`auto-size`),
- wyrównaniem cross-axis (stretch / center / end),
- gridem N × M dla dashboardów.

`0.24.0` dodaje cztery tryby layoutu (`absolute` / `row` / `column` / `grid`),
nową maszynerię wymiarów flex (`grow` / `shrink` / `basis`) + content-sized,
oraz znacznik pozycji `Pos.flex(order?)`. Wszystko opcjonalne — tryb domyślny
dalej to `'absolute'`, więc istniejące layouty (wszystkie testy, demo,
layout.yaml) działają bez zmian, 1:1.

## API

### `src/Screen/types.mts` — nowe typy

```typescript
export type AxisSpec =
  | { mode: 'start';  value: number }
  | { mode: 'end';    value: number }
  | { mode: 'pct';    value: number }
  | { mode: 'center' }
  | { mode: 'flex';   order: number };          // NOWE

export type FlexBasis =                         // NOWE
  | { kind: 'abs'; value: number }
  | { kind: 'pct'; value: number };

export type DimSpec =
  | { mode: 'abs';     value: number }
  | { mode: 'pct';     value: number }
  | { mode: 'flex';    grow: number; shrink: number; basis: FlexBasis }  // NOWE
  | { mode: 'content' };                                                  // NOWE

export type LayoutMode     = 'absolute' | 'row' | 'column' | 'grid';
export type AlignItems     = 'start' | 'center' | 'end' | 'stretch';
export type JustifyContent = 'start' | 'center' | 'end' | 'space-between' | 'space-around';
export interface Padding   { top: number; right: number; bottom: number; left: number; }
export type PaddingSpec    = number | [number, number] | Partial<Padding>;

export interface WindowProperties {
  // … dotychczasowe pola …
  layout?:         LayoutMode;         // domyślnie 'absolute' — back-compat
  gap?:            number;             // odstęp między dziećmi
  padding?:        PaddingSpec;        // inset wewnątrz bordera
  gridColumns?:    number;             // liczba kolumn dla layout: grid
  alignItems?:     AlignItems;         // domyślnie 'stretch'
  justifyContent?: JustifyContent;     // domyślnie 'start'
}
```

### `src/Screen/Pos.mts`

```typescript
class Pos {
  // … dotychczasowe fabryki …
  public static flex(order?: number): Pos;      // slot flex, order domyślnie 0
  public getFlexOrder(): number | undefined;    // zwraca order lub undefined
}
```

`Pos.flex` oznacza dziecko jako kandydata do layoutu flex / grid. Silnik
parenta nadpisze `child.x`/`child.y` po sizing-u. `isAbsolute()` zwraca
`false`, więc `addChild` nie traktuje child'a jako in-place-positionable.

### `src/Screen/Size.mts`

```typescript
class FlexDim {
  readonly grow:   number;  // domyślnie 1
  readonly shrink: number;  // domyślnie 1
  readonly basis:  number | Pct;  // domyślnie 0
}
class ContentDim { static readonly INSTANCE: ContentDim; }

export function flex(grow?: number, shrink?: number, basis?: number | Pct): FlexDim;
export function content(): ContentDim;

export type DimValue = number | Pct | FlexDim | ContentDim;

class Size {
  constructor(w: DimValue, h: DimValue);          // zaakceptuje flex/content
  static flex(grow?, shrink?, basis?): Size;      // flex na obu osiach
  static content(): Size;                         // content na obu osiach
  getWidthSpec(): DimSpec;                        // introspekcja
  getHeightSpec(): DimSpec;
}
```

Mieszanie per-axis jest wspierane: `new Size(flex(2), content())`,
`new Size(pct(50), flex())` etc.

### `src/Screen/Window.mts` — silnik layoutu

- `addChild(child)` i `setSize(w, h)` (→ `reflowChildren`) delegują do
  `runLayout()`.
- `runLayout()` dispatchuje na `layoutAbsolute` / `layoutFlex('row' | 'column')`
  / `layoutGrid`.
- `getInnerSize()` i `getInnerOffset()` uwzględniają zarówno border inset,
  jak i padding (nowy `innerInset()` helper składa oba).
- `blitChild` czyta `child.x`/`child.y` zamiast ponownie resolve'ować
  `posSpec` — absolute i flex mają teraz wspólną ścieżkę kompozycji.

## Algorytm `layoutFlex(mode: 'row' | 'column')`

Dla `mode='row'` oś główna = width, cross = height (swap dla `'column'`).

1. **Filtruj i sortuj dzieci**: tylko widoczne (`child.isVisible()`), sort
   stabilny po `Pos.getFlexOrder() ?? 0`, tie-break = kolejność `addChild`.

2. **Basis na main axis** (`resolveFlexBasis`):
   - `abs`     → `spec.value`
   - `pct`     → `floor(parent * spec.value / 100)`
   - `flex`    → `basis.value` (lub floor z % gdy `basis.kind === 'pct'`)
   - `content` → `child.getSize()[axis]` (naturalny rozmiar)

3. **Basis na cross axis** — tym samym wzorem, użyj parent cross.

4. **Dystrybucja main-axis remainderu**:
   - `totalMain = Σ basis`, `totalGap = (n - 1) * gap`,
     `remainder = mainParent - totalMain - totalGap`.
   - Jeśli `remainder > 0` i istnieje `grow > 0`: rozdziel pro-rata
     `share = floor(remainder * grow_i / ΣgrowM)`; reszta od truncation
     trafia do ostatniego flex-a (żeby suma = inner — nie ma dziur).
   - Jeśli `remainder < 0`: skracaj pro-rata `shrink` (ceil, clamp do 0).

5. **Cross stretch**: gdy `alignItems === 'stretch'` i `crossSpec.mode` nie
   jest `abs`/`pct` → dziecko dostaje `crossParent`. Inaczej clamp do
   `crossParent`.

6. **`justifyContent`** aplikuje się **tylko** gdy pozostał dodatni
   `remainder` po grow (czyli nikt go nie zjadł):
   - `start`         — nic (domyślne).
   - `center`        — `mainStart = remainder/2`.
   - `end`           — `mainStart = remainder`.
   - `space-between` — `itemSpacing = gap + remainder/(n-1)`.
   - `space-around`  — połówkowe padding na krawędziach + doklejane do gap.

7. **Apply**: dla każdego item-a:
   - `resizeRegions(newW, newH)` tylko gdy rozmiar się zmienił (oszczędza
     content buffer w przeciwnym wypadku — choć obecnie `resizeRegions`
     i tak clear-uje, więc kontrolki wywołują swoje `render()` które
     repaint-uje).
   - Oblicz `crossPos` per `alignItems` (start/center/end).
   - Wpisz `child.x`, `child.y` względem `inner offset + kursor` (main) oraz
     `crossPos` (cross).
   - Zwiększ `cursor += mainSize + itemSpacing`.

## Algorytm `layoutGrid`

- `cols = max(1, gridColumns)`, `rows = ceil(n / cols)`.
- `cellW = floor((pw - gap * (cols - 1)) / cols)`,
  `cellH = floor((ph - gap * (rows - 1)) / rows)`.
- Row-major: i-te dziecko trafia do `(i % cols, floor(i / cols))`,
  rozmiar = `cellW × cellH`, pozycja = `ox + c*(cellW+gap), oy + r*(cellH+gap)`.
- `alignItems` / `justifyContent` na razie ignorowane przez grid — dzieci
  zawsze dostają pełną komórkę.

## YAML (InterfaceBuilder)

Nowe shorthandy w `pos` i `size`:

```yaml
pos: flex                # Pos.flex()
pos: { flex: 2 }         # Pos.flex(2)

size: flex               # Size.flex()
size: content            # Size.content()
size: { flex: { grow: 2, shrink: 0, basis: "30%" } }  # Size.flex(2, 0, pct(30))
size: { width: content, height: { flex: { grow: 1 } } }
```

Nowe pola na każdej definicji okna (optional):

```yaml
- id: toolbar
  size: { fillWidth: 3 }
  layout: row            # | column | grid | absolute (default)
  gap: 1
  padding: 1             # | [1, 2] | { top: 1, right: 2 }
  alignItems: stretch    # start | center | end | stretch (default)
  justifyContent: end    # start | center | end | space-between | space-around
  gridColumns: 2         # tylko dla layout: grid
  children: …
```

## Demo

`src/layout.yaml` ma teraz na dole dialogu flex-row `buttonRow`:

```yaml
- id: buttonRow
  pos: { x: 0, y: -4 }
  size: { fillWidth: 3 }
  layout: row
  gap: 1
  alignItems: stretch
  children:
    - id: btnDisabled  (pos: flex, size: { width: 11, height: 3 })
    - id: buttonSpacer (pos: flex, size: flex)
    - id: btnCancel    (pos: flex, size: { width: 11, height: 3 })
    - id: btnSave      (pos: flex, size: { width: 11, height: 3 })
```

Wizualnie — identyczne rozmieszczenie jak wcześniej (Delete na lewej,
Cancel/Save przy prawej krawędzi), ale teraz deklaratywne i auto-reflow przy
SIGWINCH. `buttonSpacer` z `size: flex` zjada całą pozostałą szerokość.

## Kompatybilność wsteczna

- `layout` nie ustawione → `'absolute'` → kod `layoutAbsolute` to 1:1 to samo
  co dotychczasowy `reflowChildren` + `addChild` path.
- `Pos` bez `.flex()` → `getFlexOrder() === undefined`, ale w `absolute`
  layoutcie i tak nie jest czytane.
- `Size` bez flex/content → `DimSpec` z `abs`/`pct` jak wcześniej,
  `resolve()` zwraca te same wartości.
- Wszystkie 551 dotychczasowych testów przechodzi bez zmian; nowe API
  dodaje 45 testów (27 w Pos/Size/Window, 6 w InterfaceBuilder).

## Pliki zmienione

- `src/Screen/types.mts` — nowe typy i rozszerzenia `WindowProperties` /
  `YamlPosSpec` / `YamlSizeSpec` / `YamlWindowDef`.
- `src/Screen/Pos.mts` — `Pos.flex` + `getFlexOrder` + handling `flex` w
  `resolveAxis`.
- `src/Screen/Size.mts` — nowe klasy `FlexDim` / `ContentDim`, fabryki
  `flex()` / `content()`, rozszerzone konstruktor + `Size.flex` /
  `Size.content`, gettery speców.
- `src/Screen/Window.mts` — magazyn layoutu (mode/gap/padding/gridColumns/
  align/justify), `innerInset`, `runLayout` + `layoutAbsolute` /
  `layoutFlex` / `layoutGrid`, `orderedVisibleChildren`, `resolveFlexBasis`
  helper.
- `src/Screen/InterfaceBuilder.mts` — parser `pos: flex`, `size: flex/content`,
  `parseDimValue`, propagacja layout/gap/padding/…/justifyContent do `wp`.
- `src/index.mts` — re-eksport `FlexDim`, `ContentDim`, `flex`, `content`
  oraz nowych typów.
- `src/layout.yaml` — konwersja dolnego paska akcji na `layout: row` +
  spacer.
- `tests/Pos.test.mts`, `tests/Size.test.mts`, `tests/Window.test.mts`,
  `tests/InterfaceBuilder.test.mts` — nowe testy.
- `package.json` → `0.24.0`, `CHANGELOG.md`, `CLAUDE.md` (progress table).
