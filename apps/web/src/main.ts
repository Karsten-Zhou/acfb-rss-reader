import { VueQueryPlugin } from "@tanstack/vue-query";
import { MotionPlugin } from "@vueuse/motion";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./router";

import "./assets/main.css";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin);
app.use(MotionPlugin);

app.mount("#app");
