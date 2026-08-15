<script setup lang="ts">
import { Separator, type SeparatorProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = defineProps<SeparatorProps & { class?: HTMLAttributes["class"] }>();
</script>

<template>
  <Separator
    v-bind="props"
    :class="
      cn(
        'bg-border relative shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        props.class,
      )
    "
  />
</template>
