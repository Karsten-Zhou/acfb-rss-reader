import type { CompatibilityModule, DetectionContext } from "../../types.ts";

import styles from "./styles.css?raw";

/**
 * Steam compatibility.
 *
 * Steam announcements and newsletters sometimes contain HTML that depends on
 * Steam Community styles (e.g. `.sharedFilePreviewYouTubeVideo`). We only add
 * the minimum CSS required to prevent obvious layout breakage — we do not try
 * to recreate Steam Community styling.
 */
export const steam: CompatibilityModule = {
	id: "steam",
	hosts: ["steamcommunity.com", "store.steampowered.com"],
	detect: ({ hostname }: DetectionContext) =>
		hostname === "steamcommunity.com" || hostname === "store.steampowered.com",
	css: styles,
};
