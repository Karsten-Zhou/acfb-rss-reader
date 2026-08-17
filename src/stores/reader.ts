export type ReaderView =
	| { kind: "all" }
	| { kind: "starred" }
	| { kind: "archived" }
	| { kind: "feed"; feedId: number }
	| { kind: "folder"; folderId: number };

export const useReaderStore = defineStore("reader", () => {
	const view = ref<ReaderView>({ kind: "all" });
	const selectedEntryId = ref<number | null>(null);
	const showUnreadOnly = ref(false);
	const searchQuery = ref("");

	function setView(next: ReaderView): void {
		view.value = next;
		selectedEntryId.value = null;
		searchQuery.value = "";
	}

	function selectEntry(id: number | null): void {
		selectedEntryId.value = id;
	}

	const feedId = computed(() => (view.value.kind === "feed" ? view.value.feedId : null));
	const folderId = computed(() => (view.value.kind === "folder" ? view.value.folderId : null));
	const isArchivedView = computed(() => view.value.kind === "archived");

	return {
		view,
		selectedEntryId,
		showUnreadOnly,
		searchQuery,
		setView,
		selectEntry,
		feedId,
		folderId,
		isArchivedView,
	};
});
