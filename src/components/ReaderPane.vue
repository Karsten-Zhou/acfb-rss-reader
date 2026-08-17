<script setup lang="ts">
import { BookOpen } from "@lucide/vue";

import { useColumnResize } from "@/composables/useColumnResize";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";

const { t } = useI18n();
const reader = useReaderStore();
const { isWide } = useColumnResize();
</script>

<template>
  <section
    :class="
      cn(
        'min-w-0 flex-1 flex-col',
        // An open article always gets the reader; the placeholder shows only
        // when there is room for it next to the list (three-column layout).
        reader.selectedEntryId !== null ? 'flex' : isWide ? 'flex' : 'hidden',
      )
    "
  >
    <EntryReader
      v-if="reader.selectedEntryId !== null"
      :entry-id="reader.selectedEntryId"
    />
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <BookOpen class="size-8 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground">{{ t("reader.selectArticle") }}</p>
    </div>
  </section>
</template>
