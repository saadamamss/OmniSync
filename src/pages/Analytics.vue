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
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue';

const loading = ref(true);
const stats = ref({
  totalMessages: 0,
  totalConversations: 0,
  avgResponseMinutes: 0,
  conversionRate: 0
});

const botPerformance = ref<any[]>([]);
const chartData = ref<number[]>([]);
const chartLabels = ref<string[]>([]);

const trends = ref({
  messages: { current: 0, previous: 0, change: 0, direction: 'neutral' as 'up' | 'down' | 'neutral' },
  conversations: { current: 0, previous: 0, change: 0, direction: 'neutral' as 'up' | 'down' | 'neutral' }
});

const daysAgo = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date;
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const formatMinutes = (m: number) => {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min} min` : `${min} min`;
};

const formatPercent = (n: number) => `${Math.round(n * 10) / 10}%`;

const fetchAnalytics = async () => {
  loading.value = true;

  // ── Totals ──
  const { count: msgCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true });
  stats.value.totalMessages = msgCount || 0;

  const { count: convCount } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true });
  stats.value.totalConversations = convCount || 0;

  // ── Avg response minutes ──
  const { data: replies } = await supabase
    .from('messages')
    .select('created_at, conversation_id, role')
    .order('created_at', { ascending: true });

  let totalResponseMinutes = 0;
  let responseCount = 0;
  if (replies) {
    const byConv: Record<string, any[]> = {};
    replies.forEach((m: any) => {
      if (!byConv[m.conversation_id]) byConv[m.conversation_id] = [];
      byConv[m.conversation_id].push(m);
    });
    Object.values(byConv).forEach((msgs: any[]) => {
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
          const diffMs = new Date(msgs[i + 1].created_at).getTime() - new Date(msgs[i].created_at).getTime();
          totalResponseMinutes += diffMs / (1000 * 60);
          responseCount++;
        }
      }
    });
  }
  stats.value.avgResponseMinutes = responseCount > 0 ? totalResponseMinutes / responseCount : 0;

  // ── Conversion rate: leads / conversations ──
  const { count: leadCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true });
  stats.value.conversionRate =
    stats.value.totalConversations > 0
      ? (leadCount || 0) / stats.value.totalConversations
      : 0;

  // ── Last 7 days message data for chart ──
  const sevenDaysAgo = daysAgo(7);
  const { data: dailyMessages } = await supabase
    .from('messages')
    .select('created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at');

  const dailyCounts = new Array(7).fill(0);
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    labels.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][daysAgo(i).getDay()]);
  }
  chartLabels.value = labels;

  if (dailyMessages) {
    dailyMessages.forEach((msg: any) => {
      const d = dayKey(new Date(msg.created_at));
      labels.forEach((label, li) => {
        const labelDate = daysAgo(6 - li);
        if (dayKey(labelDate) === d) {
          dailyCounts[li] = (dailyCounts[li] || 0) + 1;
        }
      });
    });
  }
  chartData.value = dailyCounts;

  // ── Trend badges: last 7 days vs previous 7 days ──
  const last7Start = daysAgo(7);
  const prev7Start = daysAgo(14);
  const prev7End = daysAgo(7);

  const { data: msgsLast7 } = await supabase
    .from('messages')
    .select('created_at')
    .gte('created_at', last7Start.toISOString());
  const { data: msgsPrev7 } = await supabase
    .from('messages')
    .select('created_at')
    .gte('created_at', prev7Start.toISOString())
    .lt('created_at', prev7End.toISOString());

  const { data: convsLast7 } = await supabase
    .from('conversations')
    .select('created_at')
    .gte('created_at', last7Start.toISOString());
  const { data: convsPrev7 } = await supabase
    .from('conversations')
    .select('created_at')
    .gte('created_at', prev7Start.toISOString())
    .lt('created_at', prev7End.toISOString());

  const msgsCurrent = msgsLast7?.length || 0;
  const msgsPrevious = msgsPrev7?.length || 0;
  trends.value.messages.current = msgsCurrent;
  trends.value.messages.previous = msgsPrevious;
  trends.value.messages.change = msgsPrevious > 0
    ? ((msgsCurrent - msgsPrevious) / msgsPrevious) * 100
    : msgsCurrent > 0 ? 100 : 0;
  trends.value.messages.direction =
    trends.value.messages.change > 5 ? 'up'
    : trends.value.messages.change < -5 ? 'down'
    : 'neutral';

  const convsCurrent = convsLast7?.length || 0;
  const convsPrevious = convsPrev7?.length || 0;
  trends.value.conversations.current = convsCurrent;
  trends.value.conversations.previous = convsPrevious;
  trends.value.conversations.change = convsPrevious > 0
    ? ((convsCurrent - convsPrevious) / convsPrevious) * 100
    : convsCurrent > 0 ? 100 : 0;
  trends.value.conversations.direction =
    trends.value.conversations.change > 5 ? 'up'
    : trends.value.conversations.change < -5 ? 'down'
    : 'neutral';

  // ── Bot performance: real message counts + real lead counts ──
  const { data: bots } = await supabase
    .from('chatbots')
    .select('id, name');

  if (bots) {
    const botStats = await Promise.all(
      bots.map(async (bot) => {
        const { count: mCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('chatbot_id', bot.id);
        const { count: lCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('chatbot_id', bot.id);
        return {
          botId: bot.id,
          name: bot.name,
          messages: mCount || 0,
          leads: lCount || 0
        };
      })
    );

    const maxMessages = Math.max(...botStats.map(b => b.messages), 1);
    botPerformance.value = botStats.map(bot => ({
      ...bot,
      barWidth: maxMessages > 0 ? (bot.messages / maxMessages) * 100 : 0
    })).sort((a: any, b: any) => b.messages - a.messages);
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
        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" role="status" aria-busy="true">
          <div v-for="i in 4" :key="i" class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <BaseSkeleton className="w-10 h-10" rounded="rounded-xl" />
              <BaseSkeleton className="h-6 w-14" rounded="rounded-lg" />
            </div>
            <BaseSkeleton className="h-3 w-2/3" />
            <BaseSkeleton className="h-8 w-1/2" rounded="rounded-xl" />
          </div>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-orange-50 p-2.5 rounded-xl text-orange-600"><MessageSquare class="w-5 h-5" /></div>
              <span :class="['flex items-center text-xs font-bold px-2 py-1 rounded-lg', trends.messages.direction === 'up' ? 'text-green-500 bg-green-50' : trends.messages.direction === 'down' ? 'text-red-500 bg-red-50' : 'text-gray-500 bg-gray-50']">
                <ArrowUpRight class="w-3 h-3 mr-1" />
                {{ trends.messages.change > 0 ? '+' : '' }}{{ Math.round(trends.messages.change) }}%
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Total Messages</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ stats.totalMessages }}</p>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-blue-50 p-2.5 rounded-xl text-blue-600"><Users class="w-5 h-5" /></div>
              <span :class="['flex items-center text-xs font-bold px-2 py-1 rounded-lg', trends.conversations.direction === 'up' ? 'text-green-500 bg-green-50' : trends.conversations.direction === 'down' ? 'text-red-500 bg-red-50' : 'text-gray-500 bg-gray-50']">
                <ArrowUpRight class="w-3 h-3 mr-1" />
                {{ trends.conversations.change > 0 ? '+' : '' }}{{ Math.round(trends.conversations.change) }}%
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Conversations</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ stats.totalConversations }}</p>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-purple-50 p-2.5 rounded-xl text-purple-600"><Clock class="w-5 h-5" /></div>
              <span class="flex items-center text-xs font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
                {{ Math.round(stats.avgResponseMinutes) }} min avg
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Avg Response</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ formatMinutes(stats.avgResponseMinutes) }}</p>
          </div>

          <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center justify-between mb-4">
              <div class="bg-green-50 p-2.5 rounded-xl text-green-600"><TrendingUp class="w-5 h-5" /></div>
              <span class="flex items-center text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg">
                {{ stats.totalConversations > 0 ? Math.round((stats.conversionRate * 100) * 10) / 10 : 0 }}% conv
              </span>
            </div>
            <p class="text-sm font-bold text-gray-400 uppercase tracking-wider">Lead Conv.</p>
            <p class="text-3xl font-black text-gray-900 mt-1">{{ formatPercent(stats.conversionRate) }}</p>
          </div>
        </div>

        <div v-if="loading" class="space-y-8" role="status" aria-busy="true">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div v-for="i in 2" :key="i" class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div class="flex items-center justify-between mb-8">
                <BaseSkeleton className="h-5 w-40" rounded="rounded-lg" />
                <BaseSkeleton className="w-4 h-4" rounded="rounded-full" />
              </div>
              <div v-if="i === 1" class="flex items-end justify-between h-48 space-x-2">
                <div v-for="h in [55, 75, 40, 85, 60, 35, 70]" :key="h" class="flex-1">
                  <div class="w-full bg-gray-100/80 animate-pulse rounded-t-xl" :style="{ height: h + '%' }"></div>
                </div>
              </div>
              <div v-else class="space-y-6">
                <div v-for="r in 3" :key="r" class="space-y-2">
                  <div class="flex justify-between">
                    <BaseSkeleton className="h-3.5 w-28" />
                    <BaseSkeleton className="h-3.5 w-16" />
                  </div>
                  <BaseSkeleton className="h-2 w-full" rounded="rounded-full" />
                </div>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div class="p-8 border-b border-gray-50">
              <BaseSkeleton className="h-5 w-52" rounded="rounded-lg" />
            </div>
            <div class="divide-y divide-gray-50">
              <div v-for="r in 3" :key="r" class="px-8 py-6 flex items-center">
                <BaseSkeleton className="h-4 w-40 mr-10" />
                <BaseSkeleton className="h-4 w-16 mr-10" />
                <BaseSkeleton className="h-4 w-16 mr-10" />
                <BaseSkeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        </div>

        <template v-else>
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
                <span class="text-[10px] font-bold text-gray-400 mt-2">{{ chartLabels[i] }}</span>
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
                  <div class="h-full bg-blue-500 rounded-full transition-all duration-1000" :style="{ width: bot.barWidth + '%' }"></div>
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
                    <span class="text-gray-400 font-medium">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </template>
      </div>
    </div>
  </DashboardLayout>
</template>