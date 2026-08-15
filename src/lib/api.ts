/**
 * Typed fetch wrapper for the RSS reader API.
 */

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

interface ErrorBody {
	error?: { code?: string; message?: string; details?: unknown };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		credentials: "same-origin",
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});

	if (!res.ok) {
		let body: ErrorBody | null = null;
		try {
			body = (await res.json()) as ErrorBody;
		} catch {
			// non-JSON error body
		}
		throw new ApiError(
			res.status,
			body?.error?.code ?? "UNKNOWN",
			body?.error?.message ?? `Request failed (${res.status})`,
			body?.error?.details,
		);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, {
			method: "POST",
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	patch: <T>(path: string, body?: unknown) =>
		request<T>(path, {
			method: "PATCH",
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	put: <T>(path: string, body?: unknown) =>
		request<T>(path, {
			method: "PUT",
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
