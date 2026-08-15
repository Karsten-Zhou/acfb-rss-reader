import { VueQueryPlugin } from "@tanstack/vue-query";
import { MotionPlugin } from "@vueuse/motion";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { i18n } from "./i18n";
import { router } from "./router";
import { useSettingsStore } from "./stores/settings";

import "./assets/main.css";

const app = createApp(App);

app.use(createPinia());
app.use(i18n);
app.use(router);
app.use(VueQueryPlugin);
app.use(MotionPlugin);

// Apply persisted theme/locale before the first render, then hydrate from
// the backend once the user is authenticated.
const settings = useSettingsStore();
void settings.load();

app.mount("#app");
