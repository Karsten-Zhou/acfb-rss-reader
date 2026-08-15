/** Centralized TanStack Query key factories. */

export const queryKeys = {
	feeds: {
		all: ["feeds"] as const,
		detail: (id: number) => ["feeds", id] as const,
	},
	folders: {
		all: ["folders"] as const,
	},
	entries: {
		list: (filters: Record<string, unknown>) => ["entries", "list", filters] as const,
		detail: (id: number) => ["entries", "detail", id] as const,
	},
	search: {
		query: (q: string) => ["search", q] as const,
	},
	auth: {
		me: ["auth", "me"] as const,
	},
};
