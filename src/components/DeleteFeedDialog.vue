<script setup lang="ts">
import { Trash2, X } from "@lucide/vue";
import {
	DialogClose,
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";

defineProps<{
	open: boolean;
	/** The feed being deleted (for name display). */
	feedName: string;
	/** Whether the delete request is in flight. */
	busy: boolean;
}>();

const emit = defineEmits<{
	"update:open": [value: boolean];
	confirm: [];
}>();

const { t } = useI18n();
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-2xl"
      >
        <div class="flex items-center justify-between">
          <DialogTitle class="text-lg font-semibold tracking-tight">
            {{ t("sidebar.deleteFeedTitle") }}
          </DialogTitle>
          <DialogClose
            class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            :aria-label="t('settings.close')"
            :disabled="busy"
          >
            <X class="size-4" />
          </DialogClose>
        </div>

        <p class="mt-3 text-sm text-muted-foreground">
          {{ t("sidebar.deleteFeedConfirm", { name: feedName }) }}
        </p>

        <div class="mt-6 flex justify-end gap-2">
          <UiButton variant="ghost" size="sm" :disabled="busy" @click="emit('update:open', false)">
            {{ t("auth.cancel") }}
          </UiButton>
          <AsyncButton
            variant="destructive"
            size="sm"
            :loading="busy"
            :disabled="busy"
            @click="emit('confirm')"
          >
            <Trash2 class="size-3.5" />
            {{ t("sidebar.deleteFeed") }}
          </AsyncButton>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
