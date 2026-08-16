<script setup lang="ts">
import { LogOut, X } from "@lucide/vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import {
	DialogClose,
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import AsyncButton from "@/components/AsyncButton.vue";
import UiButton from "@/components/UiButton.vue";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const queryClient = useQueryClient();

const signOut = useMutation({
	mutationFn: () => auth.logout(),
	onSuccess: async () => {
		// Drop all user-specific server state so nothing stale leaks into the
		// next session (feeds, entries, settings, search, summaries, ...).
		queryClient.clear();
		emit("update:open", false);
		// Explicit navigation: the login page is a hard gate, so protected
		// content is never visible after the backend session is destroyed.
		await router.push({ name: "login" });
	},
});
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 max-h-[min(85vh,42rem)] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-2xl"
      >
        <div class="flex items-center justify-between">
          <DialogTitle class="text-lg font-semibold tracking-tight">
            {{ t("auth.signOutTitle") }}
          </DialogTitle>
          <DialogClose
            class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            :aria-label="t('settings.close')"
            :disabled="signOut.isPending.value"
          >
            <X class="size-4" />
          </DialogClose>
        </div>

        <p class="mt-3 text-sm text-muted-foreground">{{ t("auth.signOutConfirm") }}</p>

        <p v-if="signOut.isError.value" class="mt-3 text-sm text-destructive">
          {{ t("auth.signOutError") }}
        </p>

        <div class="mt-6 flex justify-end gap-2">
          <UiButton
            variant="ghost"
            size="sm"
            :disabled="signOut.isPending.value"
            @click="emit('update:open', false)"
          >
            {{ t("auth.cancel") }}
          </UiButton>
          <AsyncButton
            variant="destructive"
            size="sm"
            :loading="signOut.isPending.value"
            :disabled="signOut.isPending.value"
            @click="signOut.mutate()"
          >
            <LogOut class="size-4" />
            {{ t("auth.signOut") }}
          </AsyncButton>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
