<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Loader2, LogOut, Plus, Radio, Rss, Star, X } from "lucide-vue-next";
import { computed, ref } from "vue";

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
  <aside class="flex h-full w-64 shrink-0 flex-col border-r bg-card/40">
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
          <Badge v-if="totalUnread > 0" variant="secondary">{{ totalUnread }}</Badge>
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
            <Badge v-if="folder.unreadCount > 0" variant="secondary">{{ folder.unreadCount }}</Badge>
          </button>
        </template>

        <div class="mt-2 px-2 text-xs font-medium uppercase text-muted-foreground">Feeds</div>
        <template v-if="feedsQuery.isPending.value">
          <div class="px-2 py-1.5 text-sm text-muted-foreground">Loading…</div>
        </template>
        <template v-else>
          <button
            v-for="feed in feedsQuery.data.value"
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
            <Badge v-if="feed.unreadCount > 0" variant="secondary">{{ feed.unreadCount }}</Badge>
          </button>
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
        <Button type="submit" size="icon" class="size-8 shrink-0" :disabled="addFeed.isPending.value">
          <Loader2 v-if="addFeed.isPending.value" class="animate-spin" />
          <Plus v-else />
        </Button>
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
