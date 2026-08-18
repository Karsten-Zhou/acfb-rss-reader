import { type InfiniteData, type QueryKey, useMutation, useQueryClient } from "@tanstack/vue-query";

import { api } from "@/lib/api";
import { createEntryFlagQueue, type EntryFlagsInput } from "@/lib/entryFlagsQueue";
import { queryKeys } from "@/lib/query-keys";
import { useReaderStore } from "@/stores/reader";
import { useToastStore } from "@/stores/toast";
import type { EntryDetail, EntryListItem, Paginated } from "@/types";

/**
 * Entry-flag mutations.
 *
 * Architecture:
 * - **Explicit commands only.** Mutations originate from user intent
 *   (opening an article, a toolbar click, a shortcut) — never from watching
 *   fetched query data.
 * - **One shared, per-entry queue** (`entryFlagsQueue.ts`) serializes sends
 *   per entry, coalesces to the latest desired flags, applies optimistic
 *   cache updates, and rolls back on failure. It also owns per-entry pending
 *   state, so no global `pendingAction` scalar exists anymore.
 * - **Pinia** keeps UI/navigation state (`selectedEntryId`, view, filters).
 */

export type EntryFlagsInputAlias = EntryFlagsInput;

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

async function refreshCounts(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
		queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
	]);
}

// ---------------------------------------------------------------------------
// Shared per-entry flag queue. Module-level so every component using
// useEntryMutations coordinates through the same queue, and the pending map
// is shared/reactive across them.
// ---------------------------------------------------------------------------

const pendingFlags = ref<ReadonlyMap<number, EntryFlagsInput>>(new Map());

let sharedQueue: ReturnType<typeof createEntryFlagQueue> | null = null;

function getQueue(queryClient: ReturnType<typeof useQueryClient>) {
	if (!sharedQueue) {
		sharedQueue = createEntryFlagQueue({
			send: async (entryId, flags) => {
				try {
					await api.patch<{ ok: boolean }>(`/api/entries/${entryId}`, flags);
				} catch {
					// Surface the failure instead of failing silently. Pick a
					// message based on which flags were being changed.
					if (flags.isStarred !== undefined) {
						useToastStore().error("error.entryActionFailedStar", undefined);
					} else if (flags.isArchived !== undefined) {
						useToastStore().error("error.entryActionFailedArchive", undefined);
					} else if (flags.isRead !== undefined) {
						useToastStore().error("error.entryActionFailedRead", undefined);
					} else {
						useToastStore().error("error.entryActionFailed", undefined);
					}
					throw new Error("entry-update-failed");
				}
			},
			applyOptimistic: (entryId, flags) => {
				patchCachedLists(queryClient, new Set([entryId]), flags);
				patchCachedDetail(queryClient, new Set([entryId]), flags);
			},
			snapshot: () => snapshotEntryCaches(queryClient),
			restore: (snapshot) => restoreEntryCaches(queryClient, snapshot as EntryCacheSnapshot),
			// Secondary count refreshes must not extend the perceived mutation
			// lifecycle: run them detached from the PATCH settlement.
			onSuccess: () => {
				void refreshCounts(queryClient);
			},
			onPendingChange: (pending) => {
				pendingFlags.value = new Map(pending);
			},
		});
	}
	return sharedQueue;
}

/** Entry-flag actions shared by every caller (reader, list, keyboard). */
export function useEntryMutations() {
	const queryClient = useQueryClient();
	const reader = useReaderStore();
	const queue = getQueue(queryClient);

	/** The user opened an entry: this is navigation intent, so mark-read is
	 * an explicit command — it is never derived from observing query data. */
	function openEntry(entryId: number, isRead?: boolean): void {
		reader.selectEntry(entryId);
		const alreadyRead =
			isRead ??
			queryClient.getQueryData<EntryDetail>(queryKeys.entries.detail(entryId))?.isRead ??
			false;
		if (!alreadyRead) queue.setFlags(entryId, { isRead: true });
	}

	/** Close the reader (no mutation). */
	function closeEntry(): void {
		reader.selectEntry(null);
	}

	/** Send desired flag state for an entry (last write wins per field). */
	function setFlags(entryId: number, flags: EntryFlagsInput, onSettled?: () => void): void {
		queue.setFlags(entryId, flags, onSettled);
	}

	function toggleRead(entryId: number, currentIsRead: boolean): void {
		queue.setFlags(entryId, { isRead: !currentIsRead });
	}

	function toggleStarred(entryId: number, currentIsStarred: boolean): void {
		queue.setFlags(entryId, { isStarred: !currentIsStarred });
	}

	function toggleArchive(entryId: number, currentIsArchived: boolean): void {
		queue.setFlags(entryId, { isArchived: !currentIsArchived });
	}

	/** True while a flag for this entry is pending (in-flight or queued). */
	function isPending(entryId: number, field: keyof EntryFlagsInput): boolean {
		return pendingFlags.value.get(entryId)?.[field] !== undefined;
	}

	// Bulk action (mark-all / archive-all). Kept as a distinct mutation for
	// multi-entry user intents; it uses the same optimistic cache helpers.
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
			useToastStore().error("error.bulkFailed", undefined);
		},
		onSuccess: () => {
			void refreshCounts(queryClient);
		},
	});

	return {
		openEntry,
		closeEntry,
		setFlags,
		toggleRead,
		toggleStarred,
		toggleArchive,
		isPending,
		pendingFlags,
		bulk,
	};
}
