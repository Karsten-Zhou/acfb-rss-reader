import { useInfiniteQuery } from "@tanstack/vue-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useReaderStore } from "@/stores/reader";
import type { EntryListItem, Paginated } from "@/types";

function buildParams(
	filters: Record<string, string | number | undefined>,
	cursor?: string,
): string {
	const params = new URLSearchParams({ limit: "50" });
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== "" && value !== null) {
			params.set(key, String(value));
		}
	}
	if (cursor) params.set("cursor", cursor);
	return params.toString();
}

/** Paginated entry list driven by the reader store's current view. */
export function useEntryListQuery() {
	const reader = useReaderStore();

	const filters = computed<Record<string, string | number | undefined>>(() => ({
		feedId: reader.feedId ?? undefined,
		folderId: reader.folderId ?? undefined,
		starred: reader.view.kind === "starred" ? "true" : undefined,
		// Non-archive views hide archived entries; the Archive view shows only them.
		archived: reader.view.kind === "archived" ? "true" : "false",
		unread: reader.showUnreadOnly ? "true" : undefined,
		q: reader.searchQuery || undefined,
	}));

	return useInfiniteQuery({
		queryKey: computed(() => queryKeys.entries.list(filters.value)),
		queryFn: async ({ pageParam }) => {
			const qs = buildParams(filters.value, pageParam as string | undefined);
			return api.get<Paginated<EntryListItem>>(`/api/entries?${qs}`);
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
}
