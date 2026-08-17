<script setup lang="ts">
import { Archive, ArrowLeft, CheckCheck, ExternalLink, Star } from "@lucide/vue";
import { buildCompatibilityStyles } from "@shared/compatibility/index.ts";
import { useQuery } from "@tanstack/vue-query";
import DOMPurify from "dompurify";

import { useColumnResize } from "@/composables/useColumnResize";
import { useEntryMutations } from "@/composables/useEntryMutations";
import { api } from "@/lib/api";
import { transformImagesToPlaceholders } from "@/lib/content";
import { queryKeys } from "@/lib/query-keys";
import { sanitizeSafeYouTubePipeline } from "@/lib/youtube";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";
import type { EntryDetail } from "@/types";

const props = defineProps<{ entryId: number }>();

const { t } = useI18n();
const reader = useReaderStore();
const settings = useSettingsStore();
const { isWide } = useColumnResize();
const {
	setFlags,
	toggleStarred: toggleStarredAction,
	toggleArchive: toggleArchiveAction,
	isPending: isFlagPending,
	closeEntry,
} = useEntryMutations();

const { data: entry, isPending } = useQuery({
	queryKey: computed(() => queryKeys.entries.detail(props.entryId)),
	queryFn: async () =>
		(await api.get<{ entry: EntryDetail }>(`/api/entries/${props.entryId}`)).entry,
});

const sanitizedHtml = computed(() => {
	if (!entry.value?.content) return "";
	// Feed `<img>` elements get a placeholder marker + lazy loading so they
	// fade in once loaded (see image reveal effect + .reader-img CSS),
	// avoiding the unloaded-image flash. Then YouTube embeds are allowed
	// through their controlled transformation. DOMPurify itself never allows
	// generic <iframe> from feed HTML.
	return transformImagesToPlaceholders(
		sanitizeSafeYouTubePipeline(entry.value.content, (raw) =>
			DOMPurify.sanitize(raw, {
				USE_PROFILES: { html: true },
				ADD_ATTR: ["target", "rel"],
			}),
		),
	);
});

// Fade images in once they actually load; on error keep the placeholder so a
// broken image doesn't flash. Uses capture-phase listeners attached to the
// rendered DOM (no inline handlers are ever produced in sanitized HTML).
const contentEl = ref<HTMLElement | null>(null);
function revealLoadedImages(): void {
	const root = contentEl.value;
	if (!root) return;
	root.querySelectorAll<HTMLImageElement>(".reader-img").forEach((img) => {
		// The browser exposes the image's intrinsic (header) dimensions via
		// naturalWidth/naturalHeight AS SOON as the header is decoded — well
		// before the whole image finishes loading. We use that early signal
		// to morph the 1:1 placeholder box to the real ratio, so the layout
		// settles while the image still streams in, rather than waiting for
		// the full `load` event.
		const applyNaturalSize = () => {
			if (img.naturalWidth > 0 && img.naturalHeight > 0) {
				img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
			}
		};
		const finish = () => {
			applyNaturalSize();
			img.classList.add("loaded");
		};

		if (img.complete) {
			finish();
			return;
		}

		// Try to grab the intrinsic size as soon as it's available (header
		// decoded), without waiting for the full load.
		applyNaturalSize();
		const timer = window.setInterval(() => {
			if (img.complete || (img.naturalWidth > 0 && img.naturalHeight > 0)) {
				applyNaturalSize();
				window.clearInterval(timer);
			}
		}, 50);

		img.addEventListener("load", finish, { once: true });
		img.addEventListener("error", finish, { once: true });
		// Stop polling past the load event.
		img.addEventListener("load", () => window.clearInterval(timer), { once: true });
		img.addEventListener("error", () => window.clearInterval(timer), { once: true });
	});
}

watch(sanitizedHtml, () => {
	// Re-run after the DOM (v-html) updates.
	requestAnimationFrame(revealLoadedImages);
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
// Opening an entry marks it read. That happens in the mutation layer via the
// explicit openEntry() command (navigation intent), NOT by watching query
// data here — so an optimistic cache change can never trigger another PATCH.

function toggleStarred(): void {
	if (!entry.value) return;
	toggleStarredAction(props.entryId, entry.value.isStarred);
}

function markUnread(): void {
	// After marking an article unread, leave the reader so the user lands back
	// on the list (mobile) / the no-article state (desktop), per spec.
	setFlags(props.entryId, { isRead: false }, () => closeEntry());
}

function toggleArchive(): void {
	if (!entry.value) return;
	toggleArchiveAction(props.entryId, entry.value.isArchived);
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
      <UiTooltip :content="t('reader.back')" side="bottom">
        <UiButton
          variant="ghost"
          size="icon"
          :class="isWide && 'hidden'"
          @click="closeEntry"
        >
          <ArrowLeft class="size-4" />
        </UiButton>
      </UiTooltip>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ entry?.feed.title }}</p>
      </div>
      <UiTooltip
        :content="`${entry?.isStarred ? t('reader.unstar') : t('reader.star')} (${settings.shortcutLabel('toggleStar')})`"
        side="bottom"
      >
        <AsyncButton
          variant="ghost"
          size="icon"
          :loading="isFlagPending(props.entryId, 'isStarred')"
          @click="toggleStarred"
        >
          <Star class="size-4" :class="entry?.isStarred && 'fill-amber-400 text-amber-400'" />
        </AsyncButton>
      </UiTooltip>
      <UiTooltip
        :content="`${t('reader.markUnread')} (${settings.shortcutLabel('toggleRead')})`"
        side="bottom"
      >
        <AsyncButton
          variant="ghost"
          size="icon"
          :loading="isFlagPending(props.entryId, 'isRead')"
          @click="markUnread"
        >
          <CheckCheck class="size-4" />
        </AsyncButton>
      </UiTooltip>
      <UiTooltip
        :content="`${reader.isArchivedView ? t('reader.unarchive') : t('reader.archive')} (${settings.shortcutLabel('toggleArchive')})`"
        side="bottom"
      >
        <AsyncButton
          variant="ghost"
          size="icon"
          :loading="isFlagPending(props.entryId, 'isArchived')"
          @click="toggleArchive"
        >
          <Archive class="size-4" />
        </AsyncButton>
      </UiTooltip>
      <UiTooltip :content="t('reader.openOriginal')" side="bottom">
        <UiButton
          variant="ghost"
          size="icon"
          :disabled="!entry?.url"
          @click="openOriginal"
        >
          <ExternalLink class="size-4" />
        </UiButton>
      </UiTooltip>
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
          ref="contentEl"
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
            :loading="isFlagPending(props.entryId, 'isStarred')"
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

