<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Send, MessageCircle } from 'lucide-vue-next';
import { supabase } from '@/integrations/supabase/client';

const props = defineProps<{
  botId: string;
  appearance: {
    primaryColor: string;
    welcomeMessage: string;
    userPlaceholder: string;
  }
}>();

const testMessage = ref("");
const isTyping = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const chatHistory = ref<any[]>([
  { role: 'assistant', content: props.appearance.welcomeMessage }
]);

const scrollToBottom = async () => {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
};

const sendMessage = async () => {
  if (!testMessage.value.trim() || isTyping.value) return;

  const userMsg = testMessage.value;
  chatHistory.value.push({ role: "user", content: userMsg });
  testMessage.value = "";
  isTyping.value = true;
  scrollToBottom();

  try {
    const { data, error } = await supabase.functions.invoke("chat", {
      body: {
        bot_id: props.botId,
        message: userMsg,
        history: chatHistory.value.slice(-6, -1),
      },
    });

    if (error) throw error;
    chatHistory.value.push({ role: "assistant", content: data.reply });
  } catch (err: any) {
    chatHistory.value.push({ role: "assistant", content: "⚠️ Error: " + err.message });
  } finally {
    isTyping.value = false;
    scrollToBottom();
  }
};

const resetChat = () => {
  chatHistory.value = [{ role: 'assistant', content: props.appearance.welcomeMessage }];
};
</script>

<template>
  <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col h-[650px] overflow-hidden">
    <div class="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
      <div class="flex items-center space-x-3">
        <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
        <h3 class="font-bold text-gray-900">Live Test Environment</h3>
      </div>
      <button @click="resetChat" class="text-xs font-bold text-orange-600 hover:underline">Reset Chat</button>
    </div>
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30">
      <div v-for="(msg, i) in chatHistory" :key="i" :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
        <div
          :class="['max-w-[80%] p-4 rounded-2xl text-sm shadow-sm leading-relaxed', msg.role === 'user' ? 'text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100']"
          :style="msg.role === 'user' ? { backgroundColor: appearance.primaryColor } : {}"
        >
          {{ msg.content }}
        </div>
      </div>
      <div v-if="isTyping" class="flex justify-start">
        <div class="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none flex space-x-1.5">
          <div class="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
          <div class="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
          <div class="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
        </div>
      </div>
    </div>
    <div class="p-6 border-t border-gray-50 bg-white">
      <form @submit.prevent="sendMessage" class="relative flex items-center space-x-3">
        <input
          v-model="testMessage"
          type="text"
          :placeholder="appearance.userPlaceholder"
          class="flex-1 pl-6 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
        />
        <button
          type="submit"
          :disabled="isTyping || !testMessage.trim()"
          class="p-3.5 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg"
          :style="{ backgroundColor: appearance.primaryColor }"
        >
          <Send class="w-5 h-5" />
        </button>
      </form>
    </div>
  </div>
</template>