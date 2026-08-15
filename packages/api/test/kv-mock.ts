/**
 * An in-memory KVNamespace mock for tests.
 */

interface KvEntry {
	value: string;
	expiresAt?: number;
}

export function createKvMock(): KVNamespace {
	const store = new Map<string, KvEntry>();

	function isExpired(key: string): boolean {
		const entry = store.get(key);
		if (!entry) return false;
		if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
			store.delete(key);
			return true;
		}
		return false;
	}

	return {
		async get(key: string): Promise<string | null> {
			if (isExpired(key)) return null;
			return store.get(key)?.value ?? null;
		},
		async getWithMetadata(key: string): Promise<{ value: string | null; metadata?: unknown }> {
			return { value: await (store.has(key) ? store.get(key)!.value : null) };
		},
		async put(
			key: string,
			value: string | ArrayBuffer | ArrayBufferView,
			options?: { expirationTtl?: number; expiration?: number },
		): Promise<void> {
			const stringValue =
				typeof value === "string" ? value : new TextDecoder().decode(value as ArrayBuffer);
			const expiresAt =
				options?.expiration !== undefined
					? options.expiration * 1000
					: options?.expirationTtl !== undefined
						? Date.now() + options.expirationTtl * 1000
						: undefined;
			store.set(key, { value: stringValue, expiresAt });
		},
		async delete(key: string): Promise<void> {
			store.delete(key);
		},
		async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
			const prefix = options?.prefix ?? "";
			return {
				keys: [...store.keys()]
					.filter((k) => k.startsWith(prefix) && !isExpired(k))
					.map((name) => ({ name })),
			};
		},
	} as unknown as KVNamespace;
}
