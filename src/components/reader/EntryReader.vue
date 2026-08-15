<script setup lang="ts">
import { buildCompatibilityStyles } from "@shared/compatibility/index.ts";
import { useQuery } from "@tanstack/vue-query";
import DOMPurify from "dompurify";
import { Archive, ArrowLeft, CheckCheck, ExternalLink, Star } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { AsyncButton } from "@/components/ui/async-button";
import { Button } from "@/components/ui/button";
import { type EntryFlagsInput, useEntryMutations } from "@/composables/useEntryMutations";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useReaderStore } from "@/stores/reader";
import type { EntryDetail } from "@/types";

const props = defineProps<{ entryId: number }>();

const { t } = useI18n();
const reader = useReaderStore();
const { setFlags } = useEntryMutations();

const { data: entry, isPending } = useQuery({
	queryKey: computed(() => queryKeys.entries.detail(props.entryId)),
	queryFn: async () =>
		(await api.get<{ entry: EntryDetail }>(`/api/entries/${props.entryId}`)).entry,
});

const sanitizedHtml = computed(() => {
	if (!entry.value?.content) return "";
	return DOMPurify.sanitize(entry.value.content, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ["target", "rel"],
	});
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
	if (value && !value.isRead && !markedRead.value) {
		markedRead.value = true;
		setFlags.mutate({ entryId: value.id, flags: { isRead: true } });
	}
});

// Track which header action is in flight so only that button shows a spinner.
const pendingAction = ref<"star" | "unread" | null>(null);

function runFlagAction(action: "star" | "unread", flags: EntryFlagsInput): void {
	pendingAction.value = action;
	setFlags.mutate(
		{ entryId: props.entryId, flags },
		{
			onSettled: () => {
				pendingAction.value = null;
			},
		},
	);
}

function toggleStarred(): void {
	if (!entry.value) return;
	runFlagAction("star", { isStarred: !entry.value.isStarred });
}

function markUnread(): void {
	runFlagAction("unread", { isRead: false });
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
      <Button
        variant="ghost"
        size="icon"
        class="md:hidden"
        :title="t('reader.back')"
        @click="reader.selectEntry(null)"
      >
        <ArrowLeft class="size-4" />
      </Button>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ entry?.feed.title }}</p>
      </div>
      <AsyncButton
        variant="ghost"
        size="icon"
        :title="entry?.isStarred ? t('reader.unstar') : t('reader.star')"
        :loading="pendingAction === 'star'"
        @click="toggleStarred"
      >
        <Star class="size-4" :class="entry?.isStarred && 'fill-amber-400 text-amber-400'" />
      </AsyncButton>
      <AsyncButton
        variant="ghost"
        size="icon"
        :title="t('reader.markUnread')"
        :loading="pendingAction === 'unread'"
        @click="markUnread"
      >
        <CheckCheck class="size-4" />
      </AsyncButton>
      <AsyncButton
        variant="ghost"
        size="icon"
        :title="t('reader.archiveComingSoon')"
        disabled
      >
        <Archive class="size-4" />
      </AsyncButton>
      <Button
        variant="ghost"
        size="icon"
        :title="t('reader.openOriginal')"
        :disabled="!entry?.url"
        @click="openOriginal"
      >
        <ExternalLink class="size-4" />
      </Button>
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
            <span>·</span><span>{{ new Date(entry.publishedAt).toLocaleString() }}</span>
          </template>
        </div>

        <div
          v-if="sanitizedHtml"
          class="reader-content mt-6 text-[15px] leading-relaxed"
          v-html="sanitizedHtml"
        />
        <p v-else class="mt-6 text-sm text-muted-foreground">
          {{ entry.summary || t("reader.noContent") }}
        </p>

        <div class="mt-8 flex items-center gap-2 border-t pt-4 text-sm">
          <Button
            v-if="entry.url"
            variant="outline"
            size="sm"
            @click="openOriginal"
          >
            <ExternalLink class="size-3.5" />
            {{ t("reader.openOriginalArticle") }}
          </Button>
          <AsyncButton
            variant="outline"
            size="sm"
            :loading="pendingAction === 'star'"
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
