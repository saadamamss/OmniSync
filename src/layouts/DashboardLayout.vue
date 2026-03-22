<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { supabase } from "@/integrations/supabase/client";
import { useRouter, useRoute } from "vue-router";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  LogOut,
  PlusCircle,
  User,
  Menu,
  X,
  MessageCircle,
  Users,
  BarChart3,
} from "lucide-vue-next";

const router = useRouter();
const route = useRoute();
const isMobile = ref(false);
const isSidebarOpen = ref(true);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
  if (isMobile.value) isSidebarOpen.value = false;
  else isSidebarOpen.value = true;
};

watch(() => route.path, () => {
  if (isMobile.value) isSidebarOpen.value = false;
});

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push("/login");
};

const menuItems = [
  { name: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  { name: "My Chatbots", icon: MessageSquare, path: "/dashboard/bots" },
  { name: "Conversations", icon: MessageCircle, path: "/dashboard/conversations" },
  { name: "Leads", icon: Users, path: "/dashboard/leads" },
  { name: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  { name: "Settings", icon: Settings, path: "/dashboard/settings" },
];

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex">
    <div v-if="isMobile && isSidebarOpen" @click="isSidebarOpen = false" class="fixed inset-0 bg-gray-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"></div>
    <aside :class="['bg-white border-r border-gray-200 transition-all duration-300 fixed inset-y-0 left-0 z-50 transform overflow-hidden', isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20']">
      <div class="h-full flex flex-col">
        <div class="p-6 flex items-center justify-between">
          <div v-if="isSidebarOpen || isMobile" class="flex items-center space-x-2">
            <div class="bg-orange-500 p-1.5 rounded-lg"><MessageSquare class="text-white w-5 h-5" /></div>
            <span class="font-bold text-xl">OmniSync</span>
          </div>
          <div v-else class="bg-orange-500 p-1.5 rounded-lg mx-auto"><MessageSquare class="text-white w-5 h-5" /></div>
          <button v-if="isMobile" @click="isSidebarOpen = false" class="text-gray-400 hover:text-gray-600"><X class="w-6 h-6" /></button>
        </div>
        <nav class="flex-1 px-4 space-y-2 mt-4">
          <router-link v-for="item in menuItems" :key="item.name" :to="item.path" class="flex items-center p-3 rounded-xl transition-colors group" active-class="bg-orange-50 text-orange-600" :title="item.name">
            <component :is="item.icon" :class="['w-5 h-5', isSidebarOpen ? 'mr-3' : 'mx-auto']" />
            <span v-if="isSidebarOpen" class="font-medium">{{ item.name }}</span>
          </router-link>
        </nav>
        <div class="p-4 border-t border-gray-100 space-y-2">
          <button @click="handleLogout" class="w-full flex items-center p-3 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors group" title="Logout">
            <LogOut :class="['w-5 h-5', isSidebarOpen ? 'mr-3' : 'mx-auto']" /><span v-if="isSidebarOpen" class="font-medium">Logout</span>
          </button>
        </div>
      </div>
    </aside>
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300" :class="{'ps-64': isSidebarOpen && !isMobile, 'ps-20': !isSidebarOpen && !isMobile, 'ps-0': isMobile}">
      <header class="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 md:px-8">
        <button @click="isSidebarOpen = !isSidebarOpen" class="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-50"><Menu class="w-6 h-6" /></button>
        <div class="flex items-center space-x-2 md:space-x-4">
          <router-link to="/dashboard/create" class="bg-gray-900 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium flex items-center hover:bg-gray-800 transition-all"><PlusCircle class="w-4 h-4 md:mr-2" /><span class="hidden md:inline">New Chatbot</span></router-link>
          <div class="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600"><User class="w-5 h-5" /></div>
        </div>
      </header>
      <main class="flex-1 overflow-y-auto p-4 md:p-8"><slot></slot></main>
    </div>
  </div>
</template>