import { createRouter, createWebHistory } from "vue-router";
import { supabase } from "@/integrations/supabase/client";
import Default from "@/layouts/default.vue";
import Index from "@/pages/Index.vue";
import Login from "@/pages/Login.vue";
import Register from "@/pages/Register.vue";
import Dashboard from "@/pages/Dashboard.vue";
import CreateBot from "@/pages/CreateBot.vue";
import BotDetails from "@/pages/BotDetails.vue";
import Bots from "@/pages/Bots.vue";
import Settings from "@/pages/Settings.vue";
import Conversations from "@/pages/Conversations.vue";
import Leads from "@/pages/Leads.vue";
import Analytics from "@/pages/Analytics.vue";
import Widget from "@/pages/Widget.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: Default,
      children: [
        { path: "", name: "home", component: Index },
        { path: "login", name: "login", component: Login },
        { path: "register", name: "register", component: Register },
      ],
    },
    { path: "/widget", name: "widget", component: Widget },
    { path: "/dashboard", name: "dashboard", component: Dashboard, meta: { requiresAuth: true } },
    { path: "/dashboard/bots", name: "bots-list", component: Bots, meta: { requiresAuth: true } },
    { path: "/dashboard/conversations", name: "conversations", component: Conversations, meta: { requiresAuth: true } },
    { path: "/dashboard/leads", name: "leads", component: Leads, meta: { requiresAuth: true } },
    { path: "/dashboard/analytics", name: "analytics", component: Analytics, meta: { requiresAuth: true } },
    { path: "/dashboard/create", name: "create-bot", component: CreateBot, meta: { requiresAuth: true } },
    { path: "/dashboard/bots/:id", name: "bot-details", component: BotDetails, meta: { requiresAuth: true } },
    { path: "/dashboard/settings", name: "settings", component: Settings, meta: { requiresAuth: true } }
  ],
});

router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (to.meta.requiresAuth && !session) next('/login');
  else if ((to.name === 'login' || to.name === 'register') && session) next('/dashboard');
  else next();
});

export default router;