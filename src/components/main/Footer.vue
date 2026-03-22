<template>
  <footer v-if="isVisible" class="bg-white border-t border-gray-100 py-12 px-6">
    <div
      class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center"
    >
      <div class="flex items-center space-x-2 mb-4 md:mb-0">
        <span class="text-xl font-bold text-gray-900"
          >OmniSync<span class="text-orange-500">AI</span></span
        >
      </div>
      <p class="text-gray-500 text-sm">
        © 2024 OmniSync AI. All rights reserved.
      </p>
      <div class="flex space-x-6 mt-4 md:mt-0">
        <a href="#" class="text-gray-400 hover:text-gray-600 transition-colors"
          >Twitter</a
        >
        <a href="#" class="text-gray-400 hover:text-gray-600 transition-colors"
          >LinkedIn</a
        >
        <a href="#" class="text-gray-400 hover:text-gray-600 transition-colors"
          >GitHub</a
        >
      </div>
    </div>
  </footer>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const isVisible = computed(
  () => route.name && !["login", "register"].includes(route.name as string),
);
</script>
