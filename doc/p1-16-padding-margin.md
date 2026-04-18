## P1-16 — padding i margin na `Window`

Backlog item `P1-16` uzupełnia fundament layoutu opisany w P0-3. `padding`
(wewnętrzny inset) istnieje od 0.24.0 — ten batch dokłada `margin`
(zewnętrzny inset wokół okna w obrębie layoutu rodzica).

### API

`WindowProperties.margin` przyjmuje ten sam shape co `padding`:

```ts
margin: number                                 // uniform
margin: [vertical, horizontal]                 // tuple
margin: { top?, right?, bottom?, left? }       // partial record
```

Brakujące strony domyślnie mają wartość `0`. Zamiast uzupełniać każde okno
osobno, mamy jeden resolver `resolveMargin(spec)` zwracający pełny
`Margin { top, right, bottom, left }`. Getter `Window#getMargin()` zwraca
kopię rekordu.

### Zachowanie

| Layout      | Wpływ `margin` |
| ----------- | -------------- |
| `absolute`  | pozycja dziecka przesunięta o `(marginLeft, marginTop)` względem normalnie rozwiązanego punktu z `Pos`. Rozmiar bez zmian — `pct`/`abs` nadal liczony od `innerSize` rodzica. |
| `row` / `column` (flex) | każde dziecko zajmuje slot `inner + marginMain`. Całkowity `mainMargin` jest odejmowany od `mainParent` zanim rozdzielamy slack przez `grow` / `shrink`. `itemSpacing` (gap) stosuje się dodatkowo między slotami. Na osi poprzecznej stretch sięga do `crossParent − crossMargin`; alignItems `start`/`center`/`end` centruje dziecko w wolnej przestrzeni (z uwzględnieniem `crossMargin`). |
| `grid`      | dziecko jest resizowane do `cellW − marginH × cellH − marginV` i pozycjonowane w komórce z offsetem `(marginLeft, marginTop)`. Sama komórka ma stały rozmiar — zmiana marginesów nie rekompresuje siatki. |

`getInnerSize()` / `getInnerOffset()` zwracają wciąż wartości tylko dla
padding + border. `margin` jest czysto „zewnętrzny" i zajmuje miejsce w
layoucie rodzica, nie w oknie.

### Algorytm `layoutFlex` (zmiany)

```
totalGap     = (visibleChildren - 1) × gap
totalMargin  = Σ (isRow ? marginLeft+marginRight : marginTop+marginBottom)
totalInner   = Σ resolveBasis(mainSpec, mainParent, naturalSize)
remainder    = mainParent − totalInner − totalMargin − totalGap
```

`remainder` trafia do flex-grow dokładnie tak jak wcześniej. Po ustaleniu
finalnych rozmiarów kursor startuje z `mainStart` i dla każdego dziecka:

```
child.mainCoord = cursor + marginLeading
cursor += mainInner + marginLeading + marginTrailing + itemSpacing
```

### Uzasadnienie projektowe

- **`margin` vs `gap`**: `gap` to rozkład jednorodny między sąsiadami;
  `margin` to decyzja per dziecko („Save dostaje +2 cele z lewej,
  reszta — bez zmian"). Obydwa składają się addytywnie.
- **`margin` vs `padding`**: padding zaciska zawartość do środka okna;
  margin zaciska samo okno w layoucie rodzica. Nie modyfikują się
  wzajemnie — okno z `margin: 2, padding: 2` traci 2 cele w każdą
  stronę z zewnętrz (slot w rodzicu) i 2 z wewnątrz (inner area).
- **Decyzja w `layoutAbsolute`**: margin nie modyfikuje rozmiaru dziecka
  — wyłącznie offset. Zmiana `pct`-size rodzica o margin miałaby
  niejednoznaczną semantykę (dziecko nie uczestniczy w flow), więc
  pozostawione zostało tylko przesunięcie.

### Demo

`src/layout.yaml` → `btnSave` dostał `margin: { left: 2 }`, dzięki czemu
w dolnym pasku przycisków pojawia się dodatkowa przestrzeń między
„Cancel" a „Save" bez rozjeżdżania pozostałych elementów.

### Backwards compatibility

- Okno bez `margin` → `{ top: 0, right: 0, bottom: 0, left: 0 }` →
  każda ścieżka layoutu jest _no-op_ równoważna stanowi sprzed 0.29.0.
- API `getInnerSize()` / `getInnerOffset()` nie zmieniło definicji.
- YAML: nowe pole `margin` jest opcjonalne, brak w istniejących
  layoutach działa jak dotąd.

### Pliki zmienione

- `src/Screen/types.mts` — dodany `Margin`, `MarginSpec`,
  `WindowProperties.margin`, `InterfaceNode.margin`.
- `src/Screen/Window.mts` — `resolveMargin`, pole `margin`, getter
  `getMargin`, integracja w `layoutAbsolute` / `layoutFlex` /
  `layoutGrid`.
- `src/Screen/InterfaceBuilder.mts` — przekazanie `def.margin` do
  `WindowProperties`.
- `src/index.mts` — re-eksport `Margin` / `MarginSpec`.
- `tests/Window.test.mts` — 11 nowych testów (`describe('margin
  option')`).
- `tests/InterfaceBuilder.test.mts` — test margin na dziecku flex.
- `src/layout.yaml` — `btnSave` z `margin: { left: 2 }`.
- `CHANGELOG.md`, `package.json` (0.29.0), `CLAUDE.md` (progress).
