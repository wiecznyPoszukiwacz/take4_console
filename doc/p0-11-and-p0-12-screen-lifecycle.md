# P0-11 + P0-12 — Screen lifecycle (alt-screen, hide-cursor, SIGWINCH)

> Dostarczone razem w `take4-console` 0.19.0 (2026-04-16).
> Zadania z [`take4-console-backlog.md`](./take4-console-backlog.md#p0-11-screen-alt-screen--hide-cursor-opcja--s)
> oraz [P0-12](./take4-console-backlog.md#p0-12-sigwinch-autoresize--event--s).

## Cel

Do 0.18.0 cykl życia terminala (alt-screen buffer, ukrywanie kursora) był
w całości po stronie `WindowManager.run/stop`. Konsumenci-bez-WindowManagera
(skrypty renderujące jeden frame, narzędzia testowe, integracje server-side)
musieli sami pisać sekwencje `\x1b[?1049h` / `\x1b[?25l` i wyłapywać sygnały,
żeby przywrócić stan. Brakowało też reakcji na zmianę rozmiaru okna terminala
— dzieci ze specyfikacją `Pct` siedziały zaresolwowane do starego parent size.

P0-11 + P0-12 adresują to po stronie `Screen`:

* `ScreenOptions` pozwala `Screen` przejąć alt-screen / cursor / target FPS
  przy konstruktorze.
* `Screen` rozszerza event API o `'resize'` (po SIGWINCH) i `'frame'`
  (po każdym `render`).
* `WindowManager` nie podwaja toggle'i — sprawdza, kto jest właścicielem stanu
  (`isAltScreenActive` / `isCursorHidden`).

## API

### `ScreenOptions`

```typescript
export interface ScreenOptions {
  altScreen?:  boolean;            // default false
  hideCursor?: boolean;            // default false
  targetFps?:  number;             // default undefined (uncapped)
}

new Screen(options?: ScreenOptions);
```

* `altScreen: true` — `Screen` w konstruktorze pisze `\x1b[?1049h` i ustawia
  `altScreenActive = true`. `dispose()` (i listener `process.on('exit')`)
  pisze `\x1b[?1049l`.
* `hideCursor: true` — analogicznie z `\x1b[?25l` / `\x1b[?25h`.
* `targetFps` — soft cap przechowywany dla inspekcji (`getTargetFps()`).
  Pełną semantykę (frame coalescing, cap częstotliwości render) dostarczy
  P2-47; dziś jest to wyłącznie deklaracja zamiaru po stronie API.

Defaults zachowują przed-0.19.0 zachowanie: kod oparty o `WindowManager`
działa bez zmian, bo `WindowManager.run/stop` nadal wykonuje toggle gdy nikt
inny go nie wykonał.

### Lifecycle helpers

```typescript
class Screen {
  enterAltScreen(): void;          // idempotent
  exitAltScreen(): void;           // idempotent
  isAltScreenActive(): boolean;

  hideHardwareCursor(): void;      // idempotent
  showHardwareCursor(): void;      // idempotent
  isCursorHidden(): boolean;

  getTargetFps(): number | undefined;
  dispose(): void;                  // restore + detach listeners (idempotent)
}
```

`WindowManager.run` woła te metody zamiast pisać escape'y wprost. Jeżeli stan
był już aktywny (np. `Screen` ustawił go w konstruktorze), `WindowManager`
zapamiętuje, że nie jest właścicielem, i `stop()` nie wykonuje restore'u —
alt-screen przeżywa rebuild WM-a aż do `Screen.dispose()`.

### Event API (`P0-12`)

```typescript
class Screen extends Window {
  on(event: 'resize', listener: (size: TerminalSize) => void): this;
  on(event: 'frame',  listener: (stats: ScreenFrameStats) => void): this;
  off(event: 'resize', listener: (size: TerminalSize) => void): this;
  off(event: 'frame',  listener: (stats: ScreenFrameStats) => void): this;

  resize(width?: number, height?: number): TerminalSize;
}

interface ScreenFrameStats { ms: number; }
```

* SIGWINCH → `Screen.resize()` (bez argumentów) → pobiera nowy
  `process.stdout.columns/rows`, resetuje regiony przez `Window.setSize`,
  wywołuje `reflowChildren` (już istniejące, prywatne API), emituje
  `'resize'` z nowym `TerminalSize`.
* `render()` mierzy czas wall-clock i emituje `'frame'` z `{ ms }`.
* `resize(width, height)` jawnie pozwala napędzić zmianę rozmiaru w testach
  i poza-TTY.

`Window.setSize(width, height)` jest nowym publicznym API — implementacją
istniejącej, prywatnej do tej pory `resizeRegions`. Pozwala dowolnemu
oknowi (nie tylko Screen-owi) zostać zresetowanym do podanych wymiarów,
co reflowuje dzieci procentowe.

## Cykl życia + interakcja z WindowManager

```
new Screen({ altScreen: true, hideCursor: true })
   ├─ stdout.write '\x1b[?1049h' '\x1b[?25l'
   ├─ process.on('SIGWINCH', …)   ← P0-12
   └─ process.on('exit', …)        ← cleanup ostatniej szansy

new WindowManager(screen).run()
   ├─ screen.isAltScreenActive() → true → ownsAltScreen = false
   ├─ screen.isCursorHidden()    → true → ownsCursor    = false
   └─ stdout.write mouse seqs (jeżeli mouse: true)

— praca aplikacji —

SIGWINCH → screen.resize() → emit 'resize'
render() → emit 'frame' { ms }

WindowManager.stop()
   ├─ stdout.write mouse seqs (off)
   ├─ ownsCursor    === false → nic
   └─ ownsAltScreen === false → nic

screen.dispose()
   ├─ showHardwareCursor() → \x1b[?25h
   ├─ exitAltScreen()       → \x1b[?1049l
   └─ off SIGWINCH + exit
```

W demie wystarcza wywołać `screen.dispose()` w `onExit` `WindowManager`-a;
`process.on('exit')` jest zabezpieczeniem na ścieżkę `process.exit()` lub
naturalny end-of-loop, gdzie aplikacja sama nie odpaliła `dispose`.

## Listener cap dla testów

Każdy `Screen` instaluje 2 listenery procesu (`SIGWINCH`, `exit`). Domyślny
limit Node-a to 10 — przy suite-ach testowych z wieloma `new Screen()` emit
`MaxListenersExceededWarning`. `Screen` trzyma statyczny licznik aktywnych
instancji i bumpuje `process.setMaxListeners(10 + n*2)` gdy trzeba; `dispose()`
licznik dekrementuje. Dla aplikacji z jedną Screen-instancją zachowanie jest
identyczne jak przed 0.19.0.

## Aktualizacje demo (`src/demo.mts`)

* `new Screen({ altScreen: true, hideCursor: true })` zastąpiło setup-owy
  `new Screen()`.
* `screen.on('resize', …)` przerysowuje status bar (etykieta `${width}×${height}`)
  i robi pełny `screen.render()` — dzieci procentowe są reflowowane same.
* `screen.dispose()` w `onExit` callbacku WindowManager-a.

## Backwards compatibility

* **Domyślny konstruktor** `new Screen()` — żadnych escape'ów, zero zmian
  w stosunku do 0.18.0. Cały istniejący kod oparty o `WindowManager.run/stop`
  działa bez modyfikacji.
* `WindowManager.run/stop` nadal toggluje alt-screen i cursor jeżeli `Screen`
  tego nie zrobił — ścieżka API jest zachowana.
* `Window.resizeRegions` zmienione z `private` na `protected` (rozszerzony
  scope, wcześniej dostępne nie było — bezpieczne).
* `Window.setSize(w, h)` nowe publiczne API; nie koliduje z istniejącymi
  metodami.

## Testy

`tests/Screen.test.mts` — nowy describe-block "ScreenOptions" pokrywa:

* `new Screen()` bez opcji nie pisze do stdout.
* `altScreen: true` emituje `\x1b[?1049h`; `hideCursor: true` emituje
  `\x1b[?25l`.
* `dispose()` przywraca oba i jest idempotentne.
* `getTargetFps()` zwraca przekazaną wartość.

Nowy describe-block "resize()" pokrywa:

* `resize(width, height)` aktualizuje `getSize()`.
* Listener `'resize'` dostaje nowy `TerminalSize`.
* Dzieci `Pct(50, 50)` są reflowowane do nowych wymiarów.

`render()` describe pokrywa nowy event `'frame'` (`ms` jest liczbą ≥ 0).

`tests/WindowManager.test.mts` — nowy describe "lifecycle":

* `WindowManager.run` na `Screen` z już aktywnym alt-screenem nie
  pisze drugi raz `\x1b[?1049h`/`\x1b[?25l`, a `stop()` nie pisze
  `\x1b[?1049l`/`\x1b[?25h` — alt-screen owned by Screen survives stop.

Cała suita: 499 testów (498 → 499), wszystkie zielone, MaxListeners-warningi
zniknęły dzięki dynamicznemu cap-owi.

## Pliki zmienione

* `src/Screen/types.mts` — dopisane `ScreenOptions`, `ScreenFrameStats`.
* `src/Screen/Screen.mts` — pełna przebudowa: extends EventEmitter (composed),
  alt-screen / cursor helpery, `resize()`, `dispose()`, signal handlery,
  override `render()` z `'frame'` eventem.
* `src/Screen/Window.mts` — `resizeRegions` zmienione z `private` na
  `protected`; nowy publiczny `setSize`.
* `src/Screen/WindowManager.mts` — `run`/`stop` używa `screen.enter…/exit…`
  zamiast wprost stdout, tracking ownership przez `ownsAltScreen` / `ownsCursor`.
* `src/index.mts` — eksport typów `ScreenOptions`, `ScreenFrameStats`.
* `src/demo.mts` — `new Screen({ altScreen, hideCursor })`, `screen.on('resize')`,
  `screen.dispose()` w `onExit`, status bar wydzielony jako `redrawStatusBar()`.
* `tests/Screen.test.mts` — nowe testy ScreenOptions / resize / frame +
  `afterEach(dispose)`.
* `tests/WindowManager.test.mts` — nowy lifecycle test + `afterEach(dispose)`.
* `package.json` / `CHANGELOG.md` / `CLAUDE.md` — bump i progres tablicy.
