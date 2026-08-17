import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	plugins: [
		vue(),
		tailwindcss(),
		cloudflare(),
		Components({
			// Use an explicit glob so every component under src/components
			// (including nested folders like scroll-area/ and select/) is
			// resolvable as a kebab/camel-case tag with no manual import.
			globs: ["src/components/**/*.vue"],
			dts: "./components.d.ts",
		}),
		AutoImport({
			// Presets cover the common APIs; the custom entries fill gaps the
			// presets intentionally omit (RouterView / createRouter are
			// components and router factory helpers, createI18n is the i18n
			// factory — none are in the shipped presets).
			imports: [
				"vue",
				"vue-router",
				"@vueuse/core",
				"vue-i18n",
				"pinia",
				{
					"vue-router": ["RouterView", "createRouter", "createWebHistory"],
					"vue-i18n": ["createI18n"],
				},
			],
			dts: "./auto-imports.d.ts",
			viteOptimizeDeps: true,
			// Also scan template identifiers (e.g. `<RouterView />` in App.vue,
			// which is only referenced from the template, not the script block).
			vueTemplate: true,
			biomelintrc: {
				enabled: true,
				filepath: "./.biomelintrc-auto-import.json",
			},
		}),
	],
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
