<script setup lang="ts">
import { X } from "@lucide/vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import {
	DialogClose,
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import AsyncButton from "@/components/AsyncButton.vue";
import UiButton from "@/components/UiButton.vue";
import UiInput from "@/components/UiInput.vue";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { FeedWithCounts } from "@/types";

const props = defineProps<{
	open: boolean;
	mode: "add" | "edit";
	/** The feed being edited; only used in edit mode. */
	feed: FeedWithCounts | null;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const queryClient = useQueryClient();

const title = ref("");
const url = ref("");
watch(
	() => [props.open, props.feed, props.mode] as const,
	() => {
		if (props.mode === "edit") {
			title.value = props.feed?.title ?? "";
			url.value = props.feed?.url ?? "";
		} else {
			title.value = "";
			url.value = "";
		}
	},
	{ immediate: true },
);

const trimmedTitle = computed(() => title.value.trim());
const trimmedUrl = computed(() => url.value.trim());
const canSave = computed(() => trimmedUrl.value.length > 0);

const save = useMutation({
	mutationFn: async () => {
		if (props.mode === "edit") {
			const patch: Record<string, string> = {};
			if (trimmedTitle.value && trimmedTitle.value !== props.feed?.title) {
				patch.title = trimmedTitle.value;
			}
			if (trimmedUrl.value !== props.feed?.url) patch.url = trimmedUrl.value;
			if (Object.keys(patch).length === 0) return; // nothing changed
			await api.patch<{ ok: boolean }>(`/api/feeds/${props.feed?.id}`, patch);
		} else {
			await api.post<{ feed: FeedWithCounts }>("/api/feeds", {
				url: trimmedUrl.value,
				...(trimmedTitle.value ? { title: trimmedTitle.value } : {}),
			});
		}
	},
	onSuccess: async () => {
		emit("update:open", false);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
			queryClient.invalidateQueries({ queryKey: ["entries"] }),
		]);
	},
});

const isAdd = computed(() => props.mode === "add");
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
            {{ isAdd ? t("feedEdit.addTitle") : t("feedEdit.editTitle") }}
          </DialogTitle>
          <DialogClose
            class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            :aria-label="t('settings.close')"
          >
            <X class="size-4" />
          </DialogClose>
        </div>

        <form class="mt-4 space-y-4" @submit.prevent="save.mutate()">
          <div>
            <label for="feed-dialog-title" class="text-xs font-medium text-muted-foreground">
              {{ t("feedEdit.name") }}
            </label>
            <UiInput
              id="feed-dialog-title"
              v-model="title"
              class="mt-1"
              :placeholder="t('feedEdit.namePlaceholder')"
            />
          </div>
          <div>
            <label for="feed-dialog-url" class="text-xs font-medium text-muted-foreground">
              {{ t("feedEdit.url") }}
            </label>
            <UiInput
              id="feed-dialog-url"
              v-model="url"
              class="mt-1"
              :placeholder="t('sidebar.addFeedPlaceholder')"
            />
          </div>
          <p v-if="save.isError.value" class="text-sm text-destructive">
            {{ t("feedEdit.error") }}
          </p>
          <div class="flex justify-end gap-2">
            <UiButton variant="ghost" size="sm" @click="emit('update:open', false)">
              {{ t("feedEdit.cancel") }}
            </UiButton>
            <AsyncButton type="submit" size="sm" :loading="save.isPending.value" :disabled="!canSave">
              {{ t("feedEdit.save") }}
            </AsyncButton>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
