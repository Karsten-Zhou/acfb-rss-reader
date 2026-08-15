<script setup lang="ts">
import { Search } from "lucide-vue-next";
import { computed } from "vue";

import EntryList from "@/components/entries/EntryList.vue";
import { Input } from "@/components/ui/input";
import { useEntryListQuery } from "@/composables/useEntryListQuery";
import { useEntryMutations } from "@/composables/useEntryMutations";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";

const reader = useReaderStore();
const { data } = useEntryListQuery();
const { setFlags } = useEntryMutations();

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
	if (entry) reader.selectEntry(entry.id);
}

function toggleStarred(): void {
	if (selected.value) {
		setFlags.mutate({
			entryId: selected.value.id,
			flags: { isStarred: !selected.value.isStarred },
		});
	}
}
function toggleRead(): void {
	if (selected.value) {
		setFlags.mutate({ entryId: selected.value.id, flags: { isRead: !selected.value.isRead } });
	}
}
function archiveSelected(): void {
	if (selected.value) {
		setFlags.mutate({ entryId: selected.value.id, flags: { isArchived: true } });
	}
}

useKeyboardShortcuts([
	{ keys: ["j", "ArrowDown"], handler: () => moveSelection(1), preventDefault: true },
	{ keys: ["k", "ArrowUp"], handler: () => moveSelection(-1), preventDefault: true },
	{ keys: ["s"], handler: toggleStarred },
	{ keys: ["m"], handler: toggleRead },
	{ keys: ["a"], handler: archiveSelected },
]);
</script>

<template>
  <section
    :class="
      cn(
        'w-full min-w-0 flex-col border-r md:w-96 lg:w-[26rem]',
        reader.selectedEntryId !== null ? 'hidden md:flex' : 'flex',
      )
    "
  >
    <div class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <div class="relative min-w-0 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="reader.searchQuery" placeholder="Search articles…" class="h-8 pl-8 text-sm" />
      </div>
      <button
        type="button"
        class="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        :class="reader.showUnreadOnly && 'bg-accent text-foreground'"
        title="Only unread"
        @click="reader.showUnreadOnly = !reader.showUnreadOnly"
      >
        Unread
      </button>
    </div>

    <EntryList />
  </section>
</template>
