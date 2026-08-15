<script setup lang="ts">
import { AvatarRoot, type AvatarRootProps } from "reka-ui";
import { computed, type HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = withDefaults(
	defineProps<
		AvatarRootProps & {
			class?: HTMLAttributes["class"];
			shape?: "circle" | "square";
			size?: "xs" | "sm" | "md" | "lg";
		}
	>(),
	{
		shape: "circle",
		size: "sm",
	},
);

const delegatedProps = computed(() => {
	const { class: _, shape: __, size: ___, ...delegated } = props;
	return delegated;
});
</script>

<template>
  <AvatarRoot
    v-bind="delegatedProps"
    :class="
      cn(
        'relative flex shrink-0 overflow-hidden rounded-full',
        size === 'xs' && 'size-6',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-10',
        size === 'lg' && 'size-12',
        shape === 'square' && 'rounded-lg',
        props.class,
      )
    "
  >
    <slot />
  </AvatarRoot>
</template>
