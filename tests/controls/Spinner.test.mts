import { describe, it, expect } from 'vitest';
import { Spinner } from '../../src/Screen/controls/Spinner.mjs';
import { Pos }     from '../../src/Screen/Pos.mjs';

describe('Spinner', () => {
	// ── Constructor / state ─────────────────────────────────────────────────────

	it('defaults to braille style, frame 0, running=true', () => {
		const s = new Spinner({ pos: new Pos(0, 0) });
		expect(s.getStyleName()).toBe('braille');
		expect(s.getFrame()).toBe(0);
		expect(s.isRunning()).toBe(true);
		expect(s.getLabel()).toBe('');
	});

	it('accepts initial style, frame, running, label', () => {
		const s = new Spinner({ pos: new Pos(0, 0), label: 'Loading' }, { style: 'line', frame: 2, running: false });
		expect(s.getStyleName()).toBe('line');
		expect(s.getFrame()).toBe(2);
		expect(s.isRunning()).toBe(false);
		expect(s.getLabel()).toBe('Loading');
	});

	it('wraps the initial frame into range', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line', frame: 10 }); // line has 4 frames
		expect(s.getFrame()).toBe(2);
	});

	// ── Sizing ──────────────────────────────────────────────────────────────────

	it('auto-sizes width to glyph width when no label', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line' });
		expect(s.getSize().width).toBe(1);
	});

	it('auto-sizes width to glyph + space + label', () => {
		const s = new Spinner({ pos: new Pos(0, 0), label: 'Go' }, { style: 'line' });
		expect(s.getSize().width).toBe(1 + 1 + 2);
	});

	it('dots style uses 3-wide frames', () => {
		const s = new Spinner({ pos: new Pos(0, 0), label: 'wait' }, { style: 'dots' });
		expect(s.getSize().width).toBe(3 + 1 + 4);
	});

	it('height is always 1', () => {
		const s = new Spinner({ pos: new Pos(0, 0), label: 'hello' });
		expect(s.getSize().height).toBe(1);
	});

	// ── step / setFrame ────────────────────────────────────────────────────────

	it('step advances frame by 1', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line' });
		s.step();
		expect(s.getFrame()).toBe(1);
	});

	it('step wraps at the end of the cycle', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line', frame: 3 });
		s.step();
		expect(s.getFrame()).toBe(0);
	});

	it('step is a no-op when stopped', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line', running: false });
		s.step();
		expect(s.getFrame()).toBe(0);
	});

	it('stop pauses, start resumes', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line' });
		s.stop();
		s.step();
		expect(s.getFrame()).toBe(0);
		s.start();
		s.step();
		expect(s.getFrame()).toBe(1);
	});

	it('setFrame wraps negative values', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line' });
		s.setFrame(-1);
		expect(s.getFrame()).toBe(3);
	});

	// ── Focus / disabled ────────────────────────────────────────────────────────

	it('isFocused defaults to false', () => {
		const s = new Spinner({ pos: new Pos(0, 0) });
		expect(s.isFocused()).toBe(false);
		s.setFocused(true);
		expect(s.isFocused()).toBe(true);
	});

	it('isDisabled defaults to false', () => {
		const s = new Spinner({ pos: new Pos(0, 0) });
		expect(s.isDisabled()).toBe(false);
	});

	// ── render() ───────────────────────────────────────────────────────────────

	it('first cell contains the current frame glyph', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line' });
		s.render();
		expect(s.getCell(0, 0).char).toBe('|');
		s.step();
		s.render();
		expect(s.getCell(0, 0).char).toBe('/');
	});

	it('glyph uses the requested color', () => {
		const s = new Spinner({ pos: new Pos(0, 0) }, { style: 'line', color: 196 });
		s.render();
		expect(s.getCell(0, 0).attributes.foreground).toBe(196);
	});

	it('label is drawn starting at column glyphWidth + 1', () => {
		const s = new Spinner({ pos: new Pos(0, 0), label: 'Go' }, { style: 'line' });
		s.render();
		// Layout: | G o   (glyph at 0, space at 1, label at 2..3)
		expect(s.getCell(0, 0).char).toBe('|');
		expect(s.getCell(2, 0).char).toBe('G');
		expect(s.getCell(3, 0).char).toBe('o');
	});
});
