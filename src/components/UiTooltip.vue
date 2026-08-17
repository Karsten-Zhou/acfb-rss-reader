<script setup lang="ts">
import {
	TooltipContent,
	TooltipPortal,
	TooltipProvider,
	TooltipRoot,
	TooltipTrigger,
} from "reka-ui";
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

interface Props {
	/** What to show in the tooltip. */
	content: string;
	side?: "top" | "right" | "bottom" | "left";
	align?: "start" | "center" | "end";
	/** Delay (ms) before the tooltip appears on hover. */
	delayDuration?: number;
	contentClass?: HTMLAttributes["class"];
}

withDefaults(defineProps<Props>(), {
	side: "top",
	align: "center",
	delayDuration: 400,
});
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration" :skip-delay-duration="300">
    <TooltipRoot :delay-duration="delayDuration">
      <!-- as-child makes the trigger BE the slotted element (the button), so
           the whole button is hoverable and the tooltip has a single stop.
           Callers must wrap the ENTIRE button in <UiTooltip>, not the icon. -->
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :align="align"
          :side-offset="6"
          :class="
            cn(
              'ui-tooltip z-50 max-w-xs rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md select-none',
              contentClass,
            )
          "
        >
          {{ content }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
