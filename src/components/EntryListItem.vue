<script setup lang="ts">
import { Star } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useEntryMutations } from "@/composables/useEntryMutations";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";
import type { EntryListItem as Entry } from "@/types";

const props = defineProps<{ entry: Entry }>();

const { t } = useI18n();
const reader = useReaderStore();
const { setFlags } = useEntryMutations();
const isSelected = computed(() => reader.selectedEntryId === props.entry.id);

function toggleStarred(): void {
	setFlags.mutate({ entryId: props.entry.id, flags: { isStarred: !props.entry.isStarred } });
}
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
      <span
        class="inline-flex cursor-pointer"
        :title="entry.isStarred ? t('sidebar.unstarShortcut') : t('sidebar.starShortcut')"
        @click.stop="toggleStarred"
      >
        <Star
          class="size-3.5 shrink-0"
          :class="
            entry.isStarred
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/40 hover:text-muted-foreground'
          "
        />
      </span>
      <span
        v-if="!entry.isRead"
        class="size-2 shrink-0 rounded-full bg-primary"
        :aria-label="t('list.unread')"
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
