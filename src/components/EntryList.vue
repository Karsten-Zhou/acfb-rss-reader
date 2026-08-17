<script setup lang="ts">
import { Loader2, RefreshCw } from "@lucide/vue";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/index.css";

import { useEntryListQuery } from "@/composables/useEntryListQuery";

const { t } = useI18n();
const { data, isFetching, hasNextPage, fetchNextPage, isPending, refetch } = useEntryListQuery();

const items = computed(() => data.value?.pages.flatMap((page) => page.items) ?? []);

function onScrollerUpdate(_startIndex: number, endIndex: number): void {
	if (hasNextPage.value && endIndex >= items.value.length - 5) {
		fetchNextPage();
	}
}

async function refreshView(): Promise<void> {
	await refetch();
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="isPending" class="flex flex-1 items-center justify-center">
      <Loader2 class="size-5 animate-spin text-muted-foreground" />
    </div>

    <RecycleScroller
      v-else-if="items.length > 0"
      class="min-h-0 flex-1"
      :items="items"
      :item-size="96"
      key-field="id"
      :buffer="200"
      :emit-update="true"
      @update="onScrollerUpdate"
    >
      <template #default="{ item }">
        <EntryListItem :entry="item" />
      </template>
    </RecycleScroller>

    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p class="text-sm text-muted-foreground">{{ t("list.noArticles") }}</p>
      <button
        v-if="!isFetching"
        class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        @click="refreshView"
      >
        <RefreshCw class="size-3.5" />
        {{ t("list.refresh") }}
      </button>
    </div>

    <div v-if="isFetching" class="flex items-center justify-center border-t py-1.5">
      <Loader2 class="size-4 animate-spin text-muted-foreground" />
    </div>
  </div>
</template>
