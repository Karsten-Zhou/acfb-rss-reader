/** Compact relative time, e.g. "5m", "3h", "2d", "Jan 3". */

export function formatRelativeTime(value: string | Date | null): string {
	if (!value) return "";
	const date = typeof value === "string" ? new Date(value) : value;
	const diffMs = Date.now() - date.getTime();
	if (Number.isNaN(diffMs)) return "";

	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;

	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;

	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
