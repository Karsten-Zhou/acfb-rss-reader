const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/",
			name: "app",
			component: () => import("@/views/AppView.vue"),
		},
		{
			// Deep link to a specific article (e.g. from a notification click).
			// AppView watches `:entryId` and selects the article in the reader.
			path: "/reader/:entryId",
			name: "reader",
			component: () => import("@/views/AppView.vue"),
		},
		{ path: "/:pathMatch(.*)*", redirect: "/" },
	],
	scrollBehavior: () => ({ top: 0 }),
});

export { router };
