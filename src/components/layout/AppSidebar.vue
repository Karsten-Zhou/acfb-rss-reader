<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { GripVertical, LogOut, Plus, Radio, Rss, Star, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";

import { AsyncButton } from "@/components/ui/async-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth";
import { type ReaderView, useReaderStore } from "@/stores/reader";
import type { FeedWithCounts, Folder } from "@/types";

const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();
const reader = useReaderStore();
const queryClient = useQueryClient();

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
const addingFeed = ref(false);
const newFeedUrl = ref("");
const addFeed = useMutation({
	mutationFn: async (url: string) => {
		await api.post<{ feed: FeedWithCounts }>("/api/feeds", { url });
	},
	onSuccess: async () => {
		newFeedUrl.value = "";
		addingFeed.value = false;
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
		]);
	},
});

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

// Track favicons that failed to load so we can fall back to the RSS icon.
const failedFavicons = ref(new Set<string>());
function onFaviconError(url: string): void {
	failedFavicons.value = new Set(failedFavicons.value).add(url);
}
</script>

<template>
  <aside class="flex h-full w-64 shrink-0 flex-col border-r bg-background shadow-2xl md:shadow-none">
    <div class="flex h-12 items-center gap-2 border-b px-4">
      <Radio class="size-4 text-primary" />
      <span class="flex-1 text-sm font-semibold tracking-tight">RSS Reader</span>
      <button
        class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        title="Close"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="flex flex-col gap-0.5 p-2">
        <button
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          :class="isActive({ kind: 'all' }) && 'bg-accent'"
          @click="selectView({ kind: 'all' })"
        >
          <Rss class="size-4" />
          <span class="flex-1 text-left">All</span>
          <Badge v-if="totalUnread > 0" class="bg-muted-foreground/20 text-muted-foreground">
            {{ totalUnread }}
          </Badge>
        </button>
        <button
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          :class="isActive({ kind: 'starred' }) && 'bg-accent'"
          @click="selectView({ kind: 'starred' })"
        >
          <Star class="size-4" />
          <span class="flex-1 text-left">Starred</span>
        </button>

        <template v-if="foldersQuery.data.value?.length">
          <div class="mt-2 px-2 text-xs font-medium uppercase text-muted-foreground">Folders</div>
          <button
            v-for="folder in foldersQuery.data.value"
            :key="folder.id"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            :class="isActive({ kind: 'folder', folderId: folder.id }) && 'bg-accent'"
            @click="selectView({ kind: 'folder', folderId: folder.id })"
          >
            <span class="flex-1 truncate text-left">{{ folder.name }}</span>
            <Badge v-if="folder.unreadCount > 0" class="bg-muted-foreground/20 text-muted-foreground">
              {{ folder.unreadCount }}
            </Badge>
          </button>
        </template>

        <div class="mt-2 px-2 text-xs font-medium uppercase text-muted-foreground">Feeds</div>
        <template v-if="feedsQuery.isPending.value">
          <div class="px-2 py-1.5 text-sm text-muted-foreground">Loading…</div>
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
              :class="isActive({ kind: 'feed', feedId: feed.id }) && 'bg-accent'"
              @click="selectView({ kind: 'feed', feedId: feed.id })"
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
              <Badge v-if="feed.unreadCount > 0" class="bg-muted-foreground/20 text-muted-foreground">
                {{ feed.unreadCount }}
              </Badge>
              <GripVertical
                class="feed-drag-handle size-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
                aria-label="Drag to reorder"
              />
            </button>
          </VueDraggable>
          <div v-if="!feedsQuery.data.value?.length" class="px-2 py-1.5 text-sm text-muted-foreground">
            No feeds yet. Add one below.
          </div>
        </template>
      </div>
    </ScrollArea>

    <div class="border-t p-2">
      <form
        v-if="addingFeed"
        class="flex gap-1.5"
        @submit.prevent="newFeedUrl.trim() && addFeed.mutate(newFeedUrl.trim())"
      >
        <Input v-model="newFeedUrl" placeholder="https://feed-url…" class="h-8 text-sm" />
        <AsyncButton type="submit" size="icon" class="size-8 shrink-0" :loading="addFeed.isPending.value">
          <Plus />
        </AsyncButton>
      </form>
      <div class="flex items-center gap-2">
        <Button
          v-if="!addingFeed"
          variant="ghost"
          size="sm"
          class="flex-1 justify-start"
          @click="addingFeed = true"
        >
          <Plus class="size-4" />
          Add feed
        </Button>
        <Button
          v-else
          variant="ghost"
          size="sm"
          class="flex-1 justify-start"
          @click="addingFeed = false"
        >
          Cancel
        </Button>
        <Button variant="ghost" size="icon" class="size-8" title="Sign out" @click="auth.logout()">
          <LogOut class="size-4" />
        </Button>
      </div>
    </div>
  </aside>
</template>
