<script setup lang="ts">
import { Github } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

import UiButton from "@/components/UiButton.vue";
import { useAuthStore } from "@/stores/auth";

const { t } = useI18n();
const auth = useAuthStore();
</script>

<template>
  <div class="flex min-h-svh items-center justify-center p-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="space-y-2 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">{{ t("app.name") }}</h1>
        <p class="text-sm text-muted-foreground">{{ t("login.subtitle") }}</p>
      </div>
      <UiButton class="w-full" size="lg" @click="auth.login()">
        <Github class="size-4" />
        {{ t("login.continue") }}
      </UiButton>
    </div>
  </div>
</template>
