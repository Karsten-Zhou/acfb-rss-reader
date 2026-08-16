<script setup lang="ts">
import { Archive, ArrowLeft, CheckCheck, ExternalLink, Star } from "@lucide/vue";
import { buildCompatibilityStyles } from "@shared/compatibility/index.ts";
import { useQuery } from "@tanstack/vue-query";
import DOMPurify from "dompurify";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import AsyncButton from "@/components/AsyncButton.vue";
import UiButton from "@/components/UiButton.vue";
import { useColumnResize } from "@/composables/useColumnResize";
import { useEntryMutations } from "@/composables/useEntryMutations";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { sanitizeSafeYouTubePipeline } from "@/lib/youtube";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";
import type { EntryDetail } from "@/types";

import EntrySummary from "./EntrySummary.vue";

const props = defineProps<{ entryId: number }>();

const { t } = useI18n();
const reader = useReaderStore();
const settings = useSettingsStore();
const { isWide } = useColumnResize();
const { setFlags, runFlagAction } = useEntryMutations();

const { data: entry, isPending } = useQuery({
	queryKey: computed(() => queryKeys.entries.detail(props.entryId)),
	queryFn: async () =>
		(await api.get<{ entry: EntryDetail }>(`/api/entries/${props.entryId}`)).entry,
});

const sanitizedHtml = computed(() => {
	if (!entry.value?.content) return "";
	// YouTube embeds are allowed through a controlled transformation: source
	// iframes are replaced with markers, sanitized, then re-expanded into
	// our own youtube-nocookie.com iframes. DOMPurify itself never allows
	// generic <iframe> from feed HTML.
	return sanitizeSafeYouTubePipeline(entry.value.content, (raw) =>
		DOMPurify.sanitize(raw, {
			USE_PROFILES: { html: true },
			ADD_ATTR: ["target", "rel"],
		}),
	);
});

// Inject site compatibility CSS (e.g. Steam) for the rendered content.
const COMPAT_STYLE_ID = "rss-reader-compat-css";
const compatCss = computed(() => {
	if (!entry.value) return "";
	const urls = [entry.value.url, entry.value.feed.siteUrl].filter((u): u is string => Boolean(u));
	return buildCompatibilityStyles(urls);
});

watch(compatCss, (css) => {
	if (!css) return;
	let el = document.getElementById(COMPAT_STYLE_ID) as HTMLStyleElement | null;
	if (!el) {
		el = document.createElement("style");
		el.id = COMPAT_STYLE_ID;
		document.head.appendChild(el);
	}
	el.textContent = css;
});
// Opening an entry marks it read (only once per selection).
const markedRead = ref(false);
watch(
	() => props.entryId,
	() => {
		markedRead.value = false;
	},
);
watch(entry, (value) => {
	if (!value || value.isRead) return;
	// Only auto-mark an article read when the user hasn't taken control of its
	// read state (e.g. via Mark unread), to avoid a conflicting second PATCH.
	if (reader.readControlledIds.has(value.id)) return;
	if (markedRead.value) return;
	markedRead.value = true;
	setFlags.mutate({ entryId: value.id, flags: { isRead: true } });
});

// Track which header action is in flight so only that button shows a spinner.
// Stored on the reader store so keyboard-triggered actions (in EntryListPane)
// also light up the matching button.
// runFlagAction marks the entry as read-controlled so the auto-mark-read
// watcher won't fire a conflicting second PATCH after an optimistic change.

function toggleStarred(): void {
	if (!entry.value) return;
	runFlagAction("star", props.entryId, { isStarred: !entry.value.isStarred });
}

function markUnread(): void {
	// After marking an article unread, leave the reader so the user lands back
	// on the list (mobile) / the no-article state (desktop), per spec.
	runFlagAction("unread", props.entryId, { isRead: false }, () => {
		reader.selectEntry(null);
	});
}

function toggleArchive(): void {
	if (!entry.value) return;
	runFlagAction("archive", props.entryId, { isArchived: !entry.value.isArchived });
}

function openOriginal(): void {
	if (entry.value?.url) {
		window.open(entry.value.url, "_blank", "noopener,noreferrer");
	}
}
</script>

<template>
  <article class="flex h-full min-w-0 flex-col">
    <header class="flex h-12 shrink-0 items-center gap-1 border-b px-3">
      <UiButton
        variant="ghost"
        size="icon"
        :class="isWide && 'hidden'"
        :title="t('reader.back')"
        @click="reader.selectEntry(null)"
      >
        <ArrowLeft class="size-4" />
      </UiButton>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ entry?.feed.title }}</p>
      </div>
      <AsyncButton
        variant="ghost"
        size="icon"
        :title="
          `${entry?.isStarred ? t('reader.unstar') : t('reader.star')} (${settings.shortcutLabel('toggleStar')})`
        "
        :loading="reader.pendingAction === 'star'"
        @click="toggleStarred"
      >
        <Star class="size-4" :class="entry?.isStarred && 'fill-amber-400 text-amber-400'" />
      </AsyncButton>
      <AsyncButton
        variant="ghost"
        size="icon"
        :title="`${t('reader.markUnread')} (${settings.shortcutLabel('toggleRead')})`"
        :loading="reader.pendingAction === 'unread'"
        @click="markUnread"
      >
        <CheckCheck class="size-4" />
      </AsyncButton>
      <AsyncButton
        variant="ghost"
        size="icon"
        :title="
          `${reader.isArchivedView ? t('reader.unarchive') : t('reader.archive')} (${settings.shortcutLabel('toggleArchive')})`
        "
        :loading="reader.pendingAction === 'archive'"
        @click="toggleArchive"
      >
        <Archive class="size-4" />
      </AsyncButton>
      <UiButton
        variant="ghost"
        size="icon"
        :title="t('reader.openOriginal')"
        :disabled="!entry?.url"
        @click="openOriginal"
      >
        <ExternalLink class="size-4" />
      </UiButton>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="isPending" class="flex h-full items-center justify-center">
        <p class="text-sm text-muted-foreground">{{ t("reader.loading") }}</p>
      </div>
      <div v-else-if="entry" class="mx-auto max-w-3xl px-6 py-8">
        <h1 class="text-2xl font-semibold leading-snug tracking-tight">{{ entry.title }}</h1>
        <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <a
            v-if="entry.url"
            :href="entry.url"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-primary hover:underline"
          >
            {{ entry.feed.title }}
          </a>
          <template v-if="entry.author">
            <span>·</span><span>{{ entry.author }}</span>
          </template>
          <template v-if="entry.publishedAt">
            <span>·</span><span>{{ new Date(entry.publishedAt).toLocaleString(settings.locale) }}</span>
          </template>
        </div>

        <EntrySummary :entry-id="props.entryId" />

        <div
          v-if="sanitizedHtml"
          class="reader-content mt-6 text-[15px] leading-relaxed"
          v-html="sanitizedHtml"
        />
        <p v-else class="mt-6 text-sm text-muted-foreground">
          {{ entry.summary || t("reader.noContent") }}
        </p>

        <div class="mt-8 flex items-center gap-2 border-t pt-4 text-sm">
          <UiButton
            v-if="entry.url"
            variant="outline"
            size="sm"
            @click="openOriginal"
          >
            <ExternalLink class="size-3.5" />
            {{ t("reader.openOriginalArticle") }}
          </UiButton>
          <AsyncButton
            variant="outline"
            size="sm"
            :loading="reader.pendingAction === 'star'"
            @click="toggleStarred"
          >
            <Star class="size-3.5" :class="entry.isStarred && 'fill-amber-400 text-amber-400'" />
            {{ entry.isStarred ? t("reader.unstar") : t("reader.star") }}
          </AsyncButton>
        </div>
      </div>
    </div>
  </article>
</template>
