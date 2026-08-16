import { defineStore } from "pinia";
import { ref } from "vue";

import { ApiError, api } from "@/lib/api";
import type { User } from "@/types";

export const useAuthStore = defineStore("auth", () => {
	const user = ref<User | null>(null);
	const initialized = ref(false);

	async function initialize(): Promise<void> {
		try {
			const { user: me } = await api.get<{ user: User }>("/api/auth/me");
			user.value = me;
		} catch (err) {
			// 401 just means "not logged in"; anything else is a real problem.
			if (err instanceof Error && "status" in err && (err as { status: number }).status !== 401) {
				throw err;
			}
		} finally {
			initialized.value = true;
		}
	}

	function login(redirectTo?: string): void {
		const target = redirectTo ?? window.location.pathname;
		window.location.href = `/api/auth/login?redirect_to=${encodeURIComponent(target)}`;
	}

	/**
	 * Sign out on the backend and clear local auth state.
	 * Throws when the request fails for a real reason (callers show an error
	 * and stay signed in); a 401 means the session is already gone.
	 */
	async function logout(): Promise<void> {
		try {
			await api.post<{ ok: boolean }>("/api/auth/logout");
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				user.value = null;
				return;
			}
			throw err;
		}
		user.value = null;
	}

	const isAuthenticated = (): boolean => user.value !== null;

	return { user, initialized, initialize, login, logout, isAuthenticated };
});
