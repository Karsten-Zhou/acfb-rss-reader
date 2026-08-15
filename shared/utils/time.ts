/**
 * Small date/time helpers. All timestamps stored in D1 are ISO strings
 * (SQLite TEXT) or unix epoch numbers where noted.
 */

/** True when `date` is in the past. */
export function isExpired(date: Date): boolean {
	return date.getTime() <= Date.now();
}

/** Add milliseconds to a date, returning a new Date. */
export function addMs(date: Date, ms: number): Date {
	return new Date(date.getTime() + ms);
}

/** Convert a Date to an ISO string, or null. */
export function toIso(date: Date | null | undefined): string | null {
	return date ? date.toISOString() : null;
}

/** Parse an ISO string (or unix seconds) into a Date, or null. */
export function parseDate(value: string | number | Date | null | undefined): Date | null {
	if (value == null) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === "number") {
		const d = new Date(value * 1000);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}
