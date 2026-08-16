import { type InfiniteData, type QueryKey, useMutation, useQueryClient } from "@tanstack/vue-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { type ReaderPendingAction, useReaderStore } from "@/stores/reader";
import type { EntryDetail, EntryListItem, Paginated } from "@/types";

export interface EntryFlagsInput {
	isRead?: boolean;
	isStarred?: boolean;
	isArchived?: boolean;
}

/** List query filters live at index 2 of the `["entries","list",filters]` key. */
type EntryListFilters = Record<string, unknown>;

/** Whether an item still belongs in a list given its view filters. */
function itemMatchesView(filters: EntryListFilters, item: EntryListItem): boolean {
	if (filters.archived === "true" && !item.isArchived) return false;
	if (filters.archived === "false" && item.isArchived) return false;
	if (filters.starred === "true" && !item.isStarred) return false;
	if (filters.unread === "true" && item.isRead) return false;
	if (typeof filters.feedId === "number" && item.feedId !== filters.feedId) return false;
	return true;
}

function patchCachedLists(
	queryClient: ReturnType<typeof useQueryClient>,
	entryIds: Set<number>,
	flags: EntryFlagsInput,
): void {
	// Iterate the active list queries so we can read each view's filters and
	// drop items that no longer belong (e.g. an archived entry leaves "All").
	for (const [queryKey, data] of queryClient.getQueriesData({
		queryKey: ["entries", "list"],
		type: "active",
	})) {
		const old = data as InfiniteData<Paginated<EntryListItem>> | undefined;
		if (!old || !("pages" in old)) continue;
		const filters = (queryKey[2] ?? {}) as EntryListFilters;

		queryClient.setQueryData(queryKey, {
			...old,
			pages: old.pages.map((page) => ({
				...page,
				items: page.items
					.map((item) =>
						entryIds.has(item.id)
							? {
									...item,
									isRead: flags.isRead ?? item.isRead,
									isStarred: flags.isStarred ?? item.isStarred,
									isArchived: flags.isArchived ?? item.isArchived,
								}
							: item,
					)
					.filter((item) => itemMatchesView(filters, item)),
			})),
		});
	}
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
	const reader = useReaderStore();

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

	return {
		setFlags,
		bulk,
		/** Run a flag action while marking the matching header button as loading. */
		runFlagAction(action: ReaderPendingAction, entryId: number, flags: EntryFlagsInput): void {
			reader.pendingAction = action;
			setFlags.mutate(
				{ entryId, flags },
				{
					onSettled: () => {
						reader.pendingAction = null;
					},
				},
			);
		},
	};
}
