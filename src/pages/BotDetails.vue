<script setup lang="ts">
import DashboardLayout from "@/layouts/DashboardLayout.vue";
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/composables/useNotification";
import {
  ChevronLeft,
  Save,
  Code,
  Loader2,
  Palette,
  MessageCircle,
  BrainCircuit,
  History,
  AlertTriangle
} from "lucide-vue-next";

import BotTraining from "@/components/bot/BotTraining.vue";
import BotAppearance from "@/components/bot/BotAppearance.vue";
import BotPlayground from "@/components/bot/BotPlayground.vue";
import BotEmbed from "@/components/bot/BotEmbed.vue";
import BotPreview from "@/components/bot/BotPreview.vue";
import BotConversations from "@/components/bot/BotConversations.vue";

const { showToast, askConfirm } = useNotification();
const route = useRoute();
const router = useRouter();
const bot = ref<any>(null);
const originalBot = ref<any>(null);
const chunks = ref<any[]>([]);
const originalChunks = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const activeTab = ref("training");
const hasUnsavedChanges = ref(false);

const fetchBotData = async () => {
  const id = route.params.id;
  const { data: botData, error: botError } = await supabase.from("chatbots").select("*").eq("id", id).single();

  if (botError) {
    router.push("/dashboard");
    return;
  }

  if (!botData.settings) botData.settings = {};
  if (!botData.settings.appearance) {
    botData.settings.appearance = {
      primaryColor: "#f97316",
      welcomeMessage: "Hello! How can I help you today?",
      botName: botData.name,
      userPlaceholder: "Type your message...",
    };
  }
  
  if (botData.settings.source_value === undefined) botData.settings.source_value = "";
  bot.value = botData;
  originalBot.value = JSON.parse(JSON.stringify(botData)); // Deep copy for comparison
  await fetchChunks();
  loading.value = false;
};

const fetchChunks = async () => {
  const { data: chunksData } = await supabase.from("knowledge_chunks").select("*").eq("chatbot_id", bot.value.id).order('created_at', { ascending: true });
  chunks.value = chunksData?.map(c => ({ ...c, isExpanded: false })) || [];
  originalChunks.value = JSON.parse(JSON.stringify(chunks.value)); // Deep copy for comparison
};

const checkForChanges = () => {
  if (!originalBot.value || !bot.value) return false;
  
  const botChanged = JSON.stringify(bot.value) !== JSON.stringify(originalBot.value);
  const chunksChanged = JSON.stringify(chunks.value) !== JSON.stringify(originalChunks.value);
  
  return botChanged || chunksChanged;
};

const handleAddChunk = (newChunk: any) => {
  chunks.value.push(newChunk);
  hasUnsavedChanges.value = true;
};
const handleBulkAdd = (newChunks: any[]) => {
  chunks.value = [...chunks.value, ...newChunks];
  hasUnsavedChanges.value = true;
};
const handleRemoveChunk = (index: number) => {
  chunks.value.splice(index, 1);
  hasUnsavedChanges.value = true;
};

const handleSave = async () => {
  saving.value = true;
  const { error: botError } = await supabase.from("chatbots").update({ name: bot.value.name, settings: bot.value.settings }).eq("id", bot.value.id);

  if (botError) {
    showToast(botError.message, 'error');
    saving.value = false;
    return;
  }

  // Update knowledge base
  await supabase.from('knowledge_chunks').delete().eq('chatbot_id', bot.value.id);
  const validChunks = chunks.value.filter(c => c.title.trim() || c.content.trim()).map(c => ({ 
    chatbot_id: bot.value.id, 
    title: c.title, 
    content: c.content 
  }));

  if (validChunks.length > 0) {
    const { error: chunkError } = await supabase.from('knowledge_chunks').insert(validChunks);
    if (chunkError) showToast("Error saving knowledge base", 'error');
  }

  showToast("Settings saved successfully!", 'success');
  saving.value = false;
  hasUnsavedChanges.value = false;
  await fetchChunks();
  
  // Update original data after successful save
  originalBot.value = JSON.parse(JSON.stringify(bot.value));
  originalChunks.value = JSON.parse(JSON.stringify(chunks.value));
};

// Navigation guard to warn about unsaved changes
onBeforeRouteLeave(async (to, from, next) => {
  if (hasUnsavedChanges.value && checkForChanges()) {
    const confirmed = await askConfirm(
      'Unsaved Changes',
      'You have unsaved changes. Are you sure you want to leave without saving?'
    );
    if (confirmed) {
      next();
    } else {
      next(false);
    }
  } else {
    next();
  }
});

// Watch for changes to bot data
watch([bot, chunks], () => {
  if (originalBot.value && originalChunks.value) {
    hasUnsavedChanges.value = checkForChanges();
  }
}, { deep: true });

onMounted(fetchBotData);
</script>

<template>
  <DashboardLayout>
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="w-8 h-8 animate-spin text-orange-500" />
    </div>

    <div v-else-if="bot" class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-4 md:space-y-0">
        <div class="flex items-center space-x-4">
          <button @click="router.push('/dashboard/bots')" class="p-2 hover:bg-gray-100 rounded-xl transition-all">
            <ChevronLeft class="w-6 h-6" />
          </button>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ bot.name }}</h1>
            <div class="flex items-center space-x-2 mt-1">
              <span class="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-bold">Active</span>
              <span class="text-xs text-gray-400">ID: {{ bot.id }}</span>
              <span v-if="hasUnsavedChanges" class="flex items-center text-xs px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full font-bold">
                <AlertTriangle class="w-3 h-3 mr-1" />
                Unsaved changes
              </span>
            </div>
          </div>
        </div>
        <button @click="handleSave" :disabled="saving" class="bg-gray-900 text-white px-8 py-3 rounded-2xl font-bold flex items-center hover:bg-gray-800 transition-all disabled:opacity-50 shadow-lg shadow-gray-200">
          <Loader2 v-if="saving" class="w-5 h-5 mr-2 animate-spin" />
          <Save v-else class="w-5 h-5 mr-2" />
          Save Changes
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex space-x-1 bg-gray-100 p-1.5 rounded-2xl mb-8 w-fit overflow-x-auto max-w-full">
        <button @click="activeTab = 'training'" :class="['px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center whitespace-nowrap', activeTab === 'training' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700']">
          <BrainCircuit class="w-4 h-4 mr-2" /> Training
        </button>
        <button @click="activeTab = 'appearance'" :class="['px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center whitespace-nowrap', activeTab === 'appearance' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700']">
          <Palette class="w-4 h-4 mr-2" /> Appearance
        </button>
        <button @click="activeTab = 'conversations'" :class="['px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center whitespace-nowrap', activeTab === 'conversations' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700']">
          <History class="w-4 h-4 mr-2" /> Conversations
        </button>
        <button @click="activeTab = 'playground'" :class="['px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center whitespace-nowrap', activeTab === 'playground' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700']">
          <MessageCircle class="w-4 h-4 mr-2" /> Playground
        </button>
        <button @click="activeTab = 'embed'" :class="['px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center whitespace-nowrap', activeTab === 'embed' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700']">
          <Code class="w-4 h-4 mr-2" /> Embed
        </button>
      </div>

      <!-- Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 space-y-6">
          <BotTraining 
            v-if="activeTab === 'training'" 
            v-model:chunks="chunks"
            v-model:websiteUrl="bot.settings.source_value"
            :sourceType="bot.settings.source_type" 
            :botId="bot.id"
            @add-chunk="handleAddChunk"
            @bulk-add="handleBulkAdd"
            @remove-chunk="handleRemoveChunk"
            @refresh-chunks="fetchChunks"
          />
          <BotAppearance v-if="activeTab === 'appearance'" v-model:settings="bot.settings.appearance" />
          <BotConversations v-if="activeTab === 'conversations'" :botId="bot.id" />
          <BotPlayground v-if="activeTab === 'playground'" :botId="bot.id" :appearance="bot.settings.appearance" />
          <BotEmbed v-if="activeTab === 'embed'" :botId="bot.id" />
        </div>
        <div class="space-y-6">
          <BotPreview :appearance="bot.settings.appearance" />
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>