<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { X } from "lucide-vue-next";
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

const props = defineProps<{ open: boolean; feed: FeedWithCounts | null }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const queryClient = useQueryClient();

const url = ref("");
watch(
	() => props.feed,
	(feed) => {
		url.value = feed?.url ?? "";
	},
	{ immediate: true },
);

const trimmed = computed(() => url.value.trim());
const save = useMutation({
	mutationFn: () =>
		api.patch<{ ok: boolean }>(`/api/feeds/${props.feed?.id}`, { url: trimmed.value }),
	onSuccess: async () => {
		emit("update:open", false);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all }),
			queryClient.invalidateQueries({ queryKey: ["entries"] }),
		]);
	},
});
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
            {{ t("feedEdit.title") }}
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
            <label for="feed-edit-url" class="text-xs font-medium text-muted-foreground">
              {{ t("feedEdit.url") }}
            </label>
            <UiInput
              id="feed-edit-url"
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
            <AsyncButton type="submit" size="sm" :loading="save.isPending.value" :disabled="!trimmed">
              {{ t("feedEdit.save") }}
            </AsyncButton>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
