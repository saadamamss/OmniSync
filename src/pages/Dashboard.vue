<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted, computed } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { useNotification } from '@/composables/useNotification';
import { 
  Plus, 
  MessageSquare, 
  Settings, 
  Loader2,
  TrendingUp,
  Users,
  MessageCircle,
  ArrowRight,
  Zap,
  CheckCircle2,
  Circle,
  AlertTriangle
} from 'lucide-vue-next';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
const { showToast } = useNotification();

const bots = ref<any[]>([]);
const recentConversations = ref<any[]>([]);
const loading = ref(true);
const userPlan = ref('starter');
const stats = ref({
  totalBots: 0,
  totalConversations: 0,
  totalMessages: 0
});

const PLAN_LIMITS: Record<string, number> = {
  'starter': 1,
  'pro': 5,
  'enterprise': 100
};

const isOverLimit = computed(() => {
  return stats.value.totalBots > PLAN_LIMITS[userPlan.value];
});

const onboardingSteps = computed(() => [
  { id: 1, title: 'Create your first chatbot', done: stats.value.totalBots > 0, link: '/dashboard/create' },
  { id: 2, title: 'Train with your data', done: stats.value.totalBots > 0, link: '/dashboard/bots' },
  { id: 3, title: 'Customize appearance', done: stats.value.totalBots > 0, link: '/dashboard/bots' },
  { id: 4, title: 'Embed on your website', done: stats.value.totalConversations > 0, link: '/dashboard/bots' }
]);

const usagePercentage = computed(() => {
  const limit = PLAN_LIMITS[userPlan.value] || 1;
  return Math.min(Math.round((stats.value.totalBots / limit) * 100), 100);
});

const fetchDashboardData = async () => {
  loading.value = true;
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
  userPlan.value = profile?.plan || 'starter';

  const { data: botsData } = await supabase
    .from('chatbots')
    .select('*')
    .order('created_at', { ascending: false });

  if (botsData) {
    bots.value = botsData;
    stats.value.totalBots = botsData.length;
  }

  const { count: convCount } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true });
  
  stats.value.totalConversations = convCount || 0;

  const { data: recentConv } = await supabase
    .from('conversations')
    .select(`
      *,
      chatbots (name)
    `)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (recentConv) {
    recentConversations.value = recentConv;
  }

  const { count: msgCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true });
    
  stats.value.totalMessages = msgCount || 0;

  loading.value = false;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(() => {
  fetchDashboardData();
  if (route.query.status === 'success') {
    showToast('Payment successful! Your plan is being updated.', 'success');
    setTimeout(fetchDashboardData, 3000);
  }
});
</script>

<template>
  <DashboardLayout>
    <div class="max-w-6xl mx-auto">
      <!-- Over Limit Warning -->
      <div v-if="isOverLimit" class="mb-8 bg-red-50 border border-red-100 p-6 rounded-[2.5rem] flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <div class="bg-red-500 p-3 rounded-2xl text-white">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div>
            <h3 class="font-bold text-red-900">Action Required</h3>
            <p class="text-sm text-red-700">You are over your plan limit. Please upgrade or delete some bots to continue creating.</p>
          </div>
        </div>
        <router-link to="/dashboard/settings" class="bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 transition-all">
          Upgrade Now
        </router-link>
      </div>

      <div class="flex flex-col md:flex-row md:items-end justify-between mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p class="text-gray-500 mt-1">Monitor your AI performance and recent activity.</p>
        </div>
        <router-link to="/dashboard/create" 
          :class="['px-6 py-3 rounded-xl font-bold flex items-center transition-all shadow-lg', isOverLimit ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200']">
          <Plus class="w-5 h-5 mr-2" />
          Create New Bot
        </router-link>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <MessageSquare class="w-12 h-12 text-orange-600" />
          </div>
          <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Total Chatbots</p>
          <p class="text-4xl font-black text-gray-900 mt-2">{{ stats.totalBots }}</p>
          <div class="mt-4">
            <div class="flex justify-between text-[10px] font-bold mb-1">
              <span class="text-gray-400">PLAN USAGE</span>
              <span :class="isOverLimit ? 'text-red-600' : 'text-orange-600'">{{ stats.totalBots }} / {{ PLAN_LIMITS[userPlan] }}</span>
            </div>
            <div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div :class="['h-full transition-all duration-1000', isOverLimit ? 'bg-red-500' : 'bg-orange-500']" :style="{ width: usagePercentage + '%' }"></div>
            </div>
          </div>
        </div>
        
        <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Users class="w-12 h-12 text-blue-600" />
          </div>
          <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Conversations</p>
          <p class="text-4xl font-black text-gray-900 mt-2">{{ stats.totalConversations }}</p>
          <div class="mt-4 flex items-center text-xs font-bold text-blue-600 bg-blue-50 w-fit px-2 py-1 rounded-lg">
            Active interactions
          </div>
        </div>

        <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <MessageCircle class="w-12 h-12 text-purple-600" />
          </div>
          <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Total Messages</p>
          <p class="text-4xl font-black text-gray-900 mt-2">{{ stats.totalMessages }}</p>
          <div class="mt-4 flex items-center text-xs font-bold text-purple-600 bg-purple-50 w-fit px-2 py-1 rounded-lg">
            AI Automated
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Onboarding Checklist -->
        <div class="lg:col-span-2 space-y-6">
          <div v-if="stats.totalConversations === 0" class="bg-white p-8 rounded-[2.5rem] border border-orange-100 shadow-sm bg-gradient-to-br from-white to-orange-50/30">
            <h2 class="text-xl font-bold mb-6 flex items-center">
              <Zap class="w-5 h-5 mr-2 text-orange-500" />
              Quick Start Guide
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <router-link v-for="step in onboardingSteps" :key="step.id" :to="step.link"
                class="flex items-center p-4 rounded-2xl border transition-all group"
                :class="step.done ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100 hover:border-orange-200 hover:shadow-md'">
                <div class="mr-4">
                  <CheckCircle2 v-if="step.done" class="w-6 h-6 text-green-500" />
                  <Circle v-else class="w-6 h-6 text-gray-200 group-hover:text-orange-300" />
                </div>
                <span :class="['font-bold text-sm', step.done ? 'text-green-700 line-through opacity-60' : 'text-gray-700']">{{ step.title }}</span>
              </router-link>
            </div>
          </div>

          <!-- Recent Bots -->
          <div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="p-6 border-b border-gray-50 flex justify-between items-center">
              <h2 class="font-bold text-lg">Your Chatbots</h2>
              <router-link to="/dashboard/bots" class="text-orange-600 text-sm font-bold hover:underline">View All</router-link>
            </div>

            <div v-if="loading" class="p-12 flex justify-center">
              <Loader2 class="w-8 h-8 animate-spin text-orange-500" />
            </div>

            <div v-else-if="bots.length > 0" class="divide-y divide-gray-50">
              <div v-for="bot in bots.slice(0, 3)" :key="bot.id" class="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div class="flex items-center space-x-4">
                  <div class="bg-orange-50 p-3 rounded-2xl">
                    <MessageSquare class="text-orange-600 w-6 h-6" />
                  </div>
                  <div>
                    <h3 class="font-bold text-gray-900">{{ bot.name }}</h3>
                    <p class="text-xs text-gray-400 capitalize">{{ bot.settings?.source_type }} source</p>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <router-link :to="`/dashboard/bots/${bot.id}`" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                    <Settings class="w-5 h-5" />
                  </router-link>
                </div>
              </div>
            </div>

            <div v-else class="p-12 text-center">
              <p class="text-gray-400">No chatbots created yet.</p>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="space-y-6">
          <div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="p-6 border-b border-gray-50">
              <h2 class="font-bold text-lg">Recent Activity</h2>
            </div>
            
            <div v-if="loading" class="p-12 flex justify-center">
              <Loader2 class="w-6 h-6 animate-spin text-orange-500" />
            </div>

            <div v-else-if="recentConversations.length > 0" class="divide-y divide-gray-50">
              <router-link v-for="conv in recentConversations" :key="conv.id" to="/dashboard/conversations"
                class="p-4 block hover:bg-gray-50 transition-all group">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-bold text-gray-900">{{ conv.chatbots?.name }}</span>
                  <span class="text-[10px] text-gray-400">{{ formatDate(conv.updated_at) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-[10px] text-gray-500 truncate pr-4">New interaction from visitor</p>
                  <ArrowRight class="w-3 h-3 text-gray-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                </div>
              </router-link>
            </div>

            <div v-else class="p-12 text-center">
              <p class="text-xs text-gray-400">No recent activity.</p>
            </div>
          </div>

          <!-- Quick Tip -->
          <div class="bg-gray-900 p-6 rounded-3xl text-white relative overflow-hidden">
            <div class="absolute -right-4 -bottom-4 opacity-10">
              <Zap class="w-24 h-24" />
            </div>
            <h4 class="font-bold mb-2">Pro Tip</h4>
            <p class="text-xs text-gray-400 leading-relaxed">
              Upgrade to Pro to create up to 5 chatbots and get priority support.
            </p>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>