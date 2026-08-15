<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { SelectScrollDownButton } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <SelectScrollDownButton
    :class="cn('flex cursor-default items-center justify-center py-1', props.class)"
  >
    <ChevronDown class="h-4 w-4" />
  </SelectScrollDownButton>
</template>
