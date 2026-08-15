<script setup lang="ts">
import { Github } from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<template>
  <div class="flex min-h-svh items-center justify-center p-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="space-y-2 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">RSS Reader</h1>
        <p class="text-sm text-muted-foreground">
          Your personal feed reader. Sign in with GitHub to continue.
        </p>
      </div>
      <Button class="w-full" size="lg" @click="auth.login()">
        <Github class="size-4" />
        Continue with GitHub
      </Button>
    </div>
  </div>
</template>
