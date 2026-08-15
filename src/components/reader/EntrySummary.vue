<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { RefreshCw, Sparkles } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { AsyncButton } from "@/components/ui/async-button";
import { ApiError, api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settings";

const props = defineProps<{ entryId: number }>();

const { t } = useI18n();
const settings = useSettingsStore();
const queryClient = useQueryClient();

const lang = computed(() => settings.locale);

interface SummaryResponse {
	summary: string | null;
	model: string | null;
	modelLabel: string | null;
	enabled: boolean;
}

/** Whether the user enabled AI summaries. Read from the store so the box
 * renders immediately (no deferred pop-in) and hides when toggled off. */
const enabled = computed(() => settings.aiEnabled);

const cachedQuery = useQuery({
	queryKey: computed(() => ["entries", "summary", "cached", props.entryId, lang.value]),
	queryFn: async () =>
		await api.get<SummaryResponse>(
			`/api/entries/${props.entryId}/summary?lang=${encodeURIComponent(lang.value)}`,
		),
});

const summary = computed(() => cachedQuery.data.value?.summary ?? null);
const modelLabel = computed(() => cachedQuery.data.value?.modelLabel ?? null);

const errorCode = ref<string | null>(null);

const generate = useMutation({
	mutationFn: () =>
		api.post<SummaryResponse>(`/api/entries/${props.entryId}/summary`, { lang: lang.value }),
	onMutate: () => {
		errorCode.value = null;
	},
	onSuccess: (data) => {
		queryClient.setQueryData(["entries", "summary", "cached", props.entryId, lang.value], data);
	},
	onError: (err) => {
		errorCode.value = err instanceof ApiError ? err.code : "UNKNOWN";
	},
});

/** True while the cached summary loads or a summary is being generated. */
const isLoading = computed(() => cachedQuery.isPending.value || generate.isPending.value);

/** Reset per article/language so each article auto-generates at most once. */
const autoStarted = ref(false);
watch(
	[() => props.entryId, lang],
	() => {
		autoStarted.value = false;
	},
	{ immediate: true },
);

/** Auto-generate when enabled and there is no cached summary yet. */
watch(
	[
		enabled,
		() => cachedQuery.data.value?.summary,
		() => cachedQuery.isSuccess.value,
		() => generate.isPending.value,
		() => autoStarted.value,
	],
	([isEnabled, cached, isSuccess, isGenerating, started]) => {
		if (isEnabled && isSuccess && !cached && !isGenerating && !started) {
			autoStarted.value = true;
			generate.mutate();
		}
	},
	{ immediate: true },
);
</script>

<template>
  <div v-if="enabled" class="mt-5 rounded-lg border border-primary/25 bg-accent/40 p-3">
    <div class="flex items-center gap-2">
      <Sparkles class="size-4 shrink-0 text-primary" />
      <p class="text-sm font-semibold">{{ t("summary.title") }}</p>
      <div class="flex-1" />
      <AsyncButton
        v-if="(summary || errorCode) && !isLoading"
        variant="ghost"
        size="sm"
        :loading="generate.isPending.value"
        @click="generate.mutate()"
      >
        <RefreshCw class="size-3.5" />
        {{ t("summary.regenerate") }}
      </AsyncButton>
    </div>

    <!-- Gentle skeleton while the cached summary loads or is generated. -->
    <div v-if="isLoading" class="mt-3 space-y-1.5" aria-busy="true">
      <p class="text-xs text-muted-foreground">{{ t("summary.generating") }}</p>
      <div class="h-3 w-full animate-pulse rounded bg-muted-foreground/20" />
      <div class="h-3 w-11/12 animate-pulse rounded bg-muted-foreground/20" />
      <div class="h-3 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
    </div>

    <p v-else-if="summary" class="mt-2 text-sm leading-relaxed">{{ summary }}</p>
    <p v-else-if="errorCode === 'DISABLED'" class="mt-2 text-sm text-muted-foreground">
      {{ t("summary.disabled") }}
    </p>
    <p v-else-if="errorCode" class="mt-2 text-sm text-destructive">{{ t("summary.error") }}</p>
    <AsyncButton
      v-else
      variant="outline"
      size="sm"
      class="mt-2"
      :loading="generate.isPending.value"
      @click="generate.mutate()"
    >
      <Sparkles class="size-3.5" />
      {{ t("summary.generate") }}
    </AsyncButton>

    <p v-if="modelLabel && !isLoading" class="mt-2 text-xs text-muted-foreground">
      {{ t("summary.model") }}: {{ modelLabel }}
    </p>
  </div>
</template>
