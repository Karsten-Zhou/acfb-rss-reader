<script setup lang="ts">
import {
	ScrollAreaCorner,
	ScrollAreaRoot,
	type ScrollAreaRootProps,
	ScrollAreaViewport,
} from "reka-ui";
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = withDefaults(
	defineProps<ScrollAreaRootProps & { class?: HTMLAttributes["class"] }>(),
	{
		type: "hover",
		orientation: "vertical",
		dir: "ltr",
	},
);

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;
	return delegated;
});
</script>

<template>
  <ScrollAreaRoot v-bind="delegatedProps" :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport class="h-full w-full rounded-[inherit]">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
