/**
 * Feed-specific errors with a machine-readable code and a retry hint.
 */

export class FeedError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly retryable = false,
	) {
		super(message);
		this.name = "FeedError";
	}
}
