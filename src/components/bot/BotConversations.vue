<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { 
  MessageCircle, 
  User, 
  Clock, 
  ChevronRight, 
  Loader2, 
  Inbox,
  Trash2
} from 'lucide-vue-next';
import { useNotification } from '@/composables/useNotification';

const props = defineProps<{
  botId: string;
}>();

const { askConfirm, showToast } = useNotification();
const conversations = ref<any[]>([]);
const loading = ref(true);
const selectedConv = ref<any>(null);
const messages = ref<any[]>([]);
const loadingMessages = ref(false);

const fetchConversations = async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('chatbot_id', props.botId)
    .order('updated_at', { ascending: false });

  if (!error && data) {
    conversations.value = data;
  }
  loading.value = false;
};

const fetchMessages = async (conv: any) => {
  selectedConv.value = conv;
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

const deleteConversation = async (id: string) => {
  const confirmed = await askConfirm('Delete Conversation?', 'This will permanently remove this chat history.');
  if (!confirmed) return;

  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (!error) {
    conversations.value = conversations.value.filter(c => c.id !== id);
    if (selectedConv.value?.id === id) selectedConv.value = null;
    showToast('Conversation deleted', 'success');
  }
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(fetchConversations);
</script>

<template>
  <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex h-[650px]">
    <!-- List -->
    <div class="w-1/3 border-r border-gray-50 flex flex-col">
      <div class="p-6 border-b border-gray-50">
        <h3 class="font-bold text-gray-900 flex items-center">
          <MessageCircle class="w-5 h-5 mr-2 text-orange-500" />
          Chat History
        </h3>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="p-10 flex justify-center">
          <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
        </div>
        <div v-else-if="conversations.length === 0" class="p-10 text-center">
          <Inbox class="w-10 h-10 text-gray-200 mx-auto mb-4" />
          <p class="text-xs text-gray-400">No conversations yet</p>
        </div>
        <button v-for="conv in conversations" :key="conv.id"
          @click="fetchMessages(conv)"
          :class="['w-full p-4 text-left border-b border-gray-50 transition-all hover:bg-gray-50 flex items-center justify-between group', selectedConv?.id === conv.id ? 'bg-orange-50' : '']">
          <div class="flex items-center space-x-3 overflow-hidden">
            <div class="w-8 h-8 bg-gray-100 rounded-full flex-shrink-0 flex items-center justify-center text-gray-400">
              <User class="w-4 h-4" />
            </div>
            <div class="overflow-hidden">
              <h4 class="font-bold text-xs text-gray-900 truncate">{{ conv.visitor_id || 'Anonymous' }}</h4>
              <p class="text-[10px] text-gray-400 flex items-center mt-0.5">
                <Clock class="w-3 h-3 mr-1" />
                {{ formatDate(conv.updated_at) }}
              </p>
            </div>
          </div>
          <ChevronRight :class="['w-4 h-4 transition-all flex-shrink-0', selectedConv?.id === conv.id ? 'text-orange-500 translate-x-1' : 'text-gray-300 group-hover:translate-x-1']" />
        </button>
      </div>
    </div>

    <!-- Chat View -->
    <div class="flex-1 flex flex-col bg-gray-50/30">
      <div v-if="selectedConv" class="flex-1 flex flex-col">
        <div class="p-4 bg-white border-b border-gray-50 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="bg-orange-50 p-2 rounded-lg">
              <User class="text-orange-600 w-4 h-4" />
            </div>
            <div>
              <h3 class="font-bold text-sm">{{ selectedConv.visitor_id || 'Anonymous Visitor' }}</h3>
              <p class="text-[10px] text-gray-400">ID: {{ selectedConv.id.split('-')[0] }}...</p>
            </div>
          </div>
          <button @click="deleteConversation(selectedConv.id)" class="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <div v-if="loadingMessages" class="flex justify-center py-10">
            <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
          </div>
          <div v-for="msg in messages" :key="msg.id" 
            :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
            <div :class="['max-w-[80%] p-4 rounded-2xl text-sm shadow-sm', 
              msg.role === 'user' ? 'bg-gray-900 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100']">
              {{ msg.content }}
              <p class="text-[9px] mt-2 opacity-50">
                {{ new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-400">
        <div class="bg-white p-6 rounded-full shadow-sm mb-4">
          <MessageCircle class="w-8 h-8 text-gray-200" />
        </div>
        <p class="text-sm font-medium">Select a conversation to view history</p>
      </div>
    </div>
  </div>
</template>