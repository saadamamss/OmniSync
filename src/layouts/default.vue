<script setup lang="ts">
import Footer from "@/components/main/Footer.vue";
import Header from "@/components/main/Header.vue";
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="min-h-screen bg-white font-sans antialiased text-gray-900">
    <!-- إخفاء الهيدر في صفحات المصادقة -->
    <Header v-if="!['login', 'register'].includes(route.name as string)"></Header>
    <main>
      <RouterView />
    </main>
    
    <!-- Footer بسيط -->
    <Footer />
  </div>
</template>