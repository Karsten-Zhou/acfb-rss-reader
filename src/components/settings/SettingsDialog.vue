<script setup lang="ts">
import { APP_REPOSITORY_URL } from "@shared/constants.ts";
import { Github, Laptop, Moon, Sun, X } from "lucide-vue-next";
import {
	DialogClose,
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { LANGUAGE_PREFERENCES, type LanguagePreference, LOCALE_LABELS } from "@/i18n";
import { APP_BUILD_TIME, APP_VERSION } from "@/lib/build-meta";
import { cn } from "@/lib/utils";
import { type ThemePreference, useSettingsStore } from "@/stores/settings";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const settings = useSettingsStore();

const themes = computed(() => [
	{ value: "light" as const, label: t("settings.themeLight"), icon: Sun },
	{ value: "dark" as const, label: t("settings.themeDark"), icon: Moon },
	{ value: "system" as const, label: t("settings.themeSystem"), icon: Laptop },
]);

const languages = LANGUAGE_PREFERENCES;

const buildDate = computed(() => new Date(APP_BUILD_TIME).toLocaleString(settings.locale));

function setTheme(value: ThemePreference): void {
	void settings.setTheme(value);
}
function setLanguage(value: LanguagePreference): void {
	void settings.setLanguage(value);
}
function languageLabel(lang: LanguagePreference): string {
	return lang === "auto" ? t("settings.languageAuto") : LOCALE_LABELS[lang];
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-2xl"
      >
        <div class="flex items-center justify-between">
          <DialogTitle class="text-lg font-semibold tracking-tight">
            {{ t("settings.title") }}
          </DialogTitle>
          <DialogClose
            class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            :aria-label="t('settings.close')"
          >
            <X class="size-4" />
          </DialogClose>
        </div>

        <div class="mt-5 space-y-6">
          <!-- Theme -->
          <section>
            <p class="text-sm font-medium">{{ t("settings.theme") }}</p>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <button
                v-for="th in themes"
                :key="th.value"
                type="button"
                class="flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-xs transition-colors"
                :class="
                  cn(
                    settings.theme === th.value
                      ? 'border-primary bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )
                "
                @click="setTheme(th.value)"
              >
                <component :is="th.icon" class="size-4" />
                {{ th.label }}
              </button>
            </div>
          </section>

          <!-- Language -->
          <section>
            <p class="text-sm font-medium">{{ t("settings.language") }}</p>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <button
                v-for="lang in languages"
                :key="lang"
                type="button"
                class="rounded-md border px-2 py-2 text-xs transition-colors"
                :class="
                  cn(
                    settings.language === lang
                      ? 'border-primary bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )
                "
                @click="setLanguage(lang)"
              >
                {{ languageLabel(lang) }}
              </button>
            </div>
            <p
              v-if="settings.language === 'auto'"
              class="mt-1.5 text-xs text-muted-foreground"
            >
              {{ t("settings.languageAutoHint", { locale: settings.locale }) }}
            </p>
          </section>

          <!-- About -->
          <section class="border-t pt-4">
            <p class="text-sm font-medium">{{ t("settings.about") }}</p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between gap-4">
                <dt class="text-muted-foreground">{{ t("settings.version") }}</dt>
                <dd class="tabular-nums">v{{ APP_VERSION }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt class="text-muted-foreground">{{ t("settings.builtAt") }}</dt>
                <dd class="truncate tabular-nums">{{ buildDate }}</dd>
              </div>
            </dl>
            <a
              :href="APP_REPOSITORY_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Github class="size-4" />
              {{ t("settings.github") }}
            </a>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
