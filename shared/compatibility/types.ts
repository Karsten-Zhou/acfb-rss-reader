/**
 * Site compatibility system.
 *
 * Some websites publish RSS content that expects site-specific CSS to render
 * correctly. Each module contributes:
 *
 * - `css` — the compatibility stylesheet (the primary mechanism)
 * - `hosts` — hostnames the module is associated with
 * - optional `detect` — additional URL/document-based detection logic
 *
 * Adding a new module requires no changes to the renderer: drop a folder in
 * `src/modules/` and register it in `src/registry.ts`.
 */

export interface CompatibilityModule {
	/** Stable identifier, e.g. "steam". */
	id: string;
	/** Hostnames the module is relevant for (matched by suffix). */
	hosts: string[];
	/** CSS injected when the module matches. Keep minimal. */
	css: string;
	/**
	 * Optional finer-grained detection. When omitted, the module matches any
	 * URL whose hostname ends with one of `hosts`.
	 */
	detect?: (ctx: { hostname: string; pathname: string; url: string }) => boolean;
}

/** Context passed to detection logic. */
export interface DetectionContext {
	hostname: string;
	pathname: string;
	url: string;
}
