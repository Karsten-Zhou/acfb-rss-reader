import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	plugins: [vue(), tailwindcss(), cloudflare()],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
	},
	resolve: {
		alias: [
			{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
			{
				find: /^@shared\//,
				replacement: fileURLToPath(new URL("./shared/", import.meta.url)),
			},
			{
				find: /^@server\//,
				replacement: fileURLToPath(new URL("./server/", import.meta.url)),
			},
		],
	},
	server: {
		port: 8787,
		strictPort: true,
	},
});
