# P1-27 · Toast / Notification overlay

`Screen.toast(text, options?)` pokazuje nie-modalne okno powiadomienia
w wybranym rogu ekranu. Toasty same się odpaliają (setTimeout), stackują
pionowo i znikają bez naruszania focusu ani stanu dialog-stack.

## API

```typescript
class Screen {
  toast(text: string, options?: ToastOptions): Toast;
  dismissToast(toast: Toast): void;
  getActiveToasts(position?: ToastPosition): readonly Toast[];
}

interface ToastOptions {
  duration?: number;           // ms, default 2000; 0 = sticky
  style?: StyleId;             // background + text; default BUILTIN_TOAST
  position?: ToastPosition;    // default 'top-right'
  border?: WindowBorder | boolean; // default rounded single border
  zIndex?: number;             // default 10_000
  width?: number;              // override text-based auto width
  onDismiss?: () => void;
}

type ToastPosition =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

class Toast extends Window {
  getMessage(): string;
  getToastPosition(): ToastPosition;
  getToastStyle(): StyleId;
  dismiss(): void;
}
```

## Rozmiar i rozmieszczenie

Toast auto-size'uje się do:

```
width  = max(1, stringWidth(text)) + 2 * hPadding + borderLeft + borderRight
height = 1                         +                borderTop  + borderBottom
```

`hPadding = 1` (stałe). Toast nigdy nie wrapuje tekstu — szerszy tekst
pełznie poza prawą krawędź (w praktyce terminal go ucina, bo Region ma
stałą szerokość).

Pozycjonowanie wylicza `Screen.relayoutToasts(position)` po każdej
zmianie zbioru toastów dla danego kotwicy (`addChild` / `dismiss`) oraz
po `Screen.resize()` (SIGWINCH ➜ reflow ➜ emit `'resize'`). Algorytm:

1. Wybierz horyzontalny anchor: `left` / `right` / `center` z sufiksu
   pozycji.
2. Wybierz wertykalny anchor: `top` / `bottom` z prefiksu.
3. Dla każdego toastu w liście: `x` z anchorem horyzontalnym, `y` z
   narastającego offsetu (top: 0, +h, +2h; bottom: -h, -2h, …).

Pozycje są zapisywane wprost w `toast.x` / `toast.y` — Toast konstruuje
się z `Pos.topLeft()` tylko jako placeholder, bo `layoutAbsolute` go
nadpisuje przy `addChild`, a my tuż potem zapisujemy finalne
współrzędne.

## Cykl życia

1. `screen.toast(text, opts)` → `new Toast(...)` → `screen.addChild(toast)`
   (z `zIndex: 10_000` — respektowane przez `Window.getVisibleChildren`
   wprowadzone w 0.26.0).
2. `attachDismiss` podpina `toast.dismiss()` → `screen.dismissToast(toast)`
   — bez cyklicznego importu między `Toast` a `Screen`.
3. Jeżeli `duration > 0`, Screen uruchamia `setTimeout` z `unref()`
   żeby nie trzymał event-loopa Node'a otwartego przy wyłączaniu.
4. `dismissToast`:
   - usuwa toast z `activeToasts.get(position)`,
   - czyści `toastTimers`,
   - `screen.removeChild(toast)`,
   - `relayoutToasts(position)` (pozostałe toasty przesuwają się w
     stronę kotwicy),
   - `toastDismissHandlers.get(toast)?.()` i czyszczenie mapy,
   - `this.render()`.
5. `screen.dispose()` clear-uje wszystkie timery i mapy — po dispose nie
   ma szans wyskoczyć "zombie"-toast.

## Styl

Nowa nazwana pozycja w `StyleRegistry`:

```typescript
BUILTIN_TOAST = { background: 24, foreground: 231, bold: true }
```

Użytkownik może nadpisać globalnie:

```typescript
screen.setBuiltinStyle(BUILTIN_TOAST, { background: 196, foreground: 231 });
```

albo per-call:

```typescript
screen.toast('Error!', { style: screen.registerStyle({ background: 196, foreground: 231, bold: true }) });
```

## Demo

`src/demo.mts` dopina dwa skróty:

- `Ctrl+T` — krótki toast top-right z licznikiem + timestampem. Stackuje
  się po kilku naciśnięciach.
- `Ctrl+Y` — sticky bottom-right toast (`duration: 0`). Drugie naciśnięcie
  wywołuje `toast.dismiss()`, a `onDismiss` czyści referencję.

Żaden toast nie kradnie focusu ani nie dodaje się do dialog-stacka
WindowManagera — `bindKey` handlery wracają `true`, więc klawisze nie
idą do fokusowanych TextBoxów.

## Backwards compatibility

- Brak breaking changes. `ToastOptions` / `ToastPosition` / `Toast` /
  `BUILTIN_TOAST` dochodzą do `types.mts` + `index.mts` jako nowy
  eksport; istniejące skrypty nie są dotykane.
- Konstruktor `StyleRegistry` rejestruje nowy built-in po tekście
  `builtin:text-selection` — wcześniejsze builtiny zachowują identyczne
  IDs (toast wymusza tylko jedno nowe wpisanie).
- `Screen.resize()` zyskuje wywołanie `relayoutAllToasts()` przed
  emisją `'resize'`. Konsumenci bez toastów nie odczują różnicy (mapa
  pusta → pętla no-op).

## Pliki zmienione

- `src/Screen/types.mts` — `BUILTIN_TOAST`, `ToastPosition`, `ToastOptions`.
- `src/Screen/StyleRegistry.mts` — `BUILTIN_TOAST` registered w konstruktorze.
- `src/Screen/controls/Toast.mts` — nowa klasa `Toast` + helper `resolveDefaultStyle`.
- `src/Screen/Screen.mts` — `toast()`, `dismissToast()`,
  `getActiveToasts()`, `relayoutToasts()`, `relayoutAllToasts()`,
  cleanup w `dispose()`, hook w `resize()`.
- `src/index.mts` — re-export `Toast`, `BUILTIN_TOAST`, `ToastPosition`,
  `ToastOptions`.
- `src/demo.mts` — bindingi `Ctrl+T` i `Ctrl+Y`.
- `tests/controls/Toast.test.mts` — 18 testów (placement w każdym rogu,
  stacking, reflow po dismiss, auto-dismiss, sticky, manual dismiss,
  resize reanchor, styl default/custom, zIndex, double-dismiss no-op).
- `package.json` — wersja 0.30.0.
- `CHANGELOG.md` — wpis 0.30.0.
- `CLAUDE.md` — progress update.
