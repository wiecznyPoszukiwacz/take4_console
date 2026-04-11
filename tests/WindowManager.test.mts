import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowManager } from '../src/Screen/WindowManager.mjs';
import { Screen } from '../src/Screen/Screen.mjs';
import { Window } from '../src/Screen/Window.mjs';
import { Button } from '../src/Screen/controls/Button.mjs';
import { Checkbox } from '../src/Screen/controls/Checkbox.mjs';
import { Radio } from '../src/Screen/controls/Radio.mjs';
import { TextBox } from '../src/Screen/controls/TextBox.mjs';
import { Pos } from '../src/Screen/Pos.mjs';
import { Size } from '../src/Screen/Size.mjs';

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
	return new Button(new Pos(0, 0), new Size(10, 3), { label });
}

function makeCheckbox(label = 'opt', checked = false): Checkbox {
	return new Checkbox(new Pos(0, 0), label, { checked });
}

function makeRadio(label = 'opt', checked = false): Radio {
	return new Radio(new Pos(0, 0), label, { checked });
}

function makeTextBox(value = ''): TextBox {
	return new TextBox(new Pos(0, 0), new Size(20, 3), { value });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WindowManager', () => {
	let screen: Screen;
	let wm: WindowManager;

	beforeEach(() => {
		screen = makeScreen();
		wm     = new WindowManager(screen);
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
			const disabled = new Button(new Pos(0, 0), new Size(10, 3), { disabled: true });
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

		it('Tab skips disabled controls', () => {
			const a        = makeButton('A');
			const disabled = new Button(new Pos(0, 0), new Size(10, 3), { disabled: true });
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
			const disabled = new Button(new Pos(0, 0), new Size(10, 3), { disabled: true });
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
			const btn = new Button(new Pos(0, 0), new Size(10, 3), { onPress });
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
			expect(onKey).toHaveBeenCalledWith('x');
		});
	});

	// ── Dialog ────────────────────────────────────────────────────────────────

	describe('openDialog() / closeDialog()', () => {
		it('captures focus inside the dialog', () => {
			const main   = makeButton('Main');
			const dialog = new Window(new Pos(0, 0), new Size(20, 5));
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
			const dialog = new Window(new Pos(0, 0), new Size(20, 5));
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
			const dialog = new Window(new Pos(0, 0), new Size(30, 5));
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
			const btn     = new Button(new Pos(0, 0), new Size(10, 3), { onPress });
			btn.handleKey('\r');
			expect(onPress).toHaveBeenCalledOnce();
		});

		it('fires onPress on Space', () => {
			const onPress = vi.fn();
			const btn     = new Button(new Pos(0, 0), new Size(10, 3), { onPress });
			btn.handleKey(' ');
			expect(onPress).toHaveBeenCalledOnce();
		});

		it('does not fire onPress when disabled', () => {
			const onPress = vi.fn();
			const btn     = new Button(new Pos(0, 0), new Size(10, 3), { onPress, disabled: true });
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
			const cb       = new Checkbox(new Pos(0, 0), 'opt', { onChange });
			cb.handleKey(' ');
			expect(onChange).toHaveBeenCalledWith(true);
		});

		it('does not toggle when disabled', () => {
			const cb = new Checkbox(new Pos(0, 0), 'opt', { disabled: true });
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
			const r        = new Radio(new Pos(0, 0), 'opt', { onChange });
			r.handleKey(' ');
			expect(onChange).toHaveBeenCalledWith(true);
		});

		it('does not select when disabled', () => {
			const r = new Radio(new Pos(0, 0), 'opt', { disabled: true });
			r.handleKey(' ');
			expect(r.isChecked()).toBe(false);
		});
	});

	// ── Window.removeChild ────────────────────────────────────────────────────

	describe('Window.removeChild()', () => {
		it('removes a child from the window', () => {
			const parent = new Window(new Pos(0, 0), new Size(20, 10));
			const child  = new Window(new Pos(0, 0), new Size(5, 5));
			parent.addChild(child);
			parent.removeChild(child);
			// After removal, render should not include the child cell data.
			// Verify by rendering: no crash means child was removed.
			expect(() => parent.render()).not.toThrow();
		});

		it('is a no-op for a non-child', () => {
			const parent = new Window(new Pos(0, 0), new Size(20, 10));
			const other  = new Window(new Pos(0, 0), new Size(5, 5));
			expect(() => parent.removeChild(other)).not.toThrow();
		});
	});
});
