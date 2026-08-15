<script setup lang="ts">
import {
	SelectContent,
	type SelectContentEmits,
	type SelectContentProps,
	SelectViewport,
	useForwardPropsEmits,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import SelectScrollDownButton from "./SelectScrollDownButton.vue";
import SelectScrollUpButton from "./SelectScrollUpButton.vue";

const props = defineProps<SelectContentProps & { class?: HTMLAttributes["class"] }>();
const emits = defineEmits<SelectContentEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <SelectContent
    v-bind="forwarded"
    :class="
      cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
        props.class,
      )
    "
  >
    <SelectScrollUpButton />
    <SelectViewport class="p-1">
      <slot />
    </SelectViewport>
    <SelectScrollDownButton />
  </SelectContent>
</template>
