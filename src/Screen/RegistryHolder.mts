import { StyleRegistry } from './StyleRegistry.mjs';

/** Module-level singleton holding the active StyleRegistry.
 *  Initialized with an empty registry so Window and controls work
 *  in isolation (e.g. in tests) before any Screen is constructed. */
let activeRegistry: StyleRegistry = new StyleRegistry();

/** Returns the currently active StyleRegistry. */
export function getRegistry(): StyleRegistry {
	return activeRegistry;
}

/** Sets the active StyleRegistry. Called by the Screen constructor. */
export function setRegistry(registry: StyleRegistry): void {
	activeRegistry = registry;
}
