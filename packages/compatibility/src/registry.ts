import { steam } from "./modules/steam/module.ts";
import type { CompatibilityModule, DetectionContext } from "./types.ts";

/**
 * All registered compatibility modules. Add new modules here; no changes to
 * the renderer are required.
 */
export const compatibilityModules: CompatibilityModule[] = [steam];

/** Find the modules that apply to a given URL. */
export function findModulesForUrl(url: string): CompatibilityModule[] {
	let hostname = "";
	let pathname = "";
	try {
		const u = new URL(url);
		hostname = u.hostname.toLowerCase();
		pathname = u.pathname;
	} catch {
		return [];
	}

	const ctx: DetectionContext = { hostname, pathname, url };
	return compatibilityModules.filter((mod) => {
		const hostMatched = mod.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
		if (!hostMatched) return false;
		return mod.detect ? mod.detect(ctx) : true;
	});
}

/** Concatenate the compatibility CSS for a set of URLs (deduplicated by id). */
export function buildCompatibilityStyles(urls: string[]): string {
	const seen = new Set<string>();
	const parts: string[] = [];
	for (const url of urls) {
		for (const mod of findModulesForUrl(url)) {
			if (seen.has(mod.id)) continue;
			seen.add(mod.id);
			parts.push(mod.css);
		}
	}
	return parts.join("\n");
}
