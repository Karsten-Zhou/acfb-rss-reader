<script setup lang="ts">
import { Search } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import EntryList from "@/components/EntryList.vue";
import UiInput from "@/components/UiInput.vue";
import UiTooltip from "@/components/UiTooltip.vue";
import { useColumnResize } from "@/composables/useColumnResize";
import { useEntryListQuery } from "@/composables/useEntryListQuery";
import { useEntryMutations } from "@/composables/useEntryMutations";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";

const { t } = useI18n();
const reader = useReaderStore();
const settings = useSettingsStore();
const { isWide, listWidth } = useColumnResize();
const { data } = useEntryListQuery();
const {
	openEntry,
	toggleRead: toggleReadAction,
	toggleStarred: toggleStarredAction,
	toggleArchive: toggleArchiveAction,
} = useEntryMutations();

const items = computed(() => data.value?.pages.flatMap((page) => page.items) ?? []);
const selected = computed(() => items.value.find((item) => item.id === reader.selectedEntryId));
const currentIndex = computed(() =>
	items.value.findIndex((item) => item.id === reader.selectedEntryId),
);

function moveSelection(delta: number): void {
	if (items.value.length === 0) return;
	let next =
		currentIndex.value === -1
			? delta > 0
				? 0
				: items.value.length - 1
			: currentIndex.value + delta;
	next = Math.max(0, Math.min(items.value.length - 1, next));
	const entry = items.value[next];
	if (entry) openEntry(entry.id, entry.isRead);
}

function toggleStarred(): void {
	if (!selected.value) return;
	toggleStarredAction(selected.value.id, selected.value.isStarred);
}
function toggleRead(): void {
	if (!selected.value) return;
	toggleReadAction(selected.value.id, selected.value.isRead);
}
function toggleArchive(): void {
	if (!selected.value) return;
	toggleArchiveAction(selected.value.id, selected.value.isArchived);
}

// Bindings are read reactively so remapping in Settings takes effect live.
useKeyboardShortcuts(() => [
	{
		keys: settings.shortcuts.moveDown,
		handler: () => moveSelection(1),
		preventDefault: true,
	},
	{ keys: settings.shortcuts.moveUp, handler: () => moveSelection(-1), preventDefault: true },
	{ keys: settings.shortcuts.toggleStar, handler: toggleStarred },
	{ keys: settings.shortcuts.toggleRead, handler: toggleRead },
	{ keys: settings.shortcuts.toggleArchive, handler: toggleArchive },
]);
</script>

<template>
  <section
    :class="
      cn(
        'w-full min-w-0 flex-col',
        // Below the three-column threshold, selecting an article shows the
        // reader full-width; at wide widths both panes stay visible.
        reader.selectedEntryId !== null && !isWide ? 'hidden' : 'flex',
        isWide && 'shrink-0',
        // In wide mode the resize handle draws the single divider line, so
        // the list must not add its own border-r (would be a duplicated,
        // offset segmenting line). It is kept for the 2-column layout.
        !isWide && 'border-r',
      )
    "
    :style="isWide ? { width: `${listWidth}px`, flex: '0 0 auto' } : undefined"
  >
    <div class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <div class="relative min-w-0 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <UiInput
          v-model="reader.searchQuery"
          :placeholder="t('list.searchPlaceholder')"
          class="h-8 pl-8 text-sm"
        />
      </div>
      <UiTooltip :content="t('list.onlyUnread')" side="bottom">
        <button
          type="button"
          class="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          :class="reader.showUnreadOnly && 'bg-accent text-foreground'"
          @click="reader.showUnreadOnly = !reader.showUnreadOnly"
        >
          {{ t("list.unread") }}
        </button>
      </UiTooltip>
    </div>

    <EntryList />
  </section>
</template>
