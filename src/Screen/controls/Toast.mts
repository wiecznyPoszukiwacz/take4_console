import type { StyleId, ToastPosition, WindowBorder } from '../types.mjs';
import { BUILTIN_TOAST } from '../types.mjs';
import { Window } from '../Window.mjs';
import { Pos } from '../Pos.mjs';
import { Size } from '../Size.mjs';
import { getRegistry } from '../RegistryHolder.mjs';
import { stringWidth } from '../textWidth.mjs';

/** Resolved option bag consumed by the `Toast` constructor. `Screen.toast()`
 *  fills every field so the control itself never has to re-apply defaults. */
export interface ToastConstructorOptions {
  /** Anchor corner (or top/bottom centre). Stored on the instance so the
   *  enclosing Screen can group toasts by anchor for stacking / re-layout. */
  position: ToastPosition;
  /** Pre-registered style used both as the window background and as the
   *  base style for the toast text. */
  style: StyleId;
  /** Border configuration. `false` yields a borderless toast. */
  border: WindowBorder | boolean;
  /** Stacking order relative to regular Screen children. */
  zIndex: number;
  /** Optional width override for the text row (inner area, without border).
   *  When undefined the toast auto-sizes to the measured string width. */
  width: number | undefined;
}

/** Converts a border option (`true` / `false` / `WindowBorder`) into the
 *  normalised `{ top, right, bottom, left }` record we need to compute the
 *  toast's final width and height at construction time. */
const resolveBorderSides = (border: WindowBorder | boolean): { top: boolean; right: boolean; bottom: boolean; left: boolean } => {
  if (border === false) return { top: false, right: false, bottom: false, left: false };
  if (border === true)  return { top: true,  right: true,  bottom: true,  left: true  };
  const style = border.style;
  if (style === 'none') return { top: false, right: false, bottom: false, left: false };
  return {
    top:    border.top    ?? false,
    right:  border.right  ?? false,
    bottom: border.bottom ?? false,
    left:   border.left   ?? false,
  };
};

/** A transient overlay window produced by `Screen.toast()`. Holds the
 *  message text and the anchor position so the Screen can stack, re-flow,
 *  and dismiss toasts without leaking that bookkeeping into every caller.
 *
 *  The toast is auto-sized: the inner text row is `max(stringWidth(text), 1)`
 *  cells wide (or `options.width` when explicitly provided), plus one cell
 *  of horizontal padding on each side and the border insets. Height is
 *  always one text row plus the vertical border insets — toasts do not
 *  wrap or stack text vertically. */
export class Toast extends Window {
  /** Message rendered inside the toast body. Stored so `setMessage` can
   *  redraw without re-asking the caller for the original text. */
  private message: string;
  /** Anchor corner (or top/bottom centre). Read by `Screen` when re-flowing
   *  the active-toast stack after a dismissal or terminal resize. */
  private toastPosition: ToastPosition;
  /** Style shared between the background fill and the text row. Kept so
   *  `setMessage` uses the same colour combination the toast launched with. */
  private toastStyle: StyleId;
  /** Screen-supplied dismissal hook. Registered after construction via
   *  `attachDismiss()` so `Toast` does not need a circular import on
   *  `Screen` to invoke `screen.dismissToast(this)`. */
  private dismissHandler: (() => void) | undefined;

  /** Builds a Toast with a final size derived from the supplied text and
   *  option bag. The caller (`Screen.toast()`) is responsible for placing
   *  the toast inside the Screen via `addChild` and setting the final x/y. */
  public constructor(text: string, options: ToastConstructorOptions) {
    const sides       = resolveBorderSides(options.border);
    const borderW     = (sides.left ? 1 : 0) + (sides.right  ? 1 : 0);
    const borderH     = (sides.top  ? 1 : 0) + (sides.bottom ? 1 : 0);
    const innerWidth  = Math.max(1, options.width ?? stringWidth(text));
    const width       = innerWidth + 2 + borderW; // 1-cell horizontal padding each side.
    const height      = 1 + borderH;

    super({
      pos:        Pos.topLeft(),
      size:       new Size(width, height),
      background: options.style,
      border:     options.border,
      zIndex:     options.zIndex,
      padding:    { left: 1, right: 1, top: 0, bottom: 0 },
    });

    this.message       = text;
    this.toastPosition = options.position;
    this.toastStyle    = options.style;

    this.writeText(text, { x: 0, y: 0, style: options.style });
  }

  /** Returns the currently displayed message. */
  public getMessage(): string {
    return this.message;
  }

  /** Returns the resolved style id used for both the background fill and
   *  the text row. Exposed so tests can verify the toast's paint without
   *  re-resolving BUILTIN_TOAST by hand. */
  public getToastStyle(): StyleId {
    return this.toastStyle;
  }

  /** Returns the anchor corner the toast was created with. `Screen` uses
   *  this to group sibling toasts when re-flowing the active stack. */
  public getToastPosition(): ToastPosition {
    return this.toastPosition;
  }

  /** Registers the dismiss callback wired up by `Screen.toast()`. Called
   *  once immediately after construction so `toast.dismiss()` can trigger
   *  the full Screen-side teardown (timer cancel, re-flow, onDismiss
   *  callback) without the Toast needing a direct Screen reference. */
  public attachDismiss(handler: () => void): void {
    this.dismissHandler = handler;
  }

  /** Removes the toast from the Screen it was shown on. Equivalent to
   *  calling `screen.dismissToast(this)` — the overload exists so callers
   *  that only kept the Toast reference do not need to remember the owning
   *  Screen. Safe to call before `attachDismiss()` (no-op) or twice
   *  (subsequent calls are no-ops because the Screen guards re-dismissal). */
  public dismiss(): void {
    this.dismissHandler?.();
  }

  /** Builds a fallback toast style when the registry did not already have
   *  `BUILTIN_TOAST` mapped. Extracted as a static helper so `Screen.toast`
   *  can resolve the style before it knows whether construction will fail. */
  public static resolveDefaultStyle(): StyleId {
    const reg = getRegistry();
    const existing = reg.getNamed(BUILTIN_TOAST);
    if (existing !== undefined) return existing;
    return reg.registerNamed(BUILTIN_TOAST, { background: 24, foreground: 231, bold: true });
  }
}
