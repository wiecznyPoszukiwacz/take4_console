# P0-8 — Window.setVisible(bool)

> Dostarczone w `take4-console` 0.22.0 (2026-04-16).
> Zadanie z
> [`take4-console-backlog.md`](./take4-console-backlog.md#p0-8-windowsetvisiblebool--s).

## Cel

rpcoon (i inne aplikacje korzystające z bibliotekowej warstwy okien) potrzebują
tanim kosztem ukrywać i pokazywać gałęzie drzewa UI — bez usuwania okien z
drzewa przez `removeChild` i odbudowywania całego stanu. Typowy przypadek:
panel z historią wywołań, który użytkownik toggle'uje jednym skrótem; panel z
detalami metody, który pojawia się tylko gdy coś wybrano; alert bar, który
znika po potwierdzeniu.

Do 0.21.0 biblioteka oferowała tylko `setActive` (dimmed, nadal rysowane)
i `setDisabled` (dimmed, ignoruje input, nadal rysowane). Nie było sposobu na
„tego okna nie rysuj, nie zabieraj miejsca w focus-cycle". Zadanie P0-8
wypełnia tę lukę.

## API

```typescript
class Window {
  setVisible(visible: boolean): void;
  isVisible(): boolean;            // default: true
}
```

Jedno publiczne pole + pole pary setter/getter, bez nowych typów — rozszerzenie
jest minimalne z rozmysłem.

## Semantyka

* `setVisible(false)` ustawia wewnętrzną flagę `visible = false`. Zawartość
  bufora `content` **nie** jest czyszczona — kolejny `setVisible(true)`
  przywraca okno w stanie, w jakim je zostawiono.
* `Window.render()` robi `if (!this.visible) return;` na samym początku —
  żadna z faz `paintBackground → blitContent → paintBorder → children` nie
  wykonuje się. Również dzieci niewidocznego okna nie są renderowane.
* `Window.render()` przy przechodzeniu przez listę dzieci **pomija** każde
  dziecko z `visible === false`, tak że jego `region` nie jest blitowany na
  bufor rodzica. Efekt: obszar, który zajmowało dziecko, ma dokładnie ten
  kolor tła / zawartość, którą rodzic narysował w `paintBackground` +
  `blitContent`.
* `Window.getCell(x, y)` rzuca `Error('Window.getCell called on a hidden
  window (setVisible(false))')` — to sygnał, że wywołujący sięga do bufora,
  którego nie odświeżano. Konsumenci chcący defensywnie przetestować
  widoczność powinni zapytać `isVisible()`.
* `Screen.render()` (override) nie zmienia się — Screen sam zawsze pozostaje
  widoczny (nie ma sensownego use case dla `screen.setVisible(false)`).

## Integracja z WindowManager

Focus-cycle musi pomijać ukryte kontrolki tak samo, jak pomija wyłączone:

```typescript
// WindowManager.mts (fragment)
private isFocusable(control: Focusable & Window): boolean {
  return !control.isDisabled() && control.isVisible();
}
```

Każde miejsce, które wcześniej sprawdzało wyłącznie `isDisabled()`, teraz
korzysta z `isFocusable`:

* `initializeFocus()` — szuka pierwszej „oswojonej" kontrolki.
* `moveFocus(delta)` — Tab / Shift-Tab cyklują po polach eligible.
* `setFocus(control)` — ignoruje setFocus na hidden.
* `handleMouseEvent(event)` — klik w obszar hidden kontrolki nie przenosi
  focusa (nie ma gdzie — kontrolka jest niewidoczna).

## Zachowanie podczas cyklu życia

* `new Window(...)` → `visible = true`. Żadne pole w `WindowProperties` tego
  nie konfiguruje (celowo — nie chcemy mnożyć inicjalizacji; konstrukcja
  widocznego okna powinna być domyślna).
* `removeChild` na ukrytym dziecku działa identycznie jak na widocznym —
  widoczność jest ortogonalna do obecności w drzewie.
* `addChild` na ukrytym rodzicu nie rzuca — ustawienie hidden-parent nie
  zmienia kontraktu drzewa.

## Aktualizacje demo

`src/demo.mts`:

```typescript
const chartsPanel = result.get('chartsPanel') as Tabs;
wm.bindKey('v', () => {
  chartsPanel.setVisible(!chartsPanel.isVisible());
  screen.render();
  return true;
});
```

Klawisz `v` toggle'uje widoczność prawego górnego panelu z sparkline-ami i
wykresami (Tabs). Po ukryciu widzimy gołe tło dialogu z placeholder-em
ramki. Po ponownym pokazaniu — zawartość wraca bez utraty danych (bo
`setVisible` nie czyści `content`). Status bar listy skrótów dostaje
literę `v` w obu trybach (help / normal), żeby feature był widoczny bez
czytania dokumentacji.

## Backwards compatibility

* Zero breaking changes — nowa flaga jest domyślnie `true`.
* Żadne kod konsumenta nie musi wołać `setVisible`; bez wywołania Window
  zachowuje się identycznie jak przed 0.22.0.
* `isDisabled` + `setDisabled` pozostają niezależnymi wymiarami stanu —
  można mieć `visible && disabled` (np. dimmed preview) albo `!visible`
  (całkowicie ukryte, nieistotne czy disabled).

## Testy

`tests/Window.test.mts` — dodane w describe „border styles":

* `setVisible(false)` zamienia `render()` w no-op, `getCell` rzuca,
  ponowne `setVisible(true)` przywraca pełen cykl.
* Ukryte dziecko nie pozostawia śladu w buforze rodzica — rodzic zachowuje
  własne `background` w miejscu, gdzie wcześniej blitowało się dziecko.

`tests/WindowManager.test.mts` — dodane w describe „Tab focus cycling":

* Tab pomija hidden kontrolkę (`hidden.setVisible(false)` pomiędzy `a` i `b`
  → Tab z `a` → `b`, nie `hidden`).
* `setFocus(hiddenControl)` jest ignorowane.

Cała suita: 545 testów (541 → 545), wszystkie zielone. `npx tsc --noEmit`
czysto.

## Pliki zmienione

* `src/Screen/Window.mts` — pole `visible`, `setVisible/isVisible`,
  `getCell` rzuca, `render` guarduje + pomija hidden dzieci.
* `src/Screen/WindowManager.mts` — prywatny helper `isFocusable`;
  `setFocus`, `initializeFocus`, `moveFocus`, `handleMouseEvent`
  sprawdzają widoczność + disabled.
* `src/demo.mts` — bindKey(`v`) toggle na `chartsPanel` +
  literka w status barze.
* `tests/Window.test.mts`, `tests/WindowManager.test.mts` — nowe testy.
* `package.json`, `CHANGELOG.md`, `CLAUDE.md` — bump do 0.22.0 + progres
  tablicy backlog.
