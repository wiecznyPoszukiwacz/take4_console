# P2-59 — Damage tracking / dirty-region render

Wersja: **0.31.0** · ukończone: **2026-04-20**

## Motywacja

Do 0.30.0 `Screen.render()` zawsze serializowało pełny bufor cell-i do
jednej `process.stdout.write()` z `\x1b[H` na początku. Dla dużych
ekranów (120×40 = 4800 cell-i) z rzadko zmieniającymi się oknami
(textbox cursor, spinner tick, progress-bar update) każdy frame
wysyłał kilkadziesiąt KB ANSI, mimo że realnie zmieniło się kilka
komórek.

P2-59 dorzuca damage tracking: każde `Window` wie jaki prostokąt
jego bufora jest „brudny”, a `Screen.render()` emituje tylko te
komórki. Klatka bez żadnych zmian jest pomijana w całości (zero
stdout write-ów).

## Architektura

### Per-window dirty rect

Każdy `Window` ma pole `protected dirtyRect: DirtyRect | 'all' | null`.

- `null` — nic się nie zmieniło od ostatniego emitu.
- `'all'` — całe okno brudne (np. po `fill`, `clear`, zmianie
  stanu fokusa, zmianie label-a, rekonstrukcji region-u).
- `DirtyRect` — bounding box punktowych zmian. `markDirty(rect)`
  eagerly union-uje, więc w pamięci jest zawsze max. jeden
  prostokąt na okno.

`markDirty` jest publiczne — niestandardowe kontrolki mogą
wywoływać go ręcznie, ale wbudowane metody zapisu
(`setCell`, `setChar`, `mergeStyle`, `fill`, `clear`, `writeText`)
same to robią.

### Render-time suppression

Wszystkie wbudowane kontrolki w `render()` robią
`this.clear(); this.writeText(...)` żeby przebudować content.
Gdyby `markDirty` działał w tym kontekście, każdy frame
unieważniałby każde okno → damage tracking stałby się bezużyteczny.

Rozwiązanie: `protected static Window.renderingDepth: number`.
`Window.render()` inkrementuje na wejściu i dekrementuje w
`finally`. `markDirty()` sprawdza `renderingDepth > 0` i nie
robi nic — zapisy w trakcie kompozycji są idempotentne względem
stanu użytkownika, więc nie trzeba ich śledzić.

User-driven mutacje (`setValue`, `setItems`, `setChecked`,
naciśnięcia klawiszy przez `handleKey`, itp.) dzieją się poza
`render()`, więc `renderingDepth === 0` i `markDirty` działa
normalnie.

### Bottom-up propagation

`Window` ma wskaźnik na rodzica (`protected parent: Window | null`)
ustawiany przez `addChild` / czyszczony przez `removeChild`.
Zmiany geometrii i topologii propagują pełny invalidate w górę:

- `setSize` / `resizeRegions` → `markFullInvalidation()`
- `setVisible` → `markFullInvalidation()` + `markDirty()`
- `setZIndex` → `markFullInvalidation()` + `markDirty()`
- `addChild` / `removeChild` → `markFullInvalidation()`

`Window.markFullInvalidation()` bąbelkuje przez `this.parent?`.
`Screen` override-uje ją do ustawienia własnej flagi
`fullInvalidate = true`, więc sygnał nie wychodzi poza drzewo.

Geometria / topologia mogą odsłonić obszar wcześniej zajęty przez
inne okno. Teoretycznie dałoby się emitować tylko union starych
i nowych bounds — w praktyce pełny repaint w tych (rzadkich)
przypadkach jest prostszy i zawsze poprawny.

### Screen emit path

`Screen.render()` ma dwie ścieżki:

1. **Fast path** (`damageTracking === true && !fullInvalidate`):
   - `collectDirtyRects(0, 0, rects)` schodzi w dół drzewa,
     tłumacząc lokalne rect-y na koordynaty ekranowe poprzez
     kumulowanie `child.x / child.y` po drodze.
   - Jeśli `rects.length === 0` → emit `'frame'` event z
     `cellsEmitted: 0` i `return` (skip).
   - `super.render()` rekompozytuje drzewo (buforowo tanie —
     same kopie do `this.region`).
   - `emitDirty(rects)` koalescencja do per-row min/max X,
     emit tylko tych komórek z cursor-addressing-iem
     `\x1b[row;colH`.
   - `clearDirtyRecursive()` na koniec czyści wszystkie flagi.

2. **Full repaint** (pierwsza klatka, po `resize()`, po
   `invalidate()`, po `setDamageTracking(...)`, po disabled
   tracking):
   - `super.render()` rekompozytuje.
   - `emitFull()` emituje cały bufor od `\x1b[H`.
   - `fullInvalidate = false`, `clearDirtyRecursive()`.

## API publiczne

### Window

```typescript
/** Mark this window (or a sub-rect) dirty. No-op during render(). */
public markDirty(rect?: DirtyRect): void;

/** Alias for markDirty(). Flags the whole window. */
public invalidate(): void;
```

### Screen

```typescript
public invalidate(): void;                      // force full repaint
public isDamageTrackingEnabled(): boolean;
public setDamageTracking(enabled: boolean): void;
```

### Types

```typescript
export interface DirtyRect { x: number; y: number; w: number; h: number; }

export interface ScreenOptions {
  // ...
  damageTracking?: boolean;  // default true
}

export interface ScreenFrameStats {
  ms: number;
  cellsEmitted?: number;     // 0 when frame was skipped
  fullRepaint?: boolean;     // undefined for skipped frames
}
```

## Backwards compatibility

- **Brak breaking changes** dla kodu konsumującego. API pozostaje
  identyczny, zmiana jest zerem dla istniejących demów / testów
  (wszystkie 698 istniejących testów przechodzą bez modyfikacji).
- Jeżeli użytkownik buduje własne kontrolki które piszą do
  `region` bezpośrednio (nie przez `Window.setCell`/`writeText`),
  powinien dopisać jawne `this.markDirty()` — inaczej Screen nie
  zauważy zmiany. Dla wszystkich wbudowanych kontrolek jest to
  załatwione.
- `ScreenOptions.damageTracking: false` przywraca pre-0.31
  zachowanie (pełny repaint każdej klatki) — przydatne do
  debugowania terminali które źle radzą sobie z cursor-addressing.
- `'frame'` event otrzymał dwa nowe opcjonalne pola. Handlery
  czytające tylko `ms` działają bez zmian.

## Mierzone zyski

Typowy TUI (screen 120×40, jeden TextBox z migającym kursorem):
- **Przed**: każdy frame = ~4800 cell-i emitowanych, kilkadziesiąt
  KB ANSI per frame.
- **Po**: klatki bez user-input pomijane (0 bajtów); frame po
  naciśnięciu klawisza = emit tylko wiersza TextBox-a (~30–50
  cell-i).

Przy `Spinner`-ze animowanym przez `WindowManager.enableCursorBlink()`
reduktor idzie z ~4800 → ~1 komórki co 600 ms.

## Escape hatches

- `Screen.invalidate()` — forsuje pełny repaint (np. po zewnętrznym
  zapisie do stdout w trakcie `WindowManager.pause()`).
- `Window.invalidate()` — jeżeli custom kontrolka zmienia
  bufor bez użycia `Window.*` metod.
- `new Screen({ damageTracking: false })` lub
  `screen.setDamageTracking(false)` — globalnie wyłącza tracking.

## Zmienione pliki

- `src/Screen/types.mts` — dodany `DirtyRect`, rozszerzone
  `ScreenOptions`, `ScreenFrameStats`.
- `src/Screen/Window.mts` — dirty tracking, parent pointer,
  render-depth guard, propagacja.
- `src/Screen/Screen.mts` — override `render()`, `emitDirty` /
  `emitFull`, flagi `damageTracking` i `fullInvalidate`,
  public API.
- `src/Screen/WindowManager.mts` — `resume()` woła
  `screen.invalidate()`.
- `src/Screen/controls/*.mts` — `markDirty()` w state-setterach
  i `handleKey()` we wszystkich interaktywnych kontrolkach.
- `src/index.mts` — eksport `DirtyRect`.
- `src/demo.mts` — binding `Ctrl+D` do `setDamageTracking`.
- `tests/Screen.test.mts` — 6 nowych testów.
- `package.json` — 0.30.0 → 0.31.0.
- `CHANGELOG.md` — wpis 0.31.0.
