<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { supabase } from "@/integrations/supabase/client";
import { Send, MessageSquare, X, Loader2, User, Mail, Sparkles } from "lucide-vue-next";

const route = useRoute();
const bot = ref<any>(null);
const isOpen = ref(false);
const message = ref("");
const chatHistory = ref<any[]>([]);
const isTyping = ref(false);
const conversationId = ref<string | null>(null);
const chatContainer = ref<HTMLElement | null>(null);

const showLeadForm = ref(false);
const leadData = ref({ name: '', email: '' });

const fetchBot = async () => {
  const botId = route.query.id as string;
  if (!botId) return;

  const { data } = await supabase.from("chatbots").select("*").eq("id", botId).single();
  if (data) {
    bot.value = data;
    chatHistory.value = [{ role: "assistant", content: data.settings.appearance.welcomeMessage }];
    if (data.settings.appearance.collectLeads) showLeadForm.value = true;
  }
};

watch(isOpen, (newVal) => {
  window.parent.postMessage(newVal ? "open-chat" : "close-chat", "*");
});

const startChat = async () => {
  if (!leadData.value.name || !leadData.value.email) return;
  const { data } = await supabase.from('conversations').insert({
    chatbot_id: bot.value.id,
    visitor_id: `${leadData.value.name} (${leadData.value.email})`
  }).select().single();
  if (data) {
    conversationId.value = data.id;
    showLeadForm.value = false;
  }
};

const sendMessage = async (customMsg?: string) => {
  const userMsg = customMsg || message.value;
  if (!userMsg.trim() || isTyping.value) return;

  chatHistory.value.push({ role: "user", content: userMsg });
  message.value = "";
  isTyping.value = true;

  await nextTick();
  chatContainer.value?.scrollTo({ top: chatContainer.value.scrollHeight, behavior: "smooth" });

  try {
    const { data } = await supabase.functions.invoke("chat", {
      body: {
        bot_id: bot.value.id,
        message: userMsg,
        history: chatHistory.value.slice(-5, -1),
        conversation_id: conversationId.value,
      },
    });
    chatHistory.value.push({ role: "assistant", content: data.reply });
  } catch (e) {
    chatHistory.value.push({ role: "assistant", content: "Sorry, I'm offline." });
  } finally {
    isTyping.value = false;
    await nextTick();
    chatContainer.value?.scrollTo({ top: chatContainer.value.scrollHeight, behavior: "smooth" });
  }
};

onMounted(fetchBot);
</script>

<template>
  <div v-if="bot" :class="['fixed bottom-0 w-full h-full flex flex-col p-4 font-sans antialiased pointer-events-none', bot.settings.appearance.widgetPosition === 'left' ? 'items-start left-0' : 'items-end right-0']">
    <!-- Chat Window -->
    <div v-if="isOpen" class="mb-4 w-full max-w-[400px] h-[calc(100%-80px)] max-h-[600px] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300 pointer-events-auto">
      <!-- Header -->
      <div class="p-5 text-white flex items-center justify-between" :style="{ backgroundColor: bot.settings.appearance.primaryColor }">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"><MessageSquare class="w-5 h-5" /></div>
          <div>
            <h3 class="font-bold text-sm">{{ bot.settings.appearance.botName }}</h3>
            <div class="flex items-center text-[10px] opacity-80"><span class="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>Online</div>
          </div>
        </div>
        <button @click="isOpen = false" class="hover:bg-white/10 p-1 rounded-lg transition-colors"><X class="w-5 h-5" /></button>
      </div>

      <!-- Lead Form -->
      <div v-if="showLeadForm" class="flex-1 p-8 flex flex-col justify-center space-y-6 bg-gray-50/50">
        <div class="text-center space-y-2">
          <h4 class="text-xl font-bold text-gray-900">Welcome!</h4>
          <p class="text-sm text-gray-500">Please introduce yourself to start chatting.</p>
        </div>
        <div class="space-y-4">
          <div class="relative"><User class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" /><input v-model="leadData.name" type="text" placeholder="Your Name" class="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all" /></div>
          <div class="relative"><Mail class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" /><input v-model="leadData.email" type="email" placeholder="Your Email" class="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all" /></div>
          <button @click="startChat" :disabled="!leadData.name || !leadData.email" class="w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all disabled:opacity-50" :style="{ backgroundColor: bot.settings.appearance.primaryColor }">Start Chatting</button>
        </div>
      </div>

      <!-- Messages -->
      <template v-else>
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50">
          <div v-for="(msg, i) in chatHistory" :key="i" :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
            <div :class="['max-w-[85%] p-3.5 rounded-2xl text-sm shadow-sm', msg.role === 'user' ? 'text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100']" :style="msg.role === 'user' ? { backgroundColor: bot.settings.appearance.primaryColor } : {}">{{ msg.content }}</div>
          </div>
          
          <!-- Suggested Questions -->
          <div v-if="chatHistory.length === 1 && bot.settings.appearance.suggestedQuestions?.length" class="flex flex-wrap gap-2 mt-4">
            <button v-for="q in bot.settings.appearance.suggestedQuestions" :key="q" @click="sendMessage(q)" class="text-xs bg-white border border-gray-200 px-3 py-2 rounded-full hover:border-orange-500 hover:text-orange-600 transition-all flex items-center">
              <Sparkles class="w-3 h-3 mr-1.5 text-orange-400" /> {{ q }}
            </button>
          </div>

          <div v-if="isTyping" class="flex justify-start">
            <div class="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none flex space-x-1.5"><div class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></div><div class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]"></div><div class="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>
          </div>
        </div>

        <!-- Input -->
        <div class="p-4 bg-white border-t border-gray-100">
          <form @submit.prevent="sendMessage()" class="relative flex items-center space-x-2">
            <input v-model="message" type="text" :placeholder="bot.settings.appearance.userPlaceholder" class="flex-1 pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all" />
            <button type="submit" :disabled="isTyping || !message.trim()" class="p-2.5 text-white rounded-xl transition-all disabled:opacity-50 shadow-md" :style="{ backgroundColor: bot.settings.appearance.primaryColor }"><Send class="w-4 h-4" /></button>
          </form>
          <p class="text-[9px] text-center text-gray-400 mt-3">Powered by <span class="font-bold">OmniSync AI</span></p>
        </div>
      </template>
    </div>

    <!-- Toggle Button -->
    <button @click="isOpen = !isOpen" class="w-12 h-12 rounded-full shadow-2xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 pointer-events-auto" :class="{ 'opacity-0 !w-0 !h-0 overflow-hidden': isOpen }" :style="{ backgroundColor: bot.settings.appearance.primaryColor }">
      <MessageSquare class="w-7 h-7" />
    </button>
  </div>
</template>