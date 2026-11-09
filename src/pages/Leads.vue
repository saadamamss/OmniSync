<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted, computed } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { useNotification } from '@/composables/useNotification';
import { User, Mail, Calendar, Search, Download, Loader2, Inbox, Filter, Bot } from 'lucide-vue-next';

const { showToast } = useNotification();

const leads = ref<any[]>([]);
const bots = ref<any[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const botFilter = ref('');
const statusFilter = ref('');

const statusOptions = ['new', 'contacted', 'won', 'lost'];

const filteredLeads = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return leads.value.filter(lead => {
    const matchSearch = !q ||
      lead.name.toLowerCase().includes(q) ||
      lead.email.toLowerCase().includes(q) ||
      lead.chatbots?.name?.toLowerCase().includes(q);
    const matchBot = !botFilter.value || lead.chatbot_id === botFilter.value;
    const matchStatus = !statusFilter.value || lead.status === statusFilter.value;
    return matchSearch && matchBot && matchStatus;
  });
});

const fetchBots = async () => {
  const { data, error } = await supabase
    .from('chatbots')
    .select('id, name')
    .order('name', { ascending: true });
  if (!error && data) {
    bots.value = data;
  }
};

const fetchLeads = async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      chatbots (name)
    `)
    .order('created_at', { ascending: false });

  if (!error && data) {
    leads.value = data;
  }
  loading.value = false;
};

const updateLeadStatus = async (leadId: string, newStatus: string) => {
  const { error } = await supabase
    .from('leads')
    .update({ status: newStatus })
    .eq('id', leadId);
  if (error) {
    console.error('Error updating lead status:', error);
    showToast('Could not update lead status. Try again.', 'error');
  } else {
    const lead = leads.value.find(l => l.id === leadId);
    if (lead) lead.status = newStatus;
  }
};

const exportLeads = () => {
  // Export respects the active filters — what you see is what you get.
  const rows = filteredLeads.value;
  const csv = [
    ['Name', 'Email', 'Status', 'Bot', 'Date'],
    ...rows.map(l => [
      l.name,
      l.email,
      l.status,
      l.chatbots?.name,
      new Date(l.created_at).toLocaleDateString()
    ])
  ].map(e => e.join(",")).join("\n");

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'leads.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

onMounted(async () => {
  await fetchBots();
  await fetchLeads();
});
</script>

<template>
  <DashboardLayout>
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-4 md:space-y-0">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Leads & Contacts</h1>
          <p class="text-gray-500 mt-1">People who started a conversation with your bots.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <button @click="exportLeads" class="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold flex items-center hover:bg-gray-800 transition-all shadow-lg shadow-gray-200">
            <Download class="w-5 h-5 mr-2" /> Export CSV
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-4 mb-6">
        <div class="relative w-full md:w-64">
          <Search class="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input v-model="searchQuery" type="text" placeholder="Search name, email, or bot..."
            class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
        </div>
        <div class="relative w-full md:w-64">
          <Bot class="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <select v-model="botFilter" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
            <option value="">All bots</option>
            <option v-for="bot in bots" :key="bot.id" :value="bot.id">{{ bot.name }}</option>
          </select>
        </div>
        <div class="relative w-full md:w-64">
          <Filter class="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <select v-model="statusFilter" class="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
            <option value="">All statuses</option>
            <option v-for="s in statusOptions" :key="s" :value="s">{{ s.charAt(0).toUpperCase() + s.slice(1) }}</option>
          </select>
        </div>
      </div>

      <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div v-if="loading" class="p-20 flex justify-center">
          <Loader2 class="w-10 h-10 animate-spin text-orange-500" />
        </div>

        <div v-else-if="leads.length > 0" class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-gray-50/50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-8 py-4">Contact</th>
                <th class="px-8 py-4">Source Bot</th>
                <th class="px-8 py-4">Status</th>
                <th class="px-8 py-4">Date Joined</th>
                <th class="px-8 py-4">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="lead in filteredLeads" :key="lead.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-8 py-6">
                  <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center text-orange-600">
                      <User class="w-5 h-5" />
                    </div>
                    <div>
                      <p class="font-bold text-gray-900">{{ lead.name }}</p>
                      <p class="text-xs text-gray-500 flex items-center mt-0.5"><Mail class="w-3 h-3 mr-1" /> {{ lead.email }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-8 py-6">
                  <span class="text-sm font-medium text-gray-600">{{ lead.chatbots?.name }}</span>
                </td>
                <td class="px-8 py-6">
                  <select v-model="lead.status" @change="updateLeadStatus(lead.id, lead.status)"
                    class="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
                    <option v-for="s in statusOptions" :key="s" :value="s">{{ s.charAt(0).toUpperCase() + s.slice(1) }}</option>
                  </select>
                </td>
                <td class="px-8 py-6">
                  <span class="text-sm text-gray-400 flex items-center"><Calendar class="w-4 h-4 mr-2" /> {{ new Date(lead.created_at).toLocaleDateString() }}</span>
                </td>
                <td class="px-8 py-6">
                  <router-link to="/dashboard/conversations" class="text-sm font-bold text-orange-600 hover:underline">View Chat</router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="p-20 text-center">
          <Inbox class="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h3 class="text-xl font-bold text-gray-900 mb-2">No leads yet</h3>
          <p class="text-gray-500">Enable "Lead Generation" in your bot settings to start collecting contacts.</p>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>