import { describe, it, expect } from 'vitest';
import { VirtualCursor, DEFAULT_CURSOR_SYMBOL } from '../src/Screen/VirtualCursor.mjs';

describe('VirtualCursor', () => {
	describe('defaults', () => {
		it('has no custom symbol by default (inverse-block fallback)', () => {
			const vc = new VirtualCursor();
			expect(vc.hasCustomSymbol()).toBe(false);
			expect(vc.getSymbol()).toBe(DEFAULT_CURSOR_SYMBOL);
		});

		it('is steady by default — always visible', () => {
			const vc = new VirtualCursor();
			expect(vc.isVisible(0)).toBe(true);
			expect(vc.isVisible(10_000)).toBe(true);
		});
	});

	describe('symbol configuration', () => {
		it('round-trips symbol via constructor', () => {
			const vc = new VirtualCursor({ symbol: '|' });
			expect(vc.hasCustomSymbol()).toBe(true);
			expect(vc.getSymbol()).toBe('|');
		});

		it('setSymbol(undefined) reverts to fallback', () => {
			const vc = new VirtualCursor({ symbol: '#' });
			vc.setSymbol(undefined);
			expect(vc.hasCustomSymbol()).toBe(false);
		});
	});

	describe('blink mode: off', () => {
		it('never visible', () => {
			const vc = new VirtualCursor({ blink: { mode: 'off' } });
			expect(vc.isVisible(0)).toBe(false);
			expect(vc.isVisible(1000)).toBe(false);
		});

		it('getTickHintMs returns null', () => {
			const vc = new VirtualCursor({ blink: { mode: 'off' } });
			expect(vc.getTickHintMs()).toBe(null);
		});
	});

	describe('blink mode: slow', () => {
		it('on for 600ms, off for 600ms, repeats', () => {
			const vc = new VirtualCursor({ blink: { mode: 'slow' } });
			expect(vc.isVisible(0)).toBe(true);
			expect(vc.isVisible(300)).toBe(true);
			expect(vc.isVisible(599)).toBe(true);
			expect(vc.isVisible(600)).toBe(false);
			expect(vc.isVisible(1100)).toBe(false);
			expect(vc.isVisible(1200)).toBe(true);
		});

		it('tick hint is 600', () => {
			expect(new VirtualCursor({ blink: { mode: 'slow' } }).getTickHintMs()).toBe(600);
		});
	});

	describe('blink mode: fast', () => {
		it('on for 250ms, off for 250ms', () => {
			const vc = new VirtualCursor({ blink: { mode: 'fast' } });
			expect(vc.isVisible(0)).toBe(true);
			expect(vc.isVisible(249)).toBe(true);
			expect(vc.isVisible(250)).toBe(false);
			expect(vc.isVisible(500)).toBe(true);
		});
	});

	describe('blink mode: custom', () => {
		it('respects onMs / offMs', () => {
			const vc = new VirtualCursor({ blink: { mode: 'custom', onMs: 100, offMs: 50 } });
			expect(vc.isVisible(0)).toBe(true);
			expect(vc.isVisible(99)).toBe(true);
			expect(vc.isVisible(100)).toBe(false);
			expect(vc.isVisible(149)).toBe(false);
			expect(vc.isVisible(150)).toBe(true);
			expect(vc.isVisible(250)).toBe(false);
		});

		it('tick hint is the min of onMs / offMs', () => {
			const vc = new VirtualCursor({ blink: { mode: 'custom', onMs: 400, offMs: 100 } });
			expect(vc.getTickHintMs()).toBe(100);
		});
	});

	describe('blink mode: irregular', () => {
		it('produces both visible and hidden samples over time', () => {
			const vc = new VirtualCursor({ blink: { mode: 'irregular' } });
			let sawOn = false, sawOff = false;
			for (let t = 0; t < 10_000; t += 50) {
				if (vc.isVisible(t)) sawOn = true;
				else sawOff = true;
				if (sawOn && sawOff) break;
			}
			expect(sawOn).toBe(true);
			expect(sawOff).toBe(true);
		});
	});

	describe('resetPhase', () => {
		it('re-seeds the schedule at the given timestamp', () => {
			const vc = new VirtualCursor({ blink: { mode: 'fast' } });
			vc.isVisible(0); // seed phase at t=0
			expect(vc.isVisible(300)).toBe(false); // 250-500 is off
			vc.resetPhase(300);
			expect(vc.isVisible(300)).toBe(true);
			expect(vc.isVisible(549)).toBe(true);
			expect(vc.isVisible(550)).toBe(false);
		});
	});

	describe('setBlink', () => {
		it('switching modes resets the phase timer', () => {
			const vc = new VirtualCursor({ blink: { mode: 'fast' } });
			vc.isVisible(0); // seed at t=0
			expect(vc.isVisible(300)).toBe(false);
			vc.setBlink({ mode: 'steady' });
			expect(vc.isVisible(300)).toBe(true);
		});
	});
});
