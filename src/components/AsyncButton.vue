<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { Primitive, type PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { type ButtonVariants, buttonVariants } from "@/components/UiButton.vue";
import { cn } from "@/lib/utils";

interface Props extends PrimitiveProps {
	variant?: ButtonVariants["variant"];
	size?: ButtonVariants["size"];
	/** Show an inline spinner and disable the button while an action runs. */
	loading?: boolean;
	disabled?: boolean;
	class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
	as: "button",
	variant: "default",
	size: "default",
	loading: false,
	disabled: false,
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <Loader2 v-if="loading" class="animate-spin" aria-hidden="true" />
    <slot v-else />
  </Primitive>
</template>
