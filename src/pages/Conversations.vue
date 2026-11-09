<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { supabase } from '@/integrations/supabase/client';

const route = useRoute();
import { 
  MessageSquare, 
  Search, 
  Clock, 
  User,
  UserX,
  Bot,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Inbox
} from 'lucide-vue-next';

// Drill-down view state: bots -> conversations -> chat
const view = ref<'bots' | 'conversations' | 'chat'>('bots');
const bots = ref<any[]>([]);
const conversations = ref<any[]>([]);
const selectedBot = ref<any>(null);
const selectedConversation = ref<any>(null);

const loading = ref(true);
const loadingMessages = ref(false);
const messages = ref<any[]>([]);
const searchQuery = ref('');

const fetchBots = async () => {
  loading.value = true;
  const { data: botList, error } = await supabase
    .from('chatbots')
    .select('id, name')
    .order('name', { ascending: true });

  if (!error && botList) {
    // Conversation counts per bot, in one query (chatbot_id indexed).
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('chatbot_id');

    const counts: Record<string, number> = {};
    if (!convErr && convs) {
      convs.forEach((c: any) => {
        counts[c.chatbot_id] = (counts[c.chatbot_id] || 0) + 1;
      });
    }

    bots.value = botList.map(bot => ({
      ...bot,
      conversationCount: counts[bot.id] || 0
    }));
  }
  loading.value = false;
};

const openBot = async (bot: any) => {
  selectedBot.value = bot;
  selectedConversation.value = null;
  view.value = 'conversations';
  searchQuery.value = '';
  loading.value = true;

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('chatbot_id', bot.id)
    .order('updated_at', { ascending: false });

  if (!error && data) {
    conversations.value = data;
  }
  loading.value = false;
};

const openConversation = async (conv: any) => {
  selectedConversation.value = conv;
  view.value = 'chat';
  loadingMessages.value = true;
  messages.value = [];

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });

  if (!error && data) {
    messages.value = data;
  }
  loadingMessages.value = false;
};

const backToBots = () => {
  view.value = 'bots';
  selectedBot.value = null;
  selectedConversation.value = null;
  searchQuery.value = '';
  conversations.value = [];
};

const backToConversations = () => {
  view.value = 'conversations';
  selectedConversation.value = null;
  messages.value = [];
};

// The list is identified by WHO talked, not which bot — the bot is context.
const conversationTitle = (conv: any) => {
  const raw = conv.visitor_id;
  if (!raw) return 'Anonymous';
  // Legacy conversations stored leads as "Name (email)" — surface the name.
  const match = raw.match(/^(.*)\s\((.*)\)$/);
  return match ? match[1] : raw;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const messageTime = (date: string) => {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const filteredConversations = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  return conversations.value.filter(conv =>
    !q || conversationTitle(conv).toLowerCase().includes(q)
  );
});

const initialLetter = (name: string) => name.charAt(0).toUpperCase();

// Deep link (from Leads "View Chat" etc.): /dashboard/conversations?conversation=<id>
// resolves the thread, opens its bot level and jumps straight to the transcript —
// no manual drill-down through the same 0-point list.
const deepLinkConversation = async (conversationId: string) => {
  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error || !conv) {
    console.warn('Deep-linked conversation not found:', conversationId);
    return false;
  }

  const { data: bot, error: botError } = await supabase
    .from('chatbots')
    .select('id, name')
    .eq('id', conv.chatbot_id)
    .single();

  selectedBot.value = bot ?? { id: conv.chatbot_id, name: '' };
  loading.value = true;
  view.value = 'conversations';
  searchQuery.value = '';

  const { data: list } = await supabase
    .from('conversations')
    .select('*')
    .eq('chatbot_id', conv.chatbot_id)
    .order('updated_at', { ascending: false });

  conversations.value = list ?? [];
  loading.value = false;
  await openConversation(conv);
  return true;
};

onMounted(async () => {
  const targetId = route.query.conversation as string | undefined;
  if (targetId) {
    const ok = await deepLinkConversation(targetId);
    if (ok) return;
  }
  fetchBots();
});
</script>

<template>
  <DashboardLayout>
    <div class="h-[calc(100vh-12rem)] flex flex-col">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">{{ view === 'bots' ? 'Conversations' : selectedBot?.name }}</h1>
          <p class="text-gray-500 mt-1">
            {{ view === 'bots'
              ? 'Pick a bot to see its conversations.'
              : view === 'conversations'
                ? 'Conversations are labeled by the visitor who started them.'
                : 'Read the full transcript of this conversation.' }}
          </p>
        </div>
        <button
          v-if="view === 'conversations'"
          @click="backToBots"
          class="flex items-center text-sm font-bold text-gray-500 hover:text-orange-600 transition-colors"
        >
          <ArrowLeft class="w-4 h-4 mr-1" /> All bots
        </button>
        <button
          v-else-if="view === 'chat'"
          @click="backToConversations"
          class="flex items-center text-sm font-bold text-gray-500 hover:text-orange-600 transition-colors"
        >
          <ArrowLeft class="w-4 h-4 mr-1" /> Back to conversations
        </button>
      </div>

      <div class="flex-1 flex bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">

        <!-- ── Level 1: Bots ── -->
        <div v-if="view === 'bots'" class="w-full flex flex-col">
          <div v-if="loading" class="p-10 flex justify-center">
            <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
          </div>
          <div v-else-if="bots.length === 0" class="p-10 text-center">
            <Inbox class="w-10 h-10 text-gray-200 mx-auto mb-4" />
            <p class="text-sm text-gray-400">Create a bot first</p>
          </div>
          <div v-for="bot in bots" :key="bot.id"
            @click="openBot(bot)"
            class="w-full p-5 text-left border-b border-gray-50 hover:bg-gray-50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 font-black text-lg">
                {{ initialLetter(bot.name) }}
              </div>
              <div>
                <h4 class="font-bold text-gray-900">{{ bot.name }}</h4>
                <p class="text-xs text-gray-500 flex items-center mt-0.5">
                  <MessageSquare class="w-3 h-3 mr-1" />
                  {{ bot.conversationCount }} conversation{{ bot.conversationCount === 1 ? '' : 's' }}
                </p>
              </div>
            </div>
            <ChevronRight class="w-5 h-5 text-gray-300 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        <!-- ── Level 2 + 3: Conversations list + chat pane ── -->
        <template v-else>
          <div class="w-1/3 border-r border-gray-50 flex flex-col">
            <div class="p-4 border-b border-gray-50">
              <div class="relative">
                <Search class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input type="text" v-model="searchQuery" placeholder="Search visitor..."
                  class="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
            </div>

            <div class="flex-1 overflow-y-auto">
              <div v-if="loading" class="p-10 flex justify-center">
                <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
              </div>
              <div v-else-if="filteredConversations.length === 0" class="p-10 text-center">
                <Inbox class="w-10 h-10 text-gray-200 mx-auto mb-4" />
                <p class="text-sm text-gray-400">{{ searchQuery ? 'No visitors found' : 'No conversations yet' }}</p>
              </div>
              <button v-for="conv in filteredConversations" :key="conv.id"
                @click="openConversation(conv)"
                :class="['w-full p-4 text-left border-b border-gray-50 transition-all hover:bg-gray-50 flex items-center justify-between group cursor-pointer', selectedConversation?.id === conv.id ? 'bg-orange-50' : '']">
                <div class="flex items-center space-x-3 min-w-0">
                  <div :class="['w-10 h-10 rounded-full flex items-center justify-center shrink-0', conv.visitor_id ? 'text-orange-600 bg-orange-50' : 'text-gray-400 bg-gray-100']">
                    <component :is="conv.visitor_id ? User : UserX" class="w-5 h-5" />
                  </div>
                  <div class="min-w-0">
                    <h4 class="font-bold text-sm text-gray-900 truncate">{{ conversationTitle(conv) }}</h4>
                    <p class="text-xs text-gray-500 flex items-center mt-0.5">
                      <Clock class="w-3 h-3 mr-1 shrink-0" />
                      {{ formatDate(conv.updated_at) }}
                    </p>
                  </div>
                </div>
                <ChevronRight :class="['w-4 h-4 shrink-0 transition-all', selectedConversation?.id === conv.id ? 'text-orange-500 translate-x-1' : 'text-gray-300 group-hover:translate-x-1']" />
              </button>
            </div>
          </div>

          <!-- Chat View -->
          <div class="flex-1 flex flex-col bg-gray-50/30">
            <div v-if="selectedConversation" class="flex-1 flex flex-col">
              <!-- Chat Header: visitor is the story, bot is the context -->
              <div class="p-4 bg-white border-b border-gray-50 flex items-center justify-between">
                <div class="flex items-center space-x-3 min-w-0">
                  <div :class="['p-2 rounded-lg shrink-0 flex items-center justify-center', selectedConversation.visitor_id ? 'text-orange-600 bg-orange-50' : 'text-gray-400 bg-gray-100']">
                    <component :is="selectedConversation.visitor_id ? User : UserX" class="w-4 h-4" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-bold text-sm truncate">{{ conversationTitle(selectedConversation) }}</h3>
                    <p class="text-[10px] text-gray-400 flex items-center">
                      <Bot class="w-3 h-3 mr-1" />
                      {{ selectedBot?.name }}
                    </p>
                  </div>
                </div>
                <span v-if="selectedConversation.visitor_id" class="text-[10px] text-gray-300 truncate max-w-[240px]">
                  {{ selectedConversation.visitor_id }}
                </span>
              </div>

              <!-- Messages -->
              <div class="flex-1 overflow-y-auto p-6 space-y-4">
                <div v-if="loadingMessages" class="flex justify-center py-10">
                  <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
                </div>
                <div v-for="msg in messages" :key="msg.id" 
                  :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
                  <div :class="['max-w-[70%] p-4 rounded-2xl text-sm shadow-sm', 
                    msg.role === 'user' ? 'bg-gray-900 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100']">
                    {{ msg.content }}
                    <p :class="['text-[10px] mt-2 text-gray-400']">
                      {{ messageTime(msg.created_at) }}
                    </p>
                  </div>
                </div>
                <div v-if="!loadingMessages && messages.length === 0" class="py-10 text-center">
                  <p class="text-sm text-gray-400">No messages recorded in this conversation yet.</p>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-400">
              <div class="bg-white p-6 rounded-full shadow-sm mb-4">
                <MessageSquare class="w-8 h-8 text-gray-200" />
              </div>
              <p class="text-sm font-medium">Select a conversation to view details</p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </DashboardLayout>
</template>
