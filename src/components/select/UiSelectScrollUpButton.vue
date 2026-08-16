<script setup lang="ts">
import { ChevronUp } from "@lucide/vue";
import { SelectScrollUpButton } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <SelectScrollUpButton
    :class="cn('flex cursor-default items-center justify-center py-1', props.class)"
  >
    <ChevronUp class="h-4 w-4" />
  </SelectScrollUpButton>
</template>
