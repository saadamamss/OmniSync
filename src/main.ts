import { createApp } from "vue";
import { MotionPlugin } from "@vueuse/motion";
import App from "./App.vue";
import router from "./router";

// استيراد Tailwind CSS فقط
import "./style.css";

// إعداد AOS للأنيميشن البسيط
import AOS from "aos";
import "aos/dist/aos.css";

AOS.init({
  duration: 800,
  easing: "ease-in-out",
  once: true,
});

const app = createApp(App);
app.use(router);
app.use(MotionPlugin);
app.mount("#app");