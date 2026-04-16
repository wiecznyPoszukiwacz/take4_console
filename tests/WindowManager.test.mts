import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WindowManager } from '../src/Screen/WindowManager.mjs';
import { Screen } from '../src/Screen/Screen.mjs';
import { Window } from '../src/Screen/Window.mjs';
import { Button } from '../src/Screen/controls/Button.mjs';
import { Checkbox } from '../src/Screen/controls/Checkbox.mjs';
import { Radio } from '../src/Screen/controls/Radio.mjs';
import { TextBox } from '../src/Screen/controls/TextBox.mjs';
import { TextArea } from '../src/Screen/controls/TextArea.mjs';
import { Pos } from '../src/Screen/Pos.mjs';
import { Size } from '../src/Screen/Size.mjs';
import type { KeyContext } from '../src/Screen/types.mjs';

// Stub render so tests don't hit process.stdout.
vi.spyOn(Screen.prototype, 'render').mockImplementation(() => {});

/** Helper: press a key through the WindowManager's raw input handler. */
const press = (wm: WindowManager, key: string) =>
	wm.handleInput(Buffer.from(key, 'utf8'));

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeScreen(): Screen {
	return new Screen();
}

function makeButton(label = 'OK'): Button {
	return new Button({ pos: new Pos(0, 0), size: new Size(10, 3), label });
}

function makeCheckbox(label = 'opt', checked = false): Checkbox {
	return new Checkbox({ pos: new Pos(0, 0), label }, { checked });
}

function makeRadio(label = 'opt', checked = false): Radio {
	return new Radio({ pos: new Pos(0, 0), label }, { checked });
}

function makeTextBox(value = ''): TextBox {
	return new TextBox({ pos: new Pos(0, 0), size: new Size(20, 3) }, { value });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WindowManager', () => {
	let screen: Screen;
	let wm: WindowManager;

	beforeEach(() => {
		screen = makeScreen();
		wm     = new WindowManager(screen);
	});

	afterEach(() => {
		screen.dispose();
	});

	// ── Lifecycle (P0-11 integration) ─────────────────────────────────────────

	describe('lifecycle', () => {
		// Stop / start cycle drives the alternate screen + cursor toggles. We
		// patch process.stdin so run() doesn't actually take over the terminal,
		// and capture stdout writes to inspect what escape sequences were sent.
		const stubStdin = (): { restore: () => void } => {
			const onSpy     = vi.spyOn(process.stdin, 'on').mockReturnValue(process.stdin);
			const offSpy    = vi.spyOn(process.stdin, 'off').mockReturnValue(process.stdin);
			const resumeSpy = vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
			const pauseSpy  = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
			return {
				restore: () => {
					onSpy.mockRestore();
					offSpy.mockRestore();
					resumeSpy.mockRestore();
					pauseSpy.mockRestore();
				},
			};
		};

		it('does not re-enter alt-screen when Screen already owns it', () => {
			const altScreen = makeScreen();
			const writeSpy  = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			altScreen.enterAltScreen();
			altScreen.hideHardwareCursor();
			writeSpy.mockClear();

			const stdin = stubStdin();
			const localWm = new WindowManager(altScreen);
			localWm.run();
			const writes = writeSpy.mock.calls.map(c => c[0]).join('');
			// Neither the alt-screen enter nor the cursor-hide sequence should
			// be emitted again: Screen already toggled them and tracks state.
			expect(writes.includes('\x1b[?1049h')).toBe(false);
			expect(writes.includes('\x1b[?25l')).toBe(false);

			localWm.stop();
			const stopWrites = writeSpy.mock.calls.map(c => c[0]).join('');
			// stop() must not undo what Screen owned — those toggles outlive
			// stop() until Screen.dispose() is called.
			expect(stopWrites.includes('\x1b[?1049l')).toBe(false);
			expect(stopWrites.includes('\x1b[?25h')).toBe(false);

			stdin.restore();
			altScreen.dispose();
			writeSpy.mockRestore();
		});
	});

	// ── register / getFocused ─────────────────────────────────────────────────

	describe('register()', () => {
		it('first registered control receives focus on handleInput', () => {
			const btn = makeButton();
			screen.addChild(btn);
			wm.register(btn);
			// Trigger focus initialization via a no-op key (not a registered exit key).
			press(wm, 'x');
			expect(wm.getFocused()).toBe(btn);
		});

		it('disabled control is skipped during auto-focus', () => {
			const disabled = new Button({ pos: new Pos(0, 0), size: new Size(10, 3), disabled: true });
			const enabled  = makeButton('B');
			screen.addChild(disabled);
			screen.addChild(enabled);
			wm.register(disabled);
			wm.register(enabled);
			press(wm, 'x');
			expect(wm.getFocused()).toBe(enabled);
		});

		it('returns null when no controls are registered', () => {
			expect(wm.getFocused()).toBeNull();
		});
	});

	// ── Tab / Shift-Tab focus cycling ─────────────────────────────────────────

	describe('Tab focus cycling', () => {
		it('Tab moves focus to the next control', () => {
			const a = makeButton('A');
			const b = makeButton('B');
			screen.addChild(a);
			screen.addChild(b);
			wm.register(a);
			wm.register(b);
			press(wm, '\t');
			expect(wm.getFocused()).toBe(a);
			press(wm, '\t');
			expect(wm.getFocused()).toBe(b);
		});

		it('Tab wraps around to first control', () => {
			const a = makeButton('A');
			const b = makeButton('B');
			screen.addChild(a);
			screen.addChild(b);
			wm.register(a);
			wm.register(b);
			press(wm, '\t'); // → a
			press(wm, '\t'); // → b
			press(wm, '\t'); // → a (wrap)
			expect(wm.getFocused()).toBe(a);
		});

		it('Shift-Tab moves focus to the previous control', () => {
			const a = makeButton('A');
			const b = makeButton('B');
			screen.addChild(a);
			screen.addChild(b);
			wm.register(a);
			wm.register(b);
			press(wm, '\t');      // → a
			press(wm, '\t');      // → b
			press(wm, '\x1b[Z'); // Shift-Tab → a
			expect(wm.getFocused()).toBe(a);
		});

		it('focused control with capturesTab() receives Tab via handleKey (P0-6)', () => {
			const ta = new TextArea({ pos: new Pos(0, 0), size: new Size(20, 6) }, { insertTabAsSpaces: 2 });
			const b  = makeButton('B');
			screen.addChild(ta);
			screen.addChild(b);
			wm.register(ta);
			wm.register(b);
			wm.setFocus(ta);
			press(wm, '\t');
			expect(wm.getFocused()).toBe(ta);     // focus did NOT cycle away
			expect(ta.getValue()).toBe('  ');     // Tab inserted spaces
		});

		it('Shift-Tab cycles focus even when capturesTab() is true', () => {
			const ta = new TextArea({ pos: new Pos(0, 0), size: new Size(20, 6) }, { insertTabAsSpaces: 2 });
			const b  = makeButton('B');
			screen.addChild(ta);
			screen.addChild(b);
			wm.register(ta);
			wm.register(b);
			wm.setFocus(ta);
			press(wm, '\x1b[Z'); // Shift-Tab
			expect(wm.getFocused()).toBe(b);
		});

		it('Tab skips disabled controls', () => {
			const a        = makeButton('A');
			const disabled = new Button({ pos: new Pos(0, 0), size: new Size(10, 3), disabled: true });
			const b        = makeButton('B');
			screen.addChild(a);
			screen.addChild(disabled);
			screen.addChild(b);
			wm.register(a);
			wm.register(disabled);
			wm.register(b);
			press(wm, '\t'); // → a
			press(wm, '\t'); // → b (skip disabled)
			expect(wm.getFocused()).toBe(b);
		});

		it('P0-8: Tab skips hidden controls', () => {
			const a      = makeButton('A');
			const hidden = makeButton('H');
			const b      = makeButton('B');
			hidden.setVisible(false);
			screen.addChild(a);
			screen.addChild(hidden);
			screen.addChild(b);
			wm.register(a);
			wm.register(hidden);
			wm.register(b);
			press(wm, '\t'); // → a
			press(wm, '\t'); // → b (skip hidden)
			expect(wm.getFocused()).toBe(b);
		});

		it('P0-8: setFocus ignores a hidden control', () => {
			const a      = makeButton('A');
			const hidden = makeButton('H');
			hidden.setVisible(false);
			screen.addChild(a);
			screen.addChild(hidden);
			wm.register(a);
			wm.register(hidden);
			wm.setFocus(a);
			wm.setFocus(hidden);
			expect(wm.getFocused()).toBe(a);
		});
	});

	// ── setFocus ──────────────────────────────────────────────────────────────

	describe('setFocus()', () => {
		it('moves focus to a specific control', () => {
			const a = makeButton('A');
			const b = makeButton('B');
			screen.addChild(a);
			screen.addChild(b);
			wm.register(a);
			wm.register(b);
			wm.setFocus(b);
			expect(wm.getFocused()).toBe(b);
			expect(a.isFocused()).toBe(false);
			expect(b.isFocused()).toBe(true);
		});

		it('ignores setFocus on a disabled control', () => {
			const a        = makeButton('A');
			const disabled = new Button({ pos: new Pos(0, 0), size: new Size(10, 3), disabled: true });
			screen.addChild(a);
			screen.addChild(disabled);
			wm.register(a);
			wm.register(disabled);
			wm.setFocus(a);
			wm.setFocus(disabled);
			expect(wm.getFocused()).toBe(a);
		});
	});

	// ── Key dispatch ──────────────────────────────────────────────────────────

	describe('key dispatch', () => {
		it('dispatches printable characters to focused TextBox', () => {
			const tb = makeTextBox('');
			screen.addChild(tb);
			wm.register(tb);
			wm.setFocus(tb);
			press(wm, 'H');
			press(wm, 'i');
			expect(tb.getValue()).toBe('Hi');
		});

		it('dispatches backspace to focused TextBox', () => {
			const tb = makeTextBox('abc');
			screen.addChild(tb);
			wm.register(tb);
			wm.setFocus(tb);
			press(wm, '\x7f'); // backspace
			expect(tb.getValue()).toBe('ab');
		});

		it('Space toggles Checkbox', () => {
			const cb = makeCheckbox('test', false);
			screen.addChild(cb);
			wm.register(cb);
			wm.setFocus(cb);
			press(wm, ' ');
			expect(cb.isChecked()).toBe(true);
			press(wm, ' ');
			expect(cb.isChecked()).toBe(false);
		});

		it('Space selects Radio', () => {
			const r = makeRadio('opt', false);
			screen.addChild(r);
			wm.register(r);
			wm.setFocus(r);
			press(wm, ' ');
			expect(r.isChecked()).toBe(true);
		});

		it('Enter triggers Button onPress callback', () => {
			const onPress = vi.fn();
			const btn = new Button({ pos: new Pos(0, 0), size: new Size(10, 3) }, { onPress });
			screen.addChild(btn);
			wm.register(btn);
			wm.setFocus(btn);
			press(wm, '\r');
			expect(onPress).toHaveBeenCalledOnce();
		});
	});

	// ── Exit keys ─────────────────────────────────────────────────────────────

	describe('exit keys', () => {
		it('Ctrl+C (default exit key) calls stop()', () => {
			const stopSpy = vi.spyOn(wm, 'stop');
			press(wm, '\x03');
			expect(stopSpy).toHaveBeenCalledOnce();
		});

		it('custom exit key triggers stop()', () => {
			const onExit = vi.fn();
			const wmQ    = new WindowManager(screen, { exitKeys: ['q'], onExit });
			press(wmQ, 'q');
			expect(onExit).toHaveBeenCalledOnce();
		});

		it('non-exit key does not stop the manager', () => {
			const stopSpy = vi.spyOn(wm, 'stop');
			press(wm, 'a');
			expect(stopSpy).not.toHaveBeenCalled();
		});
	});

	// ── onKey callback ────────────────────────────────────────────────────────

	describe('onKey callback', () => {
		it('fires for every key before dispatch', () => {
			const onKey = vi.fn();
			const tb    = makeTextBox('');
			screen.addChild(tb);
			const wmCb  = new WindowManager(screen, { onKey });
			wmCb.register(tb);
			wmCb.setFocus(tb);
			press(wmCb, 'x');
			// onKey receives the key and a KeyContext object.
			expect(onKey).toHaveBeenCalledWith('x', expect.objectContaining({
				focusedControl: tb,
				inDialog:       false,
				dialogDepth:    0,
			}));
		});

		it('returning true from onKey consumes the event (no dispatch)', () => {
			const tb   = makeTextBox('');
			screen.addChild(tb);
			const wmCb = new WindowManager(screen, {
				onKey: () => true, // preventDefault
			});
			wmCb.register(tb);
			wmCb.setFocus(tb);
			press(wmCb, 'x');
			// The TextBox must not receive the key when onKey returned true.
			expect(tb.getValue()).toBe('');
		});

		it('returning true from onKey blocks exit keys too', () => {
			const onExit = vi.fn();
			const wmCb   = new WindowManager(screen, {
				exitKeys: ['q'],
				onExit,
				onKey: (key) => key === 'q', // intercept q
			});
			press(wmCb, 'q');
			expect(onExit).not.toHaveBeenCalled();
		});

		it('returning false / void keeps the pass-through behaviour', () => {
			const tb   = makeTextBox('');
			screen.addChild(tb);
			const wmCb = new WindowManager(screen, { onKey: () => undefined });
			wmCb.register(tb);
			wmCb.setFocus(tb);
			press(wmCb, 'y');
			expect(tb.getValue()).toBe('y');
		});

		it('KeyContext reports dialog depth and focused control inside a dialog', () => {
			const dialog = new Window({ pos: new Pos(0, 0), size: new Size(20, 5) });
			const dBtn   = makeButton('Dlg');
			screen.addChild(dialog);
			dialog.addChild(dBtn);

			let captured: KeyContext | null = null;
			const wmCb = new WindowManager(screen, {
				onKey: (_k, ctx) => { captured = ctx; },
			});
			wmCb.openDialog(dialog, [{ control: dBtn }]);
			press(wmCb, 'x');
			expect(captured).toEqual({
				focusedControl: dBtn,
				inDialog:       true,
				dialogDepth:    1,
			});
		});
	});

	// ── bindKey / unbindKey ───────────────────────────────────────────────────

	describe('bindKey() / unbindKey()', () => {
		it('fires the handler when the bound key is pressed', () => {
			const handler = vi.fn(() => true);
			wm.bindKey('?', handler);
			press(wm, '?');
			expect(handler).toHaveBeenCalledOnce();
		});

		it('returning true consumes the event (no dispatch to focused control)', () => {
			const tb = makeTextBox('');
			screen.addChild(tb);
			wm.register(tb);
			wm.setFocus(tb);
			wm.bindKey('a', () => true);
			press(wm, 'a');
			expect(tb.getValue()).toBe('');
		});

		it('returning false / void lets the key continue to dispatch', () => {
			const tb      = makeTextBox('');
			const handler = vi.fn(() => undefined);
			screen.addChild(tb);
			wm.register(tb);
			wm.setFocus(tb);
			wm.bindKey('a', handler);
			press(wm, 'a');
			expect(handler).toHaveBeenCalledOnce();
			expect(tb.getValue()).toBe('a');
		});

		it('multiple handlers fire in insertion order until one consumes', () => {
			const order: number[] = [];
			wm.bindKey('x', () => { order.push(1); });          // non-consuming
			wm.bindKey('x', () => { order.push(2); return true; });
			wm.bindKey('x', () => { order.push(3); });          // never runs
			press(wm, 'x');
			expect(order).toEqual([1, 2]);
		});

		it('accepts friendly key names (enter, space, ctrl+s)', () => {
			const onEnter = vi.fn(() => true);
			const onCtrlS = vi.fn(() => true);
			wm.bindKey('enter',  onEnter);
			wm.bindKey('ctrl+s', onCtrlS);
			press(wm, '\r');
			press(wm, '\x13'); // Ctrl+S
			expect(onEnter).toHaveBeenCalledOnce();
			expect(onCtrlS).toHaveBeenCalledOnce();
		});

		it('unbind returned from bindKey removes the handler', () => {
			const handler = vi.fn(() => true);
			const off     = wm.bindKey('?', handler);
			off();
			press(wm, '?');
			expect(handler).not.toHaveBeenCalled();
		});

		it('unbindKey(spec) removes all handlers for that key', () => {
			const a = vi.fn();
			const b = vi.fn();
			wm.bindKey('?', a);
			wm.bindKey('?', b);
			expect(wm.unbindKey('?')).toBe(true);
			press(wm, '?');
			expect(a).not.toHaveBeenCalled();
			expect(b).not.toHaveBeenCalled();
		});

		it('unbindKey returns false when no matching handler exists', () => {
			expect(wm.unbindKey('?')).toBe(false);
			expect(wm.unbindKey('?', () => {})).toBe(false);
		});

		it('bindKey fires before exit keys (handler can intercept q)', () => {
			const onExit = vi.fn();
			const wmQ    = new WindowManager(screen, { exitKeys: ['q'], onExit });
			wmQ.bindKey('q', () => true);
			press(wmQ, 'q');
			expect(onExit).not.toHaveBeenCalled();
		});

		it('bindKey handlers receive a KeyContext with the focused control', () => {
			const btn = makeButton('A');
			screen.addChild(btn);
			wm.register(btn);
			wm.setFocus(btn);
			let seen: KeyContext | null = null;
			wm.bindKey('?', (ctx) => { seen = ctx; return true; });
			press(wm, '?');
			expect(seen).toEqual({
				focusedControl: btn,
				inDialog:       false,
				dialogDepth:    0,
			});
		});
	});

	// ── Dialog ────────────────────────────────────────────────────────────────

	describe('openDialog() / closeDialog()', () => {
		it('captures focus inside the dialog', () => {
			const main   = makeButton('Main');
			const dialog = new Window({ pos: new Pos(0, 0), size: new Size(20, 5) });
			const dBtn   = makeButton('DlgBtn');

			screen.addChild(main);
			wm.register(main);
			wm.setFocus(main);

			screen.addChild(dialog);
			dialog.addChild(dBtn);

			wm.openDialog(dialog, [{ control: dBtn }]);
			expect(wm.getFocused()).toBe(dBtn);
			expect(main.isFocused()).toBe(false);
		});

		it('restores focus to main context after closeDialog()', () => {
			const main   = makeButton('Main');
			const dialog = new Window({ pos: new Pos(0, 0), size: new Size(20, 5) });
			const dBtn   = makeButton('DlgBtn');

			screen.addChild(main);
			wm.register(main);
			wm.setFocus(main);

			screen.addChild(dialog);
			dialog.addChild(dBtn);

			wm.openDialog(dialog, [{ control: dBtn }]);
			wm.closeDialog();

			expect(wm.getFocused()).toBe(main);
			expect(main.isFocused()).toBe(true);
		});

		it('Tab cycles only within dialog controls', () => {
			const main   = makeButton('Main');
			const dialog = new Window({ pos: new Pos(0, 0), size: new Size(30, 5) });
			const dA     = makeButton('A');
			const dB     = makeButton('B');

			screen.addChild(main);
			wm.register(main);

			screen.addChild(dialog);
			dialog.addChild(dA);
			dialog.addChild(dB);

			wm.openDialog(dialog, [{ control: dA }, { control: dB }]);
			expect(wm.getFocused()).toBe(dA);
			press(wm, '\t');
			expect(wm.getFocused()).toBe(dB);
			press(wm, '\t');
			expect(wm.getFocused()).toBe(dA); // wraps, does NOT reach main
			expect(main.isFocused()).toBe(false);
		});
	});

	// ── Button.handleKey ──────────────────────────────────────────────────────

	describe('Button.handleKey()', () => {
		it('fires onPress on Enter', () => {
			const onPress = vi.fn();
			const btn     = new Button({ pos: new Pos(0, 0), size: new Size(10, 3) }, { onPress });
			btn.handleKey('\r');
			expect(onPress).toHaveBeenCalledOnce();
		});

		it('fires onPress on Space', () => {
			const onPress = vi.fn();
			const btn     = new Button({ pos: new Pos(0, 0), size: new Size(10, 3) }, { onPress });
			btn.handleKey(' ');
			expect(onPress).toHaveBeenCalledOnce();
		});

		it('does not fire onPress when disabled', () => {
			const onPress = vi.fn();
			const btn     = new Button({ pos: new Pos(0, 0), size: new Size(10, 3), disabled: true }, { onPress });
			btn.handleKey('\r');
			expect(onPress).not.toHaveBeenCalled();
		});
	});

	// ── Checkbox.handleKey ────────────────────────────────────────────────────

	describe('Checkbox.handleKey()', () => {
		it('Space toggles checked state', () => {
			const cb = makeCheckbox('opt', false);
			cb.handleKey(' ');
			expect(cb.isChecked()).toBe(true);
			cb.handleKey(' ');
			expect(cb.isChecked()).toBe(false);
		});

		it('fires onChange with new state', () => {
			const onChange = vi.fn();
			const cb       = new Checkbox({ pos: new Pos(0, 0), label: 'opt' }, { onChange });
			cb.handleKey(' ');
			expect(onChange).toHaveBeenCalledWith(true);
		});

		it('does not toggle when disabled', () => {
			const cb = new Checkbox({ pos: new Pos(0, 0), label: 'opt', disabled: true });
			cb.handleKey(' ');
			expect(cb.isChecked()).toBe(false);
		});
	});

	// ── Radio.handleKey ───────────────────────────────────────────────────────

	describe('Radio.handleKey()', () => {
		it('Space selects the radio button', () => {
			const r = makeRadio('opt', false);
			r.handleKey(' ');
			expect(r.isChecked()).toBe(true);
		});

		it('fires onChange(true) on selection', () => {
			const onChange = vi.fn();
			const r        = new Radio({ pos: new Pos(0, 0), label: 'opt' }, { onChange });
			r.handleKey(' ');
			expect(onChange).toHaveBeenCalledWith(true);
		});

		it('does not select when disabled', () => {
			const r = new Radio({ pos: new Pos(0, 0), label: 'opt', disabled: true });
			r.handleKey(' ');
			expect(r.isChecked()).toBe(false);
		});
	});

	// ── Window.removeChild ────────────────────────────────────────────────────

	describe('Window.removeChild()', () => {
		it('removes a child from the window', () => {
			const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
			const child  = new Window({ pos: new Pos(0, 0), size: new Size(5, 5) });
			parent.addChild(child);
			parent.removeChild(child);
			// After removal, render should not include the child cell data.
			// Verify by rendering: no crash means child was removed.
			expect(() => parent.render()).not.toThrow();
		});

		it('is a no-op for a non-child', () => {
			const parent = new Window({ pos: new Pos(0, 0), size: new Size(20, 10) });
			const other  = new Window({ pos: new Pos(0, 0), size: new Size(5, 5) });
			expect(() => parent.removeChild(other)).not.toThrow();
		});
	});
});
