<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { 
  BarChart3, 
  TrendingUp, 
  MessageSquare, 
  Users, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Target,
  Zap
} from 'lucide-vue-next';

const loading = ref(true);
const stats = ref({
  totalMessages: 0,
  totalConversations: 0,
  avgResponseTime: '1.2s',
  conversionRate: '12.5%'
});

const botPerformance = ref<any[]>([]);

const chartData = ref<number[]>([]);

const fetchAnalytics = async () => {
  loading.value = true;
  
  // Get total counts
  const { count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
  stats.value.totalMessages = msgCount || 0;

  const { count: convCount } = await supabase.from('conversations').select('*', { count: 'exact', head: true });
  stats.value.totalConversations = convCount || 0;

  // Get last 7 days message data
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data: dailyMessages } = await supabase
    .from('messages')
    .select('created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at');
  
  // Process daily message counts for chart
  const dailyCounts = new Array(7).fill(0);
  if (dailyMessages) {
    dailyMessages.forEach(msg => {
      const dayIndex = new Date(msg.created_at).getDay();
      dailyCounts[dayIndex] = (dailyCounts[dayIndex] || 0) + 1;
    });
  }
  chartData.value = dailyCounts;

  // Get bot performance with real message counts
  const { data: bots } = await supabase.from('chatbots').select('id, name');
  if (bots) {
    const botMessageCounts = await Promise.all(
      bots.map(async (bot) => {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('chatbot_id', bot.id);
        return { botId: bot.id, count: count || 0 };
      })
    );
    
    botPerformance.value = bots.map(bot => {
      const messageCount = botMessageCounts.find(bm => bm.botId === bot.id)?.count || 0;
      return {
        name: bot.name,
        messages: messageCount,
        leads: 0, // Will be calculated later when leads tracking is implemented
        satisfaction: 'Coming soon'
      };
    }).sort((a, b) => b.messages - a.messages);
  }

  loading.value = false;
};

onMounted(fetchAnalytics);
</script>

<template>
  <DashboardLayout>
    <div class="max-w-6xl mx-auto">
      <div class="mb-10">
        <h1 class="text-3xl font-bold text-gray-900">Advanced Analytics</h1>
        <p class="text-gray-500 mt-1">Track your AI performance and customer engagement metrics.</p>
      </div>

      <div v-if="loading" class="py-20 flex justify-center">
        <Loader2 class="w-10 h-10 animate-spin text-orange-500" />
      </div>

      <div v-else class="space-y-8">
        <!-- Key Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-orange-50 p-2.5 rounded-xl text-orange-600"><MessageSquare class="w-5 h-5" /></div>
              <span class="flex items-center text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg">
                <ArrowUpRight class="w-3 h-3 mr-1" /> +14%
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Total Messages</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ stats.totalMessages }}</p>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-blue-50 p-2.5 rounded-xl text-blue-600"><Users class="w-5 h-5" /></div>
              <span class="flex items-center text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg">
                <ArrowUpRight class="w-3 h-3 mr-1" /> +8%
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Conversations</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ stats.totalConversations }}</p>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-purple-50 p-2.5 rounded-xl text-purple-600"><Clock class="w-5 h-5" /></div>
              <span class="flex items-center text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg">
                <ArrowDownRight class="w-3 h-3 mr-1" /> -2%
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Avg Response</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ stats.avgResponseTime }}</p>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-green-50 p-2.5 rounded-xl text-green-600"><TrendingUp class="w-5 h-5" /></div>
              <span class="flex items-center text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg">
                <ArrowUpRight class="w-3 h-3 mr-1" /> +5%
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Lead Conv.</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ stats.conversionRate }}</p>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div class="flex items-center justify-between mb-8">
              <h3 class="text-xl font-bold">Message Volume</h3>
              <div class="flex space-x-2">
                <span class="w-3 h-3 bg-orange-500 rounded-full"></span>
                <span class="text-[10px] font-bold text-gray-400 uppercase">Last 7 Days</span>
              </div>
            </div>
            <div class="flex items-end justify-between h-48 space-x-2">
              <div v-for="(height, i) in chartData" :key="i" class="flex-1 flex flex-col items-center group">
                <div class="w-full bg-orange-100 rounded-t-xl transition-all group-hover:bg-orange-500" 
                  :style="{ height: Math.max(height > 0 ? (height / Math.max(...chartData) * 80) : 20, 20) + '%' }"></div>
                <span class="text-[10px] font-bold text-gray-400 mt-2">{{ ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i] }}</span>
              </div>
            </div>
          </div>

          <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div class="flex items-center justify-between mb-8">
              <h3 class="text-xl font-bold">Bot Performance</h3>
              <div class="bg-blue-50 p-2 rounded-lg text-blue-600"><Target class="w-4 h-4" /></div>
            </div>
            <div class="space-y-6">
              <div v-for="bot in botPerformance" :key="bot.name" class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="font-bold text-gray-900">{{ bot.name }}</span>
                  <span class="text-gray-500">{{ bot.messages }} msgs</span>
                </div>
                <div class="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-500 rounded-full transition-all duration-1000" :style="{ width: (bot.messages / 600 * 100) + '%' }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Detailed Table -->
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div class="p-8 border-b border-gray-50 flex items-center justify-between">
            <h3 class="text-xl font-bold">Detailed Bot Metrics</h3>
            <div class="bg-gray-50 p-2 rounded-xl text-gray-400"><Zap class="w-4 h-4" /></div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-gray-50/50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <tr>
                  <th class="px-8 py-4">Bot Name</th>
                  <th class="px-8 py-4">Total Messages</th>
                  <th class="px-8 py-4">Leads Collected</th>
                  <th class="px-8 py-4">Satisfaction Score</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                <tr v-for="bot in botPerformance" :key="bot.name" class="hover:bg-gray-50/50 transition-colors">
                  <td class="px-8 py-6 font-bold text-gray-900">{{ bot.name }}</td>
                  <td class="px-8 py-6 text-gray-600">{{ bot.messages }}</td>
                  <td class="px-8 py-6 text-gray-600">{{ bot.leads }}</td>
                  <td class="px-8 py-6">
                    <span class="text-gray-400 font-medium">Coming soon</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>