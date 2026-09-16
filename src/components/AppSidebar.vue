<script setup lang="ts">
import {
	Archive,
	GripVertical,
	Pencil,
	Plus,
	Radio,
	Rss,
	Settings as SettingsIcon,
	Star,
	Trash2,
	X,
} from "@lucide/vue";
import { type InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { VueDraggable } from "vue-draggable-plus";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { type ReaderView, useReaderStore } from "@/stores/reader";
import type { EntryDetail, EntryListItem, FeedWithCounts, Folder, Paginated } from "@/types";

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const reader = useReaderStore();
const queryClient = useQueryClient();

const settingsOpen = ref(false);

const feedsQuery = useQuery({
	queryKey: queryKeys.feeds.all,
	queryFn: async () => {
		const { feeds } = await api.get<{ feeds: FeedWithCounts[] }>("/api/feeds");
		return feeds;
	},
});

const foldersQuery = useQuery({
	queryKey: queryKeys.folders.all,
	queryFn: async () => {
		const { folders } = await api.get<{ folders: Folder[] }>("/api/folders");
		return folders;
	},
});

// --- Add feed ---
const addFeedOpen = ref(false);

const totalUnread = computed(
	() => feedsQuery.data.value?.reduce((sum, f) => sum + f.unreadCount, 0) ?? 0,
);

// --- Feed reordering (drag & drop) ---
// Mirrors the server feed order; updated optimistically while dragging and
// rolled back to the persisted order if the request fails.
const draggableFeeds = ref<FeedWithCounts[]>([]);
watch(
	() => feedsQuery.data.value,
	(feeds) => {
		draggableFeeds.value = feeds ?? [];
	},
	{ immediate: true },
);

const reorderFeeds = useMutation({
	mutationFn: (ids: number[]) => api.put<{ ok: boolean }>("/api/feeds/reorder", { ids }),
	onSuccess: async () => {
		await queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
	},
	onError: async () => {
		// Roll back to the persisted order on failure.
		await queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
	},
});

function onFeedsReordered(): void {
	const ids = draggableFeeds.value.map((feed) => feed.id);
	if (ids.length === 0) return;
	reorderFeeds.mutate(ids);
}

function isActive(view: ReaderView): boolean {
	const current = reader.view;
	return (
		current.kind === view.kind &&
		("feedId" in current && "feedId" in view ? current.feedId === view.feedId : true) &&
		("folderId" in current && "folderId" in view ? current.folderId === view.folderId : true)
	);
}

function selectView(view: ReaderView): void {
	reader.setView(view);
}

// --- Feed context menu (right-click / long-press) ---
interface FeedContextMenu {
	feed: FeedWithCounts;
	x: number;
	y: number;
}
const contextMenu = ref<FeedContextMenu | null>(null);
const menuEl = ref<HTMLElement | null>(null);

const MENU_WIDTH = 176;
const MENU_HEIGHT = 96;

function openContextMenu(feed: FeedWithCounts, event: MouseEvent): void {
	contextMenu.value = {
		feed,
		x: Math.max(4, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 4)),
		y: Math.max(4, Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 4)),
	};
}

function closeContextMenu(): void {
	contextMenu.value = null;
}

// Close on outside pointer-down or Escape.
useEventListener(
	window,
	"pointerdown",
	(event) => {
		const target = event.target as Node | null;
		if (menuEl.value?.contains(target)) return;
		closeContextMenu();
	},
	true,
);
useEventListener(window, "keydown", (event) => {
	if (event.key === "Escape") closeContextMenu();
});

// --- Delete feed (modal confirmation) ---
const deletingFeedId = ref<number | null>(null);
const deletingFeed = computed(
	() => feedsQuery.data.value?.find((feed) => feed.id === deletingFeedId.value) ?? null,
);

const deleteFeed = useMutation({
	mutationFn: (id: number) => api.delete<{ ok: boolean }>(`/api/feeds/${id}`),
	onSuccess: async (_data, feedId) => {
		closeContextMenu();

		// If the open article belonged to the deleted feed, close the reader.
		const selectedId = reader.selectedEntryId;
		if (selectedId !== null) {
			const detail = queryClient.getQueryData<EntryDetail>(queryKeys.entries.detail(selectedId));
			if (detail?.feed.id === feedId) reader.selectEntry(null);
		}

		if (reader.view.kind === "feed" && reader.view.feedId === feedId) {
			reader.setView({ kind: "all" });
		}

		// Drop the deleted feed's entries from every list view immediately, so
		// the UI updates without waiting on the refetch (slow network).
		queryClient.setQueriesData<InfiniteData<Paginated<EntryListItem>>>(
			{ queryKey: ["entries", "list"], type: "active" },
			(old) => {
				if (!old || !("pages" in old)) return old;
				return {
					...old,
					pages: old.pages.map((page) => ({
						...page,
						items: page.items.filter((item) => item.feedId !== feedId),
					})),
				};
			},
		);

		// Refresh feeds, folders, entry lists and any active search results.
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
			queryClient.invalidateQueries({ queryKey: ["entries"] }),
			queryClient.invalidateQueries({ queryKey: ["search"] }),
		]);
	},
	onSettled: () => {
		deletingFeedId.value = null;
	},
});

function requestDeleteFeed(feedId: number): void {
	// Context menu's first click opens the confirm modal instead of arming it.
	deletingFeedId.value = feedId;
}
function closeDeleteDialog(): void {
	if (deleteFeed.isPending.value) return;
	deletingFeedId.value = null;
}

// --- Edit feed ---
const editFeedId = ref<number | null>(null);
const editingFeed = computed(
	() => feedsQuery.data.value?.find((feed) => feed.id === editFeedId.value) ?? null,
);

function editFeed(feed: FeedWithCounts): void {
	editFeedId.value = feed.id;
	closeContextMenu();
}

// --- Long-press (touch) to open the context menu ---
let longPressTimer: number | null = null;
function onFeedPointerDown(feed: FeedWithCounts, event: PointerEvent): void {
	if (event.pointerType !== "touch") return;
	longPressTimer = window.setTimeout(() => {
		openContextMenu(feed, event);
	}, 500);
}
function cancelLongPress(): void {
	if (longPressTimer !== null) {
		window.clearTimeout(longPressTimer);
		longPressTimer = null;
	}
}

// Track favicons that failed to load so we can fall back to the RSS icon.
const failedFavicons = ref(new Set<string>());
function onFaviconError(url: string): void {
	failedFavicons.value = new Set(failedFavicons.value).add(url);
}
</script>

<template>
  <aside
    class="flex h-full w-64 shrink-0 flex-col border-r bg-background shadow-2xl md:shadow-none"
  >
    <div class="flex h-12 items-center gap-2 border-b px-4">
      <Radio class="size-4 text-primary" />
      <span class="flex-1 text-sm font-semibold tracking-tight">{{
        t("app.name")
      }}</span>
      <UiTooltip :content="t('sidebar.close')" side="bottom">
        <button
          class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
      </UiTooltip>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="flex flex-col gap-0.5 p-2">
        <button
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          :class="isActive({ kind: 'all' }) && 'bg-accent'"
          @click="selectView({ kind: 'all' })"
        >
          <Rss class="size-4" />
          <span class="flex-1 text-left">{{ t("sidebar.all") }}</span>
          <UiBadge
            class="h-5 w-6 shrink-0 justify-center px-0 bg-muted-foreground/20 text-muted-foreground"
            v-if="totalUnread > 0"
          >
            {{ totalUnread }}
          </UiBadge>
        </button>
        <button
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          :class="isActive({ kind: 'starred' }) && 'bg-accent'"
          @click="selectView({ kind: 'starred' })"
        >
          <Star class="size-4" />
          <span class="flex-1 text-left">{{ t("sidebar.starred") }}</span>
        </button>
        <button
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          :class="isActive({ kind: 'archived' }) && 'bg-accent'"
          @click="selectView({ kind: 'archived' })"
        >
          <Archive class="size-4" />
          <span class="flex-1 text-left">{{ t("sidebar.archive") }}</span>
        </button>

        <template v-if="foldersQuery.data.value?.length">
          <div
            class="mt-2 px-2 text-xs font-medium uppercase text-muted-foreground"
          >
            {{ t("sidebar.folders") }}
          </div>
          <button
            v-for="folder in foldersQuery.data.value"
            :key="folder.id"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            :class="
              isActive({ kind: 'folder', folderId: folder.id }) && 'bg-accent'
            "
            @click="selectView({ kind: 'folder', folderId: folder.id })"
          >
            <span class="flex-1 truncate text-left">{{ folder.name }}</span>
            <UiBadge
              class="h-5 w-6 shrink-0 justify-center px-0 bg-muted-foreground/20 text-muted-foreground"
              v-if="folder.unreadCount > 0"
            >
              {{ folder.unreadCount }}
            </UiBadge>
          </button>
        </template>

        <div
          class="mt-2 px-2 text-xs font-medium uppercase text-muted-foreground"
        >
          {{ t("sidebar.feeds") }}
        </div>
        <template v-if="feedsQuery.isPending.value">
          <div class="px-2 py-1.5 text-sm text-muted-foreground">
            {{ t("sidebar.loading") }}
          </div>
        </template>
        <template v-else>
          <VueDraggable
            v-model="draggableFeeds"
            class="flex flex-col gap-0.5"
            :animation="150"
            handle=".feed-drag-handle"
            ghost-class="feed-drag-ghost"
            :force-fallback="true"
            @update:model-value="onFeedsReordered"
          >
            <button
              v-for="feed in draggableFeeds"
              :key="feed.id"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              :class="
                isActive({ kind: 'feed', feedId: feed.id }) && 'bg-accent'
              "
              @click="selectView({ kind: 'feed', feedId: feed.id })"
              @contextmenu.prevent="openContextMenu(feed, $event)"
              @pointerdown="onFeedPointerDown(feed, $event)"
              @pointerup="cancelLongPress"
              @pointerleave="cancelLongPress"
            >
              <img
                v-if="feed.faviconUrl && !failedFavicons.has(feed.faviconUrl)"
                :src="`/api/favicon?url=${encodeURIComponent(feed.faviconUrl)}`"
                class="size-4 shrink-0 rounded-sm"
                alt=""
                @error="onFaviconError(feed.faviconUrl!)"
              />
              <Rss v-else class="size-4 shrink-0 text-muted-foreground" />
              <span class="flex-1 truncate text-left">{{ feed.title }}</span>
              <UiBadge
                class="h-5 w-6 shrink-0 justify-center px-0 bg-muted-foreground/20 text-muted-foreground"
                v-if="feed.unreadCount > 0"
              >
                {{ feed.unreadCount }}
              </UiBadge>
              <GripVertical
                class="feed-drag-handle size-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
                :aria-label="t('sidebar.dragToReorder')"
              />
            </button>
          </VueDraggable>
          <div
            v-if="!feedsQuery.data.value?.length"
            class="px-2 py-1.5 text-sm text-muted-foreground"
          >
            {{ t("sidebar.noFeeds") }}
          </div>
        </template>
      </div>
    </ScrollArea>

    <div class="border-t p-2">
      <div class="flex items-center gap-2">
        <UiButton
          variant="ghost"
          size="sm"
          class="flex-1 justify-start"
          @click="addFeedOpen = true"
        >
          <Plus class="size-4" />
          {{ t("sidebar.addFeed") }}
        </UiButton>
        <UiTooltip :content="t('sidebar.settings')" side="top">
          <UiButton
            variant="ghost"
            size="icon"
            class="size-8"
            @click="settingsOpen = true"
          >
            <SettingsIcon class="size-4" />
          </UiButton>
        </UiTooltip>
      </div>
    </div>
  </aside>

  <SettingsDialog v-model:open="settingsOpen" />
  <DeleteFeedDialog
    :open="deletingFeedId !== null"
    :feed-name="deletingFeed?.title ?? ''"
    :busy="deleteFeed.isPending.value"
    @update:open="closeDeleteDialog"
    @confirm="deletingFeedId !== null && deleteFeed.mutate(deletingFeedId)"
  />
  <FeedDialog v-model:open="addFeedOpen" mode="add" :feed="null" />
  <FeedDialog
    :open="editFeedId !== null"
    mode="edit"
    :feed="editingFeed"
    @update:open="editFeedId = null"
  />

  <!-- Feed context menu (right-click / long-press) -->
  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="menuEl"
      class="fixed z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @contextmenu.prevent
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        @click="editFeed(contextMenu.feed)"
      >
        <Pencil class="size-3.5" />
        {{ t("sidebar.editFeed") }}
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-destructive"
        @click="requestDeleteFeed(contextMenu.feed.id)"
      >
        <Trash2 class="size-3.5" />
        {{ t("sidebar.deleteFeed") }}
      </button>
    </div>
  </Teleport>
</template>
