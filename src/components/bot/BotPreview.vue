<script setup lang="ts">
import { MessageCircle, MessageSquare, Send } from 'lucide-vue-next';

defineProps<{
  appearance: {
    primaryColor: string;
    botName: string;
    welcomeMessage: string;
    userPlaceholder: string;
  }
}>();
</script>

<template>
  <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm sticky top-24">
    <h4 class="font-bold mb-8 flex items-center text-gray-900">
      <MessageCircle class="w-5 h-5 mr-3 text-orange-500" />
      Widget Preview
    </h4>
    <div class="border border-gray-100 rounded-[2rem] overflow-hidden shadow-2xl">
      <div class="p-5 text-white flex items-center space-x-3" :style="{ backgroundColor: appearance.primaryColor }">
        <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <MessageSquare class="w-5 h-5" />
        </div>
        <div>
          <span class="font-bold text-sm block">{{ appearance.botName }}</span>
          <span class="text-[10px] opacity-80">Online</span>
        </div>
      </div>
      <div class="p-5 bg-gray-50 h-64 flex flex-col justify-end">
        <div class="bg-white p-4 rounded-2xl rounded-tl-none text-xs text-gray-700 shadow-sm mb-2 max-w-[90%] leading-relaxed">
          {{ appearance.welcomeMessage }}
        </div>
      </div>
      <div class="p-4 bg-white border-t border-gray-100 flex items-center space-x-3">
        <div class="flex-1 h-10 bg-gray-50 rounded-xl border border-gray-100 px-4 flex items-center text-[10px] text-gray-400">
          {{ appearance.userPlaceholder }}
        </div>
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md" :style="{ backgroundColor: appearance.primaryColor }">
          <Send class="w-4 h-4" />
        </div>
      </div>
    </div>
    <p class="text-center text-[10px] text-gray-400 mt-6">This is how it will look on your site</p>
  </div>
</template>