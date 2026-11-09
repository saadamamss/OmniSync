<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Send, MessageCircle, Eye, EyeOff, FileText } from 'lucide-vue-next';
import { supabase } from '@/integrations/supabase/client';

interface RetrievedSource {
  title: string;
  matched_via: string;
}

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
const showWhy = ref(true);
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
        // History must carry ONLY {role, content} — extra fields (e.g. the
        // stored `sources` for "Show why") make Groq reject the request.
        history: chatHistory.value
          .slice(-6, -1)
          .map(({ role, content }: any) => ({ role, content })),
        // Owner-only intel: sources stay in the Playground; the public widget
        // never requests them. Always retrieved so the "Show why" toggle can
        // reveal past answers too.
        include_sources: true,
      },
    });

    if (error) throw error;
    chatHistory.value.push({
      role: "assistant",
      content: data.reply,
      sources: data.sources ?? [],
    });
  } catch (err: any) {
    chatHistory.value.push({ role: "assistant", content: "⚠️ Error: " + err.message, sources: [] });
  } finally {
    isTyping.value = false;
    scrollToBottom();
  }
};

const resetChat = () => {
  chatHistory.value = [{ role: 'assistant', content: props.appearance.welcomeMessage }];
};

const matchedViaLabel = (via: string) => {
  const labels: Record<string, string> = {
    hybrid: 'hybrid match',
    semantic: 'semantic match',
    keyword: 'keyword match',
  };
  return labels[via] ?? via;
};
</script>

<template>
  <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col h-[650px] overflow-hidden">
    <div class="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
      <div class="flex items-center space-x-3">
        <div class="flex items-center space-x-3">
          <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <h3 class="font-bold text-gray-900">Live Test Environment</h3>
        </div>
        <button
          @click="showWhy = !showWhy"
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all',
            showWhy ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          ]"
          title="Show which knowledge sources each answer was built from"
        >
          <component :is="showWhy ? Eye : EyeOff" class="w-3.5 h-3.5" />
          Show why
        </button>
      </div>
      <button @click="resetChat" class="text-xs font-bold text-orange-600 hover:underline">Reset Chat</button>
    </div>
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30">
      <div v-for="(msg, i) in chatHistory" :key="i" :class="['flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start']">
        <div
          :class="['max-w-[80%] p-4 rounded-2xl text-sm shadow-sm leading-relaxed', msg.role === 'user' ? 'text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100']"
          :style="msg.role === 'user' ? { backgroundColor: appearance.primaryColor } : {}"
        >
          {{ msg.content }}
        </div>
        <!-- Source preview: why this answer was chosen (Playground only) -->
        <div
          v-if="msg.role === 'assistant' && showWhy && msg.sources?.length"
          class="w-full space-y-1.5"
        >
          <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">
            Retrieved from knowledge
          </p>
          <div
            v-for="(s, si) in msg.sources"
            :key="si"
            class="inline-flex items-center gap-1.5 mr-2 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 shadow-xs"
          >
            <FileText class="w-3 h-3 text-orange-500 shrink-0" />
            <span class="font-semibold text-gray-800 truncate max-w-[180px]">{{ s.title }}</span>
            <span class="text-gray-300">·</span>
            <span class="text-gray-400">{{ matchedViaLabel(s.matched_via) }}</span>
          </div>
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