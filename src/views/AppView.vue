<script setup lang="ts">
import { Menu } from "@lucide/vue";

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
        <UiTooltip :content="t('sidebar.menu')" side="bottom">
          <button
            type="button"
            class="rounded p-1 hover:bg-accent"
            @click="sidebarOpen = true"
          >
            <Menu class="size-5" />
          </button>
        </UiTooltip>
        <span class="text-sm font-semibold tracking-tight">{{ t("app.name") }}</span>
      </header>

      <div
        class="relative flex min-h-0 flex-1 md:pb-0"
        :class="cn(reader.selectedEntryId === null && 'pb-14')"
      >
        <EntryListPane />
        <!-- Resize handle: the interactive hit area is an absolute overlay
             centered on the boundary between list and reader, so the two
             panes abut with no visible gap. The 1px divider (highlighted on
             hover/drag) is drawn by this handle on top of the boundary. -->
        <button
          v-if="isWide"
          type="button"
          role="separator"
          aria-orientation="vertical"
          :aria-valuenow="listWidth"
          :aria-valuemin="256"
          :aria-valuemax="512"
          class="group absolute z-10 top-0 bottom-0 hidden cursor-col-resize touch-none select-none outline-none md:block"
          :style="{ left: `${listWidth - COLUMN_HANDLE_WIDTH / 2}px`, width: `${COLUMN_HANDLE_WIDTH}px` }"
          @pointerdown.prevent="beginDrag($event)"
          @keydown="onHandleKey($event)"
        >
          <span
            class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-all group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary/60"
          />
          <UiTooltip :content="t('layout.resizeList')" side="right">
            <span class="absolute inset-0" />
          </UiTooltip>
        </button>
        <ReaderPane />
      </div>
    </div>

    <MobileBottomNav @open-sidebar="sidebarOpen = true" />
  </div>
</template>
