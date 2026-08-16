<script setup lang="ts">
import { Menu, Rss, Star } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";

defineProps<{ onOpenSidebar: () => void }>();

const { t } = useI18n();
const reader = useReaderStore();
</script>

<template>
  <nav
    v-show="reader.selectedEntryId === null"
    class="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t bg-background/95 backdrop-blur md:hidden"
  >
    <button
      type="button"
      class="flex flex-col items-center gap-0.5 px-6 text-xs"
      :class="reader.view.kind === 'all' ? 'text-primary' : 'text-muted-foreground'"
      @click="reader.setView({ kind: 'all' })"
    >
      <Rss class="size-5" />
      {{ t("sidebar.all") }}
    </button>
    <button
      type="button"
      class="flex flex-col items-center gap-0.5 px-6 text-xs"
      :class="cn(reader.view.kind === 'starred' && 'text-primary')"
      @click="reader.setView({ kind: 'starred' })"
    >
      <Star class="size-5" />
      {{ t("sidebar.starred") }}
    </button>
    <button
      type="button"
      class="flex flex-col items-center gap-0.5 px-6 text-xs text-muted-foreground"
      @click="onOpenSidebar"
    >
      <Menu class="size-5" />
      {{ t("sidebar.feeds") }}
    </button>
  </nav>
</template>
