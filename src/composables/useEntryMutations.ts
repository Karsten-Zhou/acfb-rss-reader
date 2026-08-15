import { type InfiniteData, type QueryKey, useMutation, useQueryClient } from "@tanstack/vue-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { EntryDetail, EntryListItem, Paginated } from "@/types";

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

/** Patch the entry detail query cache so open articles update immediately. */
function patchCachedDetail(
	queryClient: ReturnType<typeof useQueryClient>,
	entryIds: Set<number>,
	flags: EntryFlagsInput,
): void {
	queryClient.setQueriesData<EntryDetail>(
		{ queryKey: ["entries", "detail"], type: "active" },
		(old) => {
			if (!old || !entryIds.has(old.id)) return old;
			return {
				...old,
				isRead: flags.isRead ?? old.isRead,
				isStarred: flags.isStarred ?? old.isStarred,
				isArchived: flags.isArchived ?? old.isArchived,
			};
		},
	);
}

type EntryCacheSnapshot = Array<{ queryKey: QueryKey; data: unknown }>;

/** Capture list + detail caches so an optimistic update can be rolled back. */
function snapshotEntryCaches(queryClient: ReturnType<typeof useQueryClient>): EntryCacheSnapshot {
	const snapshot: EntryCacheSnapshot = [];
	for (const prefix of ["list", "detail"] as const) {
		for (const [queryKey, data] of queryClient.getQueriesData({
			queryKey: ["entries", prefix],
			type: "active",
		})) {
			snapshot.push({ queryKey, data });
		}
	}
	return snapshot;
}

/** Restore caches captured by `snapshotEntryCaches` (rollback on error). */
function restoreEntryCaches(
	queryClient: ReturnType<typeof useQueryClient>,
	snapshot: EntryCacheSnapshot | undefined,
): void {
	if (!snapshot) return;
	for (const { queryKey, data } of snapshot) {
		queryClient.setQueryData(queryKey, data);
	}
}

/** Mutations for entry flags with optimistic list + detail updates. */
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
		onMutate: async ({ entryId, flags }) => {
			await queryClient.cancelQueries({ queryKey: ["entries"] });
			const snapshot = snapshotEntryCaches(queryClient);
			const entryIds = new Set([entryId]);
			patchCachedLists(queryClient, entryIds, flags);
			patchCachedDetail(queryClient, entryIds, flags);
			return snapshot;
		},
		onError: (_error, _variables, snapshot) => {
			restoreEntryCaches(queryClient, snapshot);
		},
		onSuccess: () => refreshCounts(),
	});

	const bulk = useMutation({
		mutationFn: ({ entryIds, flags }: { entryIds: number[]; flags: EntryFlagsInput }) =>
			api.post<{ ok: boolean; updated: number }>("/api/entries/bulk", { entryIds, ...flags }),
		onMutate: async ({ entryIds, flags }) => {
			await queryClient.cancelQueries({ queryKey: ["entries"] });
			const snapshot = snapshotEntryCaches(queryClient);
			patchCachedLists(queryClient, new Set(entryIds), flags);
			patchCachedDetail(queryClient, new Set(entryIds), flags);
			return snapshot;
		},
		onError: (_error, _variables, snapshot) => {
			restoreEntryCaches(queryClient, snapshot);
		},
		onSuccess: () => refreshCounts(),
	});

	return { setFlags, bulk };
}
