import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/vue-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { EntryListItem, Paginated } from "@/types";

export interface EntryFlagsInput {
	isRead?: boolean;
	isStarred?: boolean;
	isArchived?: boolean;
}

function patchCachedLists(
	queryClient: ReturnType<typeof useQueryClient>,
	entryIds: Set<number>,
	flags: EntryFlagsInput,
): void {
	queryClient.setQueriesData<InfiniteData<Paginated<EntryListItem>>>(
		{ queryKey: ["entries", "list"], type: "active" },
		(old) => {
			// Only patch paginated list caches; ignore other "entries" queries.
			if (!old || !("pages" in old)) return old;
			return {
				...old,
				pages: old.pages.map((page) => ({
					...page,
					items: page.items.map((item) =>
						entryIds.has(item.id)
							? {
									...item,
									isRead: flags.isRead ?? item.isRead,
									isStarred: flags.isStarred ?? item.isStarred,
									isArchived: flags.isArchived ?? item.isArchived,
								}
							: item,
					),
				})),
			};
		},
	);
}

/** Mutations for entry flags with optimistic list updates. */
export function useEntryMutations() {
	const queryClient = useQueryClient();

	async function refreshCounts(): Promise<void> {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
		]);
	}

	const setFlags = useMutation({
		mutationFn: ({ entryId, flags }: { entryId: number; flags: EntryFlagsInput }) =>
			api.patch<{ ok: boolean }>(`/api/entries/${entryId}`, flags),
		onMutate: ({ entryId, flags }) => {
			patchCachedLists(queryClient, new Set([entryId]), flags);
		},
		onSuccess: () => refreshCounts(),
	});

	const bulk = useMutation({
		mutationFn: ({ entryIds, flags }: { entryIds: number[]; flags: EntryFlagsInput }) =>
			api.post<{ ok: boolean; updated: number }>("/api/entries/bulk", { entryIds, ...flags }),
		onMutate: ({ entryIds, flags }) => {
			patchCachedLists(queryClient, new Set(entryIds), flags);
		},
		onSuccess: () => refreshCounts(),
	});

	return { setFlags, bulk };
}
