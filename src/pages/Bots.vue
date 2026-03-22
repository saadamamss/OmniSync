<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted, computed } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { useNotification } from '@/composables/useNotification';
import { 
  Plus, 
  MessageSquare, 
  Search, 
  Trash2, 
  Settings,
  Loader2,
  ExternalLink,
  AlertTriangle,
  ArrowUpCircle,
  PauseCircle,
  Zap
} from 'lucide-vue-next';

const { askConfirm, showToast } = useNotification();
const bots = ref<any[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const userPlan = ref('starter');

const PLAN_LIMITS: Record<string, number> = {
  'starter': 1,
  'pro': 5,
  'enterprise': 100
};

const fetchBots = async () => {
  loading.value = true;
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user?.id).single();
  userPlan.value = profile?.plan || 'starter';

  const { data, error } = await supabase
    .from('chatbots')
    .select('*')
    .order('created_at', { ascending: true }); // Order by oldest first

  if (!error && data) {
    bots.value = data;
  }
  loading.value = false;
};

const isOverLimit = computed(() => {
  return bots.value.length > PLAN_LIMITS[userPlan.value];
});

const filteredBots = computed(() => {
  return bots.value.filter(bot => 
    bot.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const getBotStatus = (bot: any) => {
  return bot.is_active ? 'active' : 'paused';
};

const deleteBot = async (id: string) => {
  const confirmed = await askConfirm(
    'Delete Chatbot?',
    'This action cannot be undone. All training data and conversations will be permanently removed.'
  );
  
  if (!confirmed) return;
  
  const { error } = await supabase.from('chatbots').delete().eq('id', id);

  if (!error) {
    bots.value = bots.value.filter(b => b.id !== id);
    showToast('Chatbot deleted successfully', 'success');
  } else {
    showToast(error.message, 'error');
  }
};

const activateBot = async (bot: any) => {
  const limits: Record<string, number> = { starter: 1, pro: 5, enterprise: 1000 };
  const limit = limits[userPlan.value];
  const activeCount = bots.value.filter(b => b.is_active).length;
  
  if (activeCount >= limit) {
    showToast(`You've reached your plan limit (${limit} bots). Deactivate another bot first.`, 'error');
    return;
  }

  const { error } = await supabase
    .from('chatbots')
    .update({ is_active: true })
    .eq('id', bot.id);

  if (!error) {
    bot.is_active = true;
    showToast(`"${bot.name}" is now active!`, 'success');
  }
};

onMounted(fetchBots);
</script>

<template>
  <DashboardLayout>
    <div class="max-w-6xl mx-auto">
      <!-- Warning Banner -->
      <div v-if="isOverLimit" class="mb-8 bg-orange-50 border border-orange-200 p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between">
        <div class="flex items-center space-x-4 mb-4 md:mb-0">
          <div class="bg-orange-500 p-3 rounded-2xl text-white shadow-lg shadow-orange-200">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div>
            <h3 class="font-bold text-orange-900">Plan Limit Exceeded</h3>
            <p class="text-sm text-orange-700">Some bots are paused. Your <span class="font-black capitalize">{{ userPlan }}</span> plan only allows {{ PLAN_LIMITS[userPlan] }} active bot(s).</p>
          </div>
        </div>
        <router-link to="/dashboard/settings" class="bg-orange-600 text-white px-6 py-3 rounded-xl font-bold flex items-center hover:bg-orange-700 transition-all shadow-md">
          <ArrowUpCircle class="w-5 h-5 mr-2" /> Upgrade Plan
        </router-link>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">My Chatbots</h1>
          <p class="text-gray-500 mt-1">Manage and monitor all your AI assistants.</p>
        </div>
        <router-link to="/dashboard/create" 
          :class="['px-6 py-3 rounded-xl font-bold flex items-center transition-all shadow-lg', isOverLimit ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800 shadow-gray-200']">
          <Plus class="w-5 h-5 mr-2" />
          Create New Bot
        </router-link>
      </div>

      <div class="mb-6 relative">
        <Search class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
        <input v-model="searchQuery" type="text" placeholder="Search your chatbots..." 
          class="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-sm" />
      </div>

      <div v-if="loading" class="py-20 flex flex-col items-center justify-center text-gray-400">
        <Loader2 class="w-10 h-10 animate-spin mb-4 text-orange-500" />
        <p class="font-medium">Loading your assistants...</p>
      </div>

      <div v-else-if="filteredBots.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="(bot, index) in filteredBots" :key="bot.id" 
          class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
          :class="{ 'opacity-75 grayscale-[0.5]': getBotStatus(bot) === 'paused' }">
          
          <div class="flex items-start justify-between mb-6 relative z-10">
            <div :class="['p-3 rounded-2xl', getBotStatus(bot) === 'active' ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-400']">
              <MessageSquare v-if="getBotStatus(bot) === 'active'" class="w-6 h-6" />
              <PauseCircle v-else class="w-6 h-6" />
            </div>
            <div class="flex space-x-1">
              <router-link :to="`/dashboard/bots/${bot.id}`" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all">
                <Settings class="w-5 h-5" />
              </router-link>
              <button @click="deleteBot(bot.id)" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                <Trash2 class="w-5 h-5" />
              </button>
            </div>
          </div>

          <h3 class="text-xl font-bold text-gray-900 mb-2 relative z-10">{{ bot.name }}</h3>
          
          <div class="flex items-center space-x-2 mb-6 relative z-10">
            <span v-if="getBotStatus(bot) === 'active'" class="text-xs px-2.5 py-1 rounded-full font-bold bg-green-50 text-green-600">Active</span>
            <span v-else class="text-xs px-2.5 py-1 rounded-full font-bold bg-orange-100 text-orange-700">Paused (Over Limit)</span>
            <span class="text-xs text-gray-400 capitalize">{{ bot.settings?.source_type }} source</span>
          </div>

          <div v-if="getBotStatus(bot) === 'paused'" class="pt-6 border-t border-gray-50 flex items-center justify-between relative z-10">
            <!-- Activate button -->
            <button
              @click="activateBot(bot)"
              class="text-sm font-bold text-green-600 flex items-center hover:underline"
            >
              <Zap class="w-4 h-4 mr-1" /> Activate
            </button>
            <span class="text-xs text-gray-400">Paused</span>
          </div>
          
          <div v-else class="pt-6 border-t border-gray-50 flex items-center justify-between relative z-10">
            <router-link :to="`/dashboard/bots/${bot.id}`" class="text-sm font-bold text-gray-900 flex items-center hover:text-orange-600 transition-colors">
              Manage <ExternalLink class="w-4 h-4 ml-1.5" />
            </router-link>
          </div>
        </div>
      </div>

      <div v-else class="bg-white p-20 rounded-[3rem] border border-gray-100 shadow-sm text-center">
        <div class="bg-orange-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <MessageSquare class="text-orange-600 w-10 h-10" />
        </div>
        <h3 class="text-2xl font-bold text-gray-900 mb-2">No chatbots found</h3>
        <router-link to="/dashboard/create" class="inline-block bg-gray-900 text-white px-10 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all">
          Create your first bot
        </router-link>
      </div>
    </div>
  </DashboardLayout>
</template>