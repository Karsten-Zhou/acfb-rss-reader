import { createRouter, createWebHistory } from "vue-router";

import { useAuthStore } from "@/stores/auth";

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/login",
			name: "login",
			component: () => import("@/views/LoginView.vue"),
		},
		{
			path: "/",
			name: "app",
			component: () => import("@/views/AppView.vue"),
			meta: { requiresAuth: true },
		},
		{ path: "/:pathMatch(.*)*", redirect: "/" },
	],
	scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
	const auth = useAuthStore();
	if (!auth.initialized) {
		await auth.initialize();
	}
	if (to.meta.requiresAuth && !auth.isAuthenticated()) {
		return { name: "login", query: { redirect: to.fullPath } };
	}
	if (to.name === "login" && auth.isAuthenticated()) {
		return { name: "app" };
	}
});

export { router };
