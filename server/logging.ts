/**
 * Minimal structured logger. Emits single-line JSON for easy filtering in
 * `wrangler tail` / Workers Logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
	[key: string]: unknown;
}

export function log(level: LogLevel, message: string, fields?: LogFields): void {
	const entry = JSON.stringify({
		level,
		message,
		...fields,
		timestamp: new Date().toISOString(),
	});
	if (level === "error") {
		console.error(entry);
	} else if (level === "warn") {
		console.warn(entry);
	} else {
		console.log(entry);
	}
}

/** Convenience wrappers. */
export const logger = {
	debug: (message: string, fields?: LogFields) => log("debug", message, fields),
	info: (message: string, fields?: LogFields) => log("info", message, fields),
	warn: (message: string, fields?: LogFields) => log("warn", message, fields),
	error: (message: string, fields?: LogFields) => log("error", message, fields),
};
