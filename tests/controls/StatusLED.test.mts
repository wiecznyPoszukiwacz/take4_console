import { describe, it, expect } from 'vitest';
import { StatusLED } from '../../src/Screen/controls/StatusLED.mjs';
import { Pos }       from '../../src/Screen/Pos.mjs';

describe('StatusLED', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to state "off"', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) });
		expect(led.getState()).toBe('off');
	});

	it('accepts initial state from options', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) }, { state: 'ok' });
		expect(led.getState()).toBe('ok');
	});

	it('setState / getState round-trip', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) });
		led.setState('warn');
		expect(led.getState()).toBe('warn');
		led.setState('error');
		expect(led.getState()).toBe('error');
	});

	it('auto-sizes width to 2 when no label', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) });
		expect(led.getSize().width).toBe(2);
	});

	it('auto-sizes width to 2 + label.length', () => {
		const led = new StatusLED({ pos: new Pos(0, 0), label: 'OK' });
		expect(led.getSize().width).toBe(4);   // 2 + 2
	});

	it('height is always 1', () => {
		const led = new StatusLED({ pos: new Pos(0, 0), label: 'hello' });
		expect(led.getSize().height).toBe(1);
	});

	it('setLabel / getLabel round-trip', () => {
		const led = new StatusLED({ pos: new Pos(0, 0), label: 'test' });
		led.setLabel('new');
		expect(led.getLabel()).toBe('new');
	});

	it('isFocused defaults to false', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) });
		expect(led.isFocused()).toBe(false);
		led.setFocused(true);
		expect(led.isFocused()).toBe(true);
	});

	it('isDisabled defaults to false', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) });
		expect(led.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('first cell char is the dot ●', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) });
		led.render();
		expect(led.getCell(0, 0).char).toBe('●');
	});

	it('dot is grey (240) in off state', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) }, { state: 'off' });
		led.render();
		expect(led.getCell(0, 0).attributes.foreground).toBe(240);
	});

	it('dot is green (76) in ok state', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) }, { state: 'ok' });
		led.render();
		expect(led.getCell(0, 0).attributes.foreground).toBe(76);
	});

	it('dot is yellow (226) in warn state', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) }, { state: 'warn' });
		led.render();
		expect(led.getCell(0, 0).attributes.foreground).toBe(226);
	});

	it('dot is red (196) in error state', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) }, { state: 'error' });
		led.render();
		expect(led.getCell(0, 0).attributes.foreground).toBe(196);
	});

	it('dot colour changes after setState + render', () => {
		const led = new StatusLED({ pos: new Pos(0, 0) }, { state: 'off' });
		led.render();
		const colorOff = led.getCell(0, 0).attributes.foreground;
		led.setState('ok');
		led.render();
		const colorOk = led.getCell(0, 0).attributes.foreground;
		expect(colorOff).not.toBe(colorOk);
	});

	it('label chars appear starting at column 2', () => {
		const led = new StatusLED({ pos: new Pos(0, 0), label: 'AB' });
		led.render();
		// column 1 = space, columns 2..3 = label
		expect(led.getCell(2, 0).char).toBe('A');
		expect(led.getCell(3, 0).char).toBe('B');
	});
});
