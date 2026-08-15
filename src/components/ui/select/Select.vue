<script setup lang="ts">
import {
	SelectRoot,
	type SelectRootEmits,
	type SelectRootProps,
	useForwardPropsEmits,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<SelectRootProps & { class?: HTMLAttributes["class"] }>();
const emits = defineEmits<SelectRootEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <SelectRoot v-bind="forwarded" :class="cn(props.class)">
    <slot />
  </SelectRoot>
</template>
