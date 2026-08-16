<script setup lang="ts">
import { Menu } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import AppSidebar from "@/components/AppSidebar.vue";
import EntryListPane from "@/components/EntryListPane.vue";
import MobileBottomNav from "@/components/MobileBottomNav.vue";
import ReaderPane from "@/components/ReaderPane.vue";
import { cn } from "@/lib/utils";
import { useReaderStore } from "@/stores/reader";

const { t } = useI18n();
const reader = useReaderStore();
const sidebarOpen = ref(false);
</script>

<template>
  <div class="flex h-svh w-full overflow-hidden">
    <!-- Sidebar: static on desktop, off-canvas overlay on mobile -->
    <div
      class="fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 md:static md:z-auto md:translate-x-0"
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
        <ReaderPane />
      </div>
    </div>

    <MobileBottomNav @open-sidebar="sidebarOpen = true" />
  </div>
</template>
