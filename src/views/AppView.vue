<script setup lang="ts">
import { Menu } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import AppSidebar from "@/components/AppSidebar.vue";
import EntryListPane from "@/components/EntryListPane.vue";
import MobileBottomNav from "@/components/MobileBottomNav.vue";
import ReaderPane from "@/components/ReaderPane.vue";
import { COLUMN_HANDLE_WIDTH, useColumnResize } from "@/composables/useColumnResize";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";

const { t } = useI18n();
const reader = useReaderStore();
const sidebarOpen = ref(false);

const { isWide, listWidth, beginDrag, onHandleKey } = useColumnResize();
</script>

<template>
  <div class="flex h-svh w-full overflow-hidden">
    <!-- Sidebar: off-canvas overlay below md; static (fixed width) at wide widths -->
    <div
      class="fixed inset-y-0 left-0 z-50 w-64 shrink-0 transition-transform duration-200 md:static md:z-auto md:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <AppSidebar @close="sidebarOpen = false" />
    </div>
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-black/50 md:hidden"
      @click="sidebarOpen = false"
    />

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Mobile top bar -->
      <header
        class="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:hidden"
        :class="cn(reader.selectedEntryId !== null && 'hidden')"
      >
        <button
          type="button"
          class="rounded p-1 hover:bg-accent"
          :title="t('sidebar.menu')"
          @click="sidebarOpen = true"
        >
          <Menu class="size-5" />
        </button>
        <span class="text-sm font-semibold tracking-tight">{{ t("app.name") }}</span>
      </header>

      <div class="flex min-h-0 flex-1 pb-14 md:pb-0">
        <EntryListPane />
        <!-- Resize handle: list | reader (thin divider, highlighted on hover/drag) -->
        <button
          v-if="isWide"
          type="button"
          role="separator"
          aria-orientation="vertical"
          :aria-valuenow="listWidth"
          :aria-valuemin="256"
          :aria-valuemax="512"
          class="group relative z-10 hidden shrink-0 cursor-col-resize touch-none select-none bg-transparent outline-none md:block"
          :style="{ width: `${COLUMN_HANDLE_WIDTH}px` }"
          :title="t('layout.resizeList')"
          @pointerdown.prevent="beginDrag($event)"
          @keydown="onHandleKey($event)"
        >
          <span
            class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-all group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary/60"
          />
        </button>
        <ReaderPane />
      </div>
    </div>

    <MobileBottomNav @open-sidebar="sidebarOpen = true" />
  </div>
</template>
