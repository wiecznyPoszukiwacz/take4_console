# P0-5 — WindowManager.pause() / resume()

> Dostarczone w `take4-console` 0.23.0 (2026-04-16).
> Zadanie z
> [`take4-console-backlog.md`](./take4-console-backlog.md#p0-5-windowmanagerpause--resume--m).

## Cel

Użytkownicy rpcoon-a chcą odpalać edytor (`$EDITOR`), otwierać inspektor
payload-u przez `less`, albo wstawiać interaktywny `read` — wszystkie te
scenariusze wymagają *tymczasowego* zwolnienia kontroli nad terminalem:

* wyjście z raw mode (inaczej edytor dostaje rozerwany input);
* wyłączenie mouse tracking (inaczej edytor widzi śmieciowe sekwencje SGR);
* pokazanie kursora (inaczej edytor nie wie, gdzie kursor stoi);
* opcjonalne wyjście z alt-screen buffer (inaczej wyjście z edytora nie jest
  widoczne — piszemy w niewidocznym buforze).

Do 0.22.0 jedyną opcją było `wm.stop()` + `wm.run()`, które niszczyło
skupienie, rejestracje i stack dialogów, wymuszając pełen rebuild. P0-5
dokłada parę `pause()` / `resume()`, które zachowują całe state WindowManager-a
i tylko zwalniają / przywracają zasoby terminala.

## API

```typescript
class WindowManager {
  pause(options?: { leaveAltScreen?: boolean }): void;
  resume(options?: { rerender?: boolean }): void;
  isPaused(): boolean;
}
```

* `pause()` — no-op jeśli WM nie jest `running` albo już jest pauzowane.
  * Detach stdin 'data' listenera, raw mode off, `stdin.pause()`.
  * Wyłącza mouse tracking jeżeli był włączony (`\x1b[?1006l\x1b[?1000l`).
  * Jeżeli kursor był ukryty (`screen.isCursorHidden()`) — pokazuje go;
    zapamiętuje intencję, żeby `resume()` mógł ukryć go z powrotem.
  * Jeżeli `options.leaveAltScreen === true` i alt-screen aktywny —
    wychodzi z niego, zapamiętując intencję dla `resume()`.
* `resume()` — no-op jeśli WM nie jest pauzowane.
  * Re-enter alt-screen jeżeli pause go zamknął.
  * Re-enable mouse jeżeli był włączony.
  * Re-hide kursor jeżeli pause go pokazał.
  * Raw mode on, `stdin.resume()`, re-attach stdin 'data' listener.
  * Woła `renderFrame()` chyba że `{ rerender: false }` — opcjonalnie
    (np. w testach) pomijamy repaint.
* `isPaused()` — zwraca `true` pomiędzy `pause()` a `resume()`.

## Semantyka vs. stop/run

| Operacja | stdin / raw mode | Alt-screen | Cursor | Focus / registrations | Listenery signalowe |
| -------- | ---------------- | ---------- | ------ | --------------------- | ------------------- |
| `stop()` | detach | exit (jeśli owns) | show (jeśli owns) | zachowane, ale brak ponownego dispatchu | off SIGTERM |
| `run()` po `stop()` | re-attach | enter (jeśli `!active`) | hide (jeśli `!hidden`) | zachowane, initializeFocus() | re-on SIGTERM |
| `pause()` | detach | exit (tylko jeśli `leaveAltScreen: true`) | show (jeśli ukryty) | zachowane | **zachowane** (SIGTERM nadal aktywny) |
| `resume()` | re-attach | enter (jeśli pause zamknął) | hide (jeśli pause pokazał) | zachowane | bez zmian |

Kluczowa różnica: `pause` nie odpięła listenera SIGTERM, bo kolejny signal
może przyjść w trakcie pauzy — WM dalej ma powinność zareagować (wołając
`stop()`). `pause` też nie woła `onExit`.

## `stop()` po `pause()`

`stop()` musi wiedzieć, co pause już zrobiła, żeby nie odpinać listenera
drugi raz (Node rzuca wtedy `TypeError`) ani nie wysyłać ponownie
sekwencji off mouse/raw. Implementacja:

```typescript
public stop(): void {
  const wasRunning = this.running;
  const wasPaused  = this.paused;
  this.running     = false;
  this.paused      = false;

  if (wasRunning) {
    if (!wasPaused) {
      // stdin + mouse teardown tylko jeżeli pause ich nie zrobił
      process.stdin.off('data', this.boundHandleInput);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      if (this.mouseEnabled) process.stdout.write('\x1b[?1006l\x1b[?1000l');
    }
    process.off('SIGTERM', this.boundSigterm);

    if (this.ownsCursor)    { this.screen.showHardwareCursor(); this.ownsCursor = false; }
    if (this.ownsAltScreen) { this.screen.exitAltScreen();       this.ownsAltScreen = false; }
    this.pauseRestoreAltScreen = this.pauseRestoreCursorHidden = false;
  }
  this.onExit?.();
}
```

`screen.exitAltScreen` i `showHardwareCursor` są idempotentne (sprawdzają
flagę state), więc nawet gdy pause wcześniej je zmieniła, wywołanie w stop
jest bezpieczne.

## Współpraca ze `ScreenOptions`

Gdy `Screen({ altScreen: true, hideCursor: true })` sam posiada alt-screen
i ukryty kursor (P0-11), `WindowManager.run` zapamiętuje `ownsAltScreen =
false` / `ownsCursor = false`. W takim wypadku:

* `pause({ leaveAltScreen: true })` nadal zamyka alt-screen (mimo że Screen
  go „posiadał" — pauza tymczasowo oddaje terminal).
* `resume()` re-enter-uje alt-screen (bo `pauseRestoreAltScreen === true`).
* `pause()` pokazuje kursor, `resume()` ukrywa go z powrotem — niezależnie
  od tego, kto go ukrył w pierwszej kolejności.

Po `stop()` flagi `ownership` Screen-a nadal prowadzą do ostatecznego
cleanup-u (czyli nie — bo Screen-owe state przetrwa w `dispose()`); WM
tylko zwalnia rzeczy, które sam przejął.

## Aktualizacje demo

`src/demo.mts`:

```typescript
import { spawnSync } from 'node:child_process';

wm.bindKey('ctrl+e', () => {
  wm.pause({ leaveAltScreen: true });
  process.stdout.write('\n--- paused take4_console TUI. Press Enter to return ---\n');
  spawnSync('bash', ['-c', 'read -r _'], { stdio: 'inherit' });
  wm.resume();
  return true;
});
```

`Ctrl+E` oddaje terminal z powrotem do primary screen buffer, drukuje
prompt i blokuje na `read -r` w podpowłoce — do ponownego przejęcia
kontroli wystarczy Enter. `resume()` wraca do alt-screen, ukrywa kursor,
ponownie włącza mouse tracking i re-renderuje aktualną klatkę. Cały stan
(focus, helpMode, rolling chart history) jest nietknięty.

Status bar zyskał literę `Ctrl+E` w obu trybach (help / normal).

## Testy

`tests/WindowManager.test.mts` — nowy describe „P0-5 pause / resume":

* `pause()` detaches listener + wysyła `\x1b[?25h`; nie wysyła
  `\x1b[?1049l` domyślnie.
* `pause({ leaveAltScreen: true })` wysyła `\x1b[?1049l`;
  `resume()` → `\x1b[?1049h`; `screen.isAltScreenActive()` tracked poprawnie.
* Pauza zachowuje focus (`getFocused()` przed i po pause === ten sam
  control) + cykl Tab po resume kontynuuje z zapamiętanego indexu.
* `resume()` wywołuje `screen.render()` domyślnie, `resume({ rerender:
  false })` pomija.
* `pause() / resume()` są idempotentne.
* `stop()` po `pause()` nie wywołuje ponownie `stdin.off('data', …)`.

Cała suita: 551 testów (545 → 551), wszystkie zielone, `npx tsc --noEmit`
czysto.

## Backwards compatibility

* Nowe metody publiczne — zero zmian w istniejących API.
* `stop()` zyskuje rozpoznanie stanu pauzy; w ścieżce bez pauzy (wszystko
  dotychczasowe zachowanie) ścieżka kodu jest identyczna jak w 0.22.0.
* Signature `WindowManagerOptions` bez zmian.

## Pliki zmienione

* `src/Screen/WindowManager.mts` — `paused`, `pauseRestoreAltScreen`,
  `pauseRestoreCursorHidden` + nowe metody `pause/resume/isPaused`;
  `stop()` uwzględnia stan pauzy.
* `src/demo.mts` — `bindKey('ctrl+e')` + status bar literki.
* `tests/WindowManager.test.mts` — describe „P0-5 pause / resume"
  (6 testów).
* `package.json`, `CHANGELOG.md`, `CLAUDE.md` — bump do 0.23.0 + progres
  tablicy backlog.
