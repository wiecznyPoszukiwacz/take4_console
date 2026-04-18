import type { Window } from './Window.mjs';

/** Callback signature for render-time error handlers.
 *  The thrown value is forwarded verbatim alongside the Window whose
 *  `render()` call raised it. */
export type ErrorHandler = (err: unknown, control: Window) => void;

/** Module-level singleton holding the active render error handler.
 *  Defaults to `undefined` so Windows rendered outside a WindowManager
 *  still propagate exceptions. The WindowManager installs a handler in
 *  its constructor and clears it on stop(). */
let activeHandler: ErrorHandler | undefined = undefined;

/** Returns the currently installed error handler, or undefined when none. */
export function getErrorHandler(): ErrorHandler | undefined {
	return activeHandler;
}

/** Installs a render-time error handler. Pass `undefined` to clear. */
export function setErrorHandler(handler: ErrorHandler | undefined): void {
	activeHandler = handler;
}
