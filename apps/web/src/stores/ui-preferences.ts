import { defineStore } from 'pinia';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'rss-reader-theme';

const getInitialTheme = (): Theme => {
  const persisted = localStorage.getItem(THEME_STORAGE_KEY);
  return persisted === 'light' ? 'light' : 'dark';
};

export const useUiPreferencesStore = defineStore('ui-preferences', {
  state: () => ({
    theme: getInitialTheme() as Theme,
    sidebarCollapsed: false,
  }),
  actions: {
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = this.theme;
      localStorage.setItem(THEME_STORAGE_KEY, this.theme);
    },
    initializeTheme() {
      document.documentElement.dataset.theme = this.theme;
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },
  },
});
