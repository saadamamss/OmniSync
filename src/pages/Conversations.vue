<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { 
  MessageSquare, 
  Search, 
  Clock, 
  User,
  ChevronRight,
  Loader2,
  Inbox
} from 'lucide-vue-next';

const conversations = ref<any[]>([]);
const loading = ref(true);
const selectedConversation = ref<any>(null);
const messages = ref<any[]>([]);
const loadingMessages = ref(false);

const fetchConversations = async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      chatbots (name)
    `)
    .order('updated_at', { ascending: false });

  if (!error && data) {
    conversations.value = data;
  }
  loading.value = false;
};

const fetchMessages = async (conv: any) => {
  selectedConversation.value = conv;
  loadingMessages.value = true;
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

onMounted(fetchConversations);

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<template>
  <DashboardLayout>
    <div class="h-[calc(100vh-12rem)] flex flex-col">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900">Conversations</h1>
        <p class="text-gray-500 mt-1">Monitor real-time interactions between your AI and visitors.</p>
      </div>

      <div class="flex-1 flex bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <!-- Conversations List -->
        <div class="w-1/3 border-r border-gray-50 flex flex-col">
          <div class="p-4 border-b border-gray-50">
            <div class="relative">
              <Search class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search conversations..." 
                class="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
            </div>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div v-if="loading" class="p-10 flex justify-center">
              <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
            </div>
            <div v-else-if="conversations.length === 0" class="p-10 text-center">
              <Inbox class="w-10 h-10 text-gray-200 mx-auto mb-4" />
              <p class="text-sm text-gray-400">No conversations yet</p>
            </div>
            <button v-for="conv in conversations" :key="conv.id"
              @click="fetchMessages(conv)"
              :class="['w-full p-4 text-left border-b border-gray-50 transition-all hover:bg-gray-50 flex items-center justify-between group', selectedConversation?.id === conv.id ? 'bg-orange-50' : '']">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                  <User class="w-5 h-5" />
                </div>
                <div>
                  <h4 class="font-bold text-sm text-gray-900">{{ conv.chatbots?.name }}</h4>
                  <p class="text-xs text-gray-500 flex items-center mt-0.5">
                    <Clock class="w-3 h-3 mr-1" />
                    {{ formatDate(conv.updated_at) }}
                  </p>
                </div>
              </div>
              <ChevronRight :class="['w-4 h-4 transition-all', selectedConversation?.id === conv.id ? 'text-orange-500 translate-x-1' : 'text-gray-300 group-hover:translate-x-1']" />
            </button>
          </div>
        </div>

        <!-- Chat View -->
        <div class="flex-1 flex flex-col bg-gray-50/30">
          <div v-if="selectedConversation" class="flex-1 flex flex-col">
            <!-- Chat Header -->
            <div class="p-4 bg-white border-b border-gray-50 flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="bg-orange-50 p-2 rounded-lg">
                  <MessageSquare class="text-orange-600 w-4 h-4" />
                </div>
                <div>
                  <h3 class="font-bold text-sm">{{ selectedConversation.chatbots?.name }}</h3>
                  <p class="text-[10px] text-gray-400">Visitor ID: {{ selectedConversation.visitor_id || 'Anonymous' }}</p>
                </div>
              </div>
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
                  <p :class="['text-[10px] mt-2', msg.role === 'user' ? 'text-gray-400' : 'text-gray-400']">
                    {{ new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                  </p>
                </div>
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
      </div>
    </div>
  </DashboardLayout>
</template>