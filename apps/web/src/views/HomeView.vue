<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useUiPreferencesStore } from '../stores/ui-preferences';

const preferences = useUiPreferencesStore();
const { sidebarCollapsed, theme } = storeToRefs(preferences);
preferences.initializeTheme();
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <button class="ghost-button" @click="preferences.toggleSidebar()">
        {{ sidebarCollapsed ? 'Expand' : 'Collapse' }}
      </button>
      <h2>Feeds</h2>
      <p>Cloudflare-native personal reader</p>
    </aside>

    <section class="list-panel">
      <header class="toolbar">
        <h1>Unread</h1>
        <button class="ghost-button" @click="preferences.toggleTheme()">
          Theme: {{ theme }}
        </button>
      </header>
      <ul>
        <li v-for="index in 8" :key="index">Sample entry {{ index }}</li>
      </ul>
    </section>

    <article class="content-panel">
      <h2>Select an article</h2>
      <p>
        This is the baseline three-column desktop shell with a mobile-friendly stacked layout.
      </p>
    </article>
  </div>

  <nav class="bottom-nav">
    <button>Feeds</button>
    <button>Unread</button>
    <button>Saved</button>
  </nav>
</template>
