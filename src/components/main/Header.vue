<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { MessageSquare, Menu, X } from 'lucide-vue-next';

const isScrolled = ref(false);
const isMobileMenuOpen = ref(false);

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20;
};

onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));
</script>

<template>
  <nav :class="['fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4', isScrolled ? 'bg-white/80 backdrop-blur-md shadow-sm' : 'bg-transparent']">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <!-- Logo -->
      <router-link to="/" class="flex items-center space-x-2 group">
        <div class="bg-orange-500 p-2 rounded-lg group-hover:rotate-12 transition-transform">
          <MessageSquare class="text-white w-6 h-6" />
        </div>
        <span class="text-2xl font-bold tracking-tight text-gray-900">OmniSync<span class="text-orange-500">AI</span></span>
      </router-link>

      <!-- Desktop Menu -->
      <div class="hidden md:flex items-center space-x-8">
        <a href="#features" class="text-sm font-medium text-gray-600 hover:text-orange-500 transition-colors">Features</a>
        <a href="#how-it-works" class="text-sm font-medium text-gray-600 hover:text-orange-500 transition-colors">How it works</a>
        <a href="#pricing" class="text-sm font-medium text-gray-600 hover:text-orange-500 transition-colors">Pricing</a>
      </div>

      <!-- Auth Buttons -->
      <div class="hidden md:flex items-center space-x-4">
        <router-link to="/login" class="text-sm font-medium text-gray-600 hover:text-orange-500 transition-colors">Login</router-link>
        <router-link to="/register" class="bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-all shadow-lg shadow-gray-200">
          Get Started
        </router-link>
      </div>

      <!-- Mobile Toggle -->
      <button class="md:hidden text-gray-900" @click="isMobileMenuOpen = !isMobileMenuOpen">
        <Menu v-if="!isMobileMenuOpen" />
        <X v-else />
      </button>
    </div>

    <!-- Mobile Menu -->
    <div v-if="isMobileMenuOpen" class="md:hidden absolute top-full left-0 right-0 bg-white border-t p-6 space-y-4 shadow-xl">
      <a href="#features" class="block text-lg font-medium text-gray-600">Features</a>
      <a href="#how-it-works" class="block text-lg font-medium text-gray-600">How it works</a>
      <router-link to="/login" class="block text-lg font-medium text-gray-600">Login</router-link>
      <router-link to="/register" class="block bg-orange-500 text-white text-center py-3 rounded-xl font-bold">Get Started</router-link>
    </div>
  </nav>
</template>