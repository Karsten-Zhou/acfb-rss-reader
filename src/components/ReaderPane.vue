<script setup lang="ts">
import { BookOpen } from "@lucide/vue";
import { useI18n } from "vue-i18n";

import EntryReader from "@/components/EntryReader.vue";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";

const { t } = useI18n();
const reader = useReaderStore();
</script>

<template>
  <section
    :class="
      cn(
        'min-w-0 flex-1 flex-col',
        reader.selectedEntryId !== null ? 'flex' : 'hidden md:flex',
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
