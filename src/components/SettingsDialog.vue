<script setup lang="ts">
import { Laptop, Moon, RotateCcw, Sun, X } from "@lucide/vue";
import { APP_REPOSITORY_URL } from "@shared/constants.ts";
import {
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";
import { LANGUAGE_PREFERENCES, type LanguagePreference } from "@/i18n";
import { APP_BUILD_TIME, APP_VERSION } from "@/lib/build-meta";
import {
	DEFAULT_SHORTCUTS,
	isModifierKey,
	SHORTCUT_ACTIONS,
	type ShortcutAction,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useNotificationsStore } from "@/stores/notifications";
import { type ThemePreference, useSettingsStore } from "@/stores/settings";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const settings = useSettingsStore();
const notifications = useNotificationsStore();

// --- Keyboard shortcut remapping ---
const capturing = ref<ShortcutAction | null>(null);

// Capture the next keypress (capture phase so the app's shortcut handler
// doesn't also fire for the same key).
useEventListener(
	window,
	"keydown",
	(event) => {
		if (!capturing.value) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (isModifierKey(event.key)) return;
		void settings.setShortcut(capturing.value, [event.key]);
		capturing.value = null;
	},
	{ capture: true },
);

watch(
	() => props.open,
	(open) => {
		if (!open) capturing.value = null;
	},
);

function startCapture(action: ShortcutAction): void {
	capturing.value = action;
}

function resetShortcut(action: ShortcutAction): void {
	void settings.setShortcut(action, DEFAULT_SHORTCUTS[action]);
}

function isDefault(action: ShortcutAction): boolean {
	const current = settings.shortcuts[action];
	const def = DEFAULT_SHORTCUTS[action];
	return current.length === def.length && current.every((key, i) => key === def[i]);
}

const themes = computed(() => [
	{ value: "system" as const, label: t("settings.themeSystem"), icon: Laptop },
	{ value: "light" as const, label: t("settings.themeLight"), icon: Sun },
	{ value: "dark" as const, label: t("settings.themeDark"), icon: Moon },
]);

const languages = LANGUAGE_PREFERENCES;

const buildDate = computed(() => new Date(APP_BUILD_TIME).toLocaleString(settings.locale));

function setTheme(value: ThemePreference): void {
	void settings.setTheme(value);
}
function setLanguage(value: LanguagePreference): void {
	void settings.setLanguage(value);
}
function setAiEnabled(value: boolean): void {
	void settings.setAiEnabled(value);
}
function setAiModel(value: string): void {
	void settings.setAiModel(value);
}

function languageLabel(lang: LanguagePreference): string {
	if (lang !== "auto") {
		return new Intl.DisplayNames([lang], { type: "language" }).of(lang) ?? lang;
	}

	return t("settings.languageAuto", [
		new Intl.DisplayNames([navigator.language], { type: "language" }).of(navigator.language) ??
			navigator.language,
	]);
}

// --- Browser notifications ---
/**
 * The switch subscribes/unsubscribes this device only. Turning it on runs
 * the subscribe flow (a user gesture, so permission is only requested here —
 * never on page load); turning it off removes this device's subscription.
 * Other devices are unaffected. The store shows toasts on failure and the
 * switch reflects the optimistic target state while busy.
 */
function toggleNotifications(value: boolean): void {
	if (value) {
		void notifications.enable();
	} else {
		void notifications.disable();
	}
}

/** Optimistic switch state: on while subscribing, off while unsubscribing. */
const notificationsSwitchValue = computed(
	() => notifications.subscribed || notifications.loading === "subscribe",
);

function notificationsHint(): string {
	if (notifications.loading === "subscribe") return t("settings.notificationsSubscribing");
	if (notifications.loading === "unsubscribe") return t("settings.notificationsDisabling");
	switch (notifications.status) {
		case "unsupported":
			return t("settings.notificationsUnsupported");
		case "permission-denied":
			return t("settings.notificationsDenied");
		case "subscribed":
			return t("settings.notificationsSubscribed");
		case "sync-failed":
			return t("settings.notificationsSyncFailed");
		default:
			return t("settings.notificationsIdle");
	}
}

/** Opening the browser's site-permission settings (no prompt, guidance only). */
function openPermissionSettings(): void {
	// `Permission.request()` is limited to some APIs; push permission can't be
	// requested non-gesture. We simply point the user at the browser's site
	// settings — no dialog here to avoid a stale/confusing prompt.
	void navigator.permissions?.query({ name: "notifications" as PermissionName })?.then((status) => {
		// No-op: browsers don't open settings programmatically; the hint
		// text already tells the user how to re-enable.
		void status;
	});
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 max-h-[min(85vh,42rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-background p-6 shadow-2xl"
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
        <DialogDescription class="sr-only">{{ t("settings.description") }}</DialogDescription>

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
          </section>

          <!-- AI summaries -->
          <section>
            <div class="flex items-center justify-between gap-4">
              <p class="text-sm font-medium">{{ t("settings.aiSummary") }}</p>
              <UiSwitch
                :model-value="settings.aiEnabled"
                :aria-label="t('settings.aiSummary')"
                @update:model-value="(value: unknown) => setAiEnabled(value === true)"
              />
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ t("settings.aiSummaryHint") }}
            </p>
            <div v-if="settings.aiEnabled" class="mt-3">
              <p class="text-xs font-medium text-muted-foreground">
                {{ t("settings.aiModel") }}
              </p>
              <UiSelect
                :model-value="settings.aiModel"
                class="mt-1"
                @update:model-value="(value: unknown) => setAiModel(String(value))"
              >
                <UiSelectTrigger :aria-label="t('settings.aiModel')">
                  <UiSelectValue :placeholder="t('settings.aiModel')" />
                </UiSelectTrigger>
                <UiSelectContent position="popper">
                  <UiSelectItem v-for="m in settings.aiModels" :key="m.key" :value="m.key">
                    {{ m.label }}
                  </UiSelectItem>
                </UiSelectContent>
              </UiSelect>
            </div>
          </section>

          <!-- Browser notifications -->
          <section>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium">{{ t("settings.notifications") }}</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ t("settings.notificationsDeviceHint") }}
                </p>
              </div>
              <UiSwitch
                :model-value="notificationsSwitchValue"
                :disabled="!notifications.supported || notifications.busy"
                :aria-label="t('settings.notifications')"
                @update:model-value="(value: unknown) => toggleNotifications(value === true)"
              />
            </div>
            <div class="mt-1 flex items-center justify-between gap-2">
              <p class="text-xs text-muted-foreground">{{ notificationsHint() }}</p>
              <a
                v-if="notifications.permission === 'denied'"
                href="#"
                class="shrink-0 text-xs text-muted-foreground underline"
                @click.prevent="openPermissionSettings"
              >
                {{ t("settings.notificationsOpenSettings") }}
              </a>
            </div>
          </section>

          <!-- Keyboard shortcuts -->
          <section>
            <p class="text-sm font-medium">{{ t("settings.shortcuts") }}</p>
            <div class="mt-2 space-y-1.5">
              <div
                v-for="action in SHORTCUT_ACTIONS"
                :key="action"
                class="flex items-center justify-between gap-3"
              >
                <span class="text-sm text-muted-foreground">
                  {{ t(`settings.shortcut_${action}`) }}
                </span>
                <div class="flex items-center gap-1.5">
                  <UiButton
                    variant="outline"
                    size="sm"
                    class="min-w-16 justify-center tabular-nums"
                    @click="startCapture(action)"
                  >
                    {{ capturing === action ? t("settings.pressKey") : settings.shortcutLabel(action) }}
                  </UiButton>
                  <UiTooltip :content="t('settings.resetShortcut')" side="top">
                    <UiButton
                      variant="ghost"
                      size="icon"
                      class="size-7"
                      :disabled="isDefault(action)"
                      @click="resetShortcut(action)"
                    >
                      <RotateCcw class="size-3.5" />
                    </UiButton>
                  </UiTooltip>
                </div>
              </div>
            </div>
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
              <GithubMarkIcon class="size-4" />
              {{ t("settings.github") }}
            </a>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
