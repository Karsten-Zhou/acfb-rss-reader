<script setup lang="ts">
import { Star } from "lucide-vue-next";
import { computed } from "vue";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";
import type { EntryListItem as Entry } from "@/types";

const props = defineProps<{ entry: Entry }>();

const reader = useReaderStore();
const isSelected = computed(() => reader.selectedEntryId === props.entry.id);
</script>

<template>
  <button
    type="button"
    class="flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
    :class="cn(isSelected && 'bg-accent')"
    @click="reader.selectEntry(entry.id)"
  >
    <div class="flex items-center gap-2">
      <span
        class="min-w-0 flex-1 truncate text-sm"
        :class="entry.isRead ? 'font-normal text-muted-foreground' : 'font-semibold'"
      >
        {{ entry.title }}
      </span>
      <Star
        v-if="entry.isStarred"
        class="size-3.5 shrink-0 text-amber-400"
        aria-label="Starred"
      />
      <span
        v-if="!entry.isRead"
        class="size-2 shrink-0 rounded-full bg-primary"
        aria-label="Unread"
      />
    </div>
    <p v-if="entry.summary" class="line-clamp-2 text-xs text-muted-foreground">
      {{ entry.summary }}
    </p>
    <div class="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <span class="truncate">{{ entry.feedTitle }}</span>
      <template v-if="entry.author">
        <span>·</span>
        <span class="truncate">{{ entry.author }}</span>
      </template>
      <template v-if="entry.publishedAt">
        <span>·</span>
        <span class="shrink-0">{{ formatRelativeTime(entry.publishedAt) }}</span>
      </template>
    </div>
  </button>
</template>
