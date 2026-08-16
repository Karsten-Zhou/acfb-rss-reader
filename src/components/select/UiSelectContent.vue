<script setup lang="ts">
import {
	SelectContent,
	type SelectContentEmits,
	type SelectContentProps,
	SelectPortal,
	SelectViewport,
	useForwardPropsEmits,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import UiSelectScrollDownButton from "./UiSelectScrollDownButton.vue";
import UiSelectScrollUpButton from "./UiSelectScrollUpButton.vue";

const props = defineProps<SelectContentProps & { class?: HTMLAttributes["class"] }>();
const emits = defineEmits<SelectContentEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <!-- Teleport to <body> so the popper is not trapped inside a transformed
       ancestor (e.g. the centered settings dialog), which would break the
       fixed-positioning anchor and show the dropdown at the wrong spot. -->
  <SelectPortal>
    <SelectContent
      v-bind="forwarded"
      :class="
        cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
          props.class,
        )
      "
    >
      <UiSelectScrollUpButton />
      <SelectViewport class="p-1">
        <slot />
      </SelectViewport>
      <UiSelectScrollDownButton />
    </SelectContent>
  </SelectPortal>
</template>
