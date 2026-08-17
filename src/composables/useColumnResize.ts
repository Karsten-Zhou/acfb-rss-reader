import { useSettingsStore } from "@/stores/settings";

/**
 * Desktop list-column resize logic.
 *
 * The sidebar is fixed-width (w-64): it doubles as an off-canvas drawer on
 * mobile, so it is intentionally not resizable. Only the article list width
 * is user-adjustable; the reader takes the remaining space.
 *
 * Widths are content-based: the three-column layout is only used while the
 * viewport can hold sidebar + list + a usable reader. Below that threshold
 * the app collapses to list-or-reader (driven by `isWide` in AppView).
 */

export const COLUMN_HANDLE_WIDTH = 8;
/** Fixed sidebar width (w-64). */
export const SIDEBAR_WIDTH = 256;
export const LIST_MIN = 256;
export const LIST_MAX = 512;
export const READER_MIN = 320;

/** Minimum viewport width for the three-column layout (content-based). */
export const THREE_COLUMN_MIN_WIDTH = SIDEBAR_WIDTH + LIST_MIN + READER_MIN + COLUMN_HANDLE_WIDTH;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

export function useColumnResize() {
	const settings = useSettingsStore();
	const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 0);

	const isWide = computed(() => viewportWidth.value >= THREE_COLUMN_MIN_WIDTH);

	/** The reader keeps a usable width, so the list can't eat everything. */
	const maxList = computed(() =>
		Math.min(LIST_MAX, viewportWidth.value - SIDEBAR_WIDTH - READER_MIN - COLUMN_HANDLE_WIDTH),
	);

	const listWidth = computed(() => clamp(settings.columnWidths.list, LIST_MIN, maxList.value));

	// --- Pointer dragging ---------------------------------------------------
	let startX = 0;
	let startList = LIST_MIN;

	function onPointerMove(event: PointerEvent): void {
		const delta = event.clientX - startX;
		settings.columnWidths.list = clamp(startList + delta, LIST_MIN, maxList.value);
	}

	function endDrag(): void {
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", endDrag);
		document.body.classList.remove("select-none");
		void settings.setColumnWidths({ ...settings.columnWidths });
	}

	function beginDrag(event: PointerEvent): void {
		if (!isWide.value) return;
		startX = event.clientX;
		startList = settings.columnWidths.list;
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", endDrag);
		document.body.classList.add("select-none");
	}

	// --- Keyboard (accessible resize via the handle button) ----------------
	function onHandleKey(event: KeyboardEvent): void {
		if (!isWide.value) return;
		const step = event.shiftKey ? 64 : 16;
		let next: number;
		if (event.key === "ArrowLeft") next = settings.columnWidths.list - step;
		else if (event.key === "ArrowRight") next = settings.columnWidths.list + step;
		else return;
		settings.columnWidths.list = clamp(next, LIST_MIN, maxList.value);
		event.preventDefault();
		void settings.setColumnWidths({ ...settings.columnWidths });
	}

	function onWindowResize(): void {
		viewportWidth.value = window.innerWidth;
	}

	onMounted(() => window.addEventListener("resize", onWindowResize));
	onUnmounted(() => window.removeEventListener("resize", onWindowResize));

	return {
		isWide,
		listWidth,
		beginDrag,
		onHandleKey,
		viewportWidth,
	};
}
