import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Screen } from '../../src/Screen/Screen.mjs';
import { Toast } from '../../src/Screen/controls/Toast.mjs';
import { BUILTIN_TOAST } from '../../src/Screen/types.mjs';

/** Silences the actual write to the TTY so the test runner output stays clean
 *  while Screen.render() is exercised repeatedly by the toast lifecycle. */
const withWriteSpy = (): { restore: () => void } => {
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  return { restore: () => spy.mockRestore() };
};

describe('Screen.toast()', () => {
  let screen: Screen;
  let spy: { restore: () => void };

  beforeEach(() => {
    screen = new Screen();
    screen.setSize(80, 24);
    spy = withWriteSpy();
  });

  afterEach(() => {
    spy.restore();
    screen.dispose();
  });

  it('returns a Toast instance and registers it as a Screen child', () => {
    const toast = screen.toast('hello');
    expect(toast).toBeInstanceOf(Toast);
    expect(screen.getChildren()).toContain(toast);
    expect(toast.getMessage()).toBe('hello');
  });

  it('tracks the toast in the active-toasts list until dismissed', () => {
    const toast = screen.toast('hi', { duration: 0 });
    expect(screen.getActiveToasts()).toContain(toast);
    screen.dismissToast(toast);
    expect(screen.getActiveToasts()).not.toContain(toast);
    expect(screen.getChildren()).not.toContain(toast);
  });

  it('auto-sizes width from the text (+2 padding +2 border)', () => {
    const toast = screen.toast('hello');
    const { width, height } = toast.getSize();
    // 5 chars + 2 padding + 2 border = 9; height 1 text + 2 border = 3.
    expect(width).toBe(9);
    expect(height).toBe(3);
  });

  it('honours an explicit width override', () => {
    const toast = screen.toast('hi', { width: 20 });
    expect(toast.getSize().width).toBe(20 + 2 + 2);
  });

  it('respects borderless toasts in both width and height', () => {
    const toast = screen.toast('hi', { border: false });
    expect(toast.getSize()).toEqual({ width: 2 + 2, height: 1 });
  });

  it('anchors a top-right toast to the right edge', () => {
    const toast = screen.toast('hi', { duration: 0 });
    const screenW = screen.getSize().width;
    expect(toast.x).toBe(screenW - toast.getSize().width);
    expect(toast.y).toBe(0);
  });

  it('anchors a bottom-left toast to the bottom-left corner', () => {
    const toast = screen.toast('hi', { position: 'bottom-left', duration: 0 });
    const screenH = screen.getSize().height;
    expect(toast.x).toBe(0);
    expect(toast.y).toBe(screenH - toast.getSize().height);
  });

  it('stacks two top-right toasts vertically in creation order', () => {
    const first  = screen.toast('one', { duration: 0 });
    const second = screen.toast('two', { duration: 0 });
    expect(first.y).toBe(0);
    expect(second.y).toBe(first.getSize().height);
    expect(first.x).toBe(second.x);
  });

  it('reflows the remaining top-right stack when the first toast dismisses', () => {
    const first  = screen.toast('one', { duration: 0 });
    const second = screen.toast('two', { duration: 0 });
    screen.dismissToast(first);
    expect(second.y).toBe(0);
  });

  it('stacks bottom-right toasts outward from the bottom edge', () => {
    const first  = screen.toast('one', { position: 'bottom-right', duration: 0 });
    const second = screen.toast('two', { position: 'bottom-right', duration: 0 });
    const screenH = screen.getSize().height;
    expect(first.y).toBe(screenH - first.getSize().height);
    expect(second.y).toBe(screenH - first.getSize().height - second.getSize().height);
  });

  it('auto-dismisses after the configured duration', () => {
    vi.useFakeTimers();
    try {
      const dismissed = vi.fn();
      const toast = screen.toast('hi', { duration: 500, onDismiss: dismissed });
      expect(screen.getActiveToasts()).toContain(toast);
      vi.advanceTimersByTime(499);
      expect(screen.getActiveToasts()).toContain(toast);
      vi.advanceTimersByTime(1);
      expect(screen.getActiveToasts()).not.toContain(toast);
      expect(dismissed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not schedule a timer when duration is 0 (sticky toast)', () => {
    vi.useFakeTimers();
    try {
      const toast = screen.toast('sticky', { duration: 0 });
      vi.advanceTimersByTime(10_000);
      expect(screen.getActiveToasts()).toContain(toast);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the auto-dismiss timer when the toast is dismissed manually', () => {
    vi.useFakeTimers();
    try {
      const dismissed = vi.fn();
      const toast = screen.toast('hi', { duration: 500, onDismiss: dismissed });
      toast.dismiss();
      expect(dismissed).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_000);
      // onDismiss must not fire twice even though the timer still existed.
      expect(dismissed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-anchors toasts after Screen.resize()', () => {
    const toast = screen.toast('hi', { position: 'bottom-right', duration: 0 });
    screen.resize(120, 40);
    expect(toast.x).toBe(120 - toast.getSize().width);
    expect(toast.y).toBe(40 - toast.getSize().height);
  });

  it('falls back to BUILTIN_TOAST when no style is provided', () => {
    const toast = screen.toast('hi', { duration: 0 });
    expect(toast.getToastStyle()).toBe(screen.getStyleRegistry().getNamed(BUILTIN_TOAST));
  });

  it('honours a caller-supplied style id', () => {
    const custom = screen.registerStyle({ background: 196, foreground: 231 });
    const toast = screen.toast('hi', { style: custom, duration: 0 });
    expect(toast.getToastStyle()).toBe(custom);
  });

  it('assigns zIndex 10000 by default so toasts draw above regular children', () => {
    const toast = screen.toast('hi', { duration: 0 });
    expect(toast.getZIndex()).toBe(10_000);
  });

  it('double-dismiss is a no-op', () => {
    const dismissed = vi.fn();
    const toast = screen.toast('hi', { duration: 0, onDismiss: dismissed });
    toast.dismiss();
    toast.dismiss();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });
});
