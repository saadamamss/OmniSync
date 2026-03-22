<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, Calendar, Search, Download, Loader2, Inbox } from 'lucide-vue-next';

const leads = ref<any[]>([]);
const loading = ref(true);
const searchQuery = ref('');

const fetchLeads = async () => {
  loading.value = true;
  const { data, error } = await supabase
    .from('conversations')
    .select(`*, chatbots(name)`)
    .not('visitor_id', 'is', null)
    .order('created_at', { ascending: false });

  if (!error && data) {
    // استخراج الاسم والإيميل من visitor_id (الذي نخزنه بصيغة "Name (Email)")
    leads.value = data.map(lead => {
      const match = lead.visitor_id.match(/(.*)\s\((.*)\)/);
      return {
        ...lead,
        name: match ? match[1] : lead.visitor_id,
        email: match ? match[2] : 'N/A'
      };
    });
  }
  loading.value = false;
};

const exportLeads = () => {
  const csv = [
    ['Name', 'Email', 'Bot', 'Date'],
    ...leads.value.map(l => [l.name, l.email, l.chatbots?.name, new Date(l.created_at).toLocaleDateString()])
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

onMounted(fetchLeads);
</script>

<template>
  <DashboardLayout>
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-4 md:space-y-0">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Leads & Contacts</h1>
          <p class="text-gray-500 mt-1">People who started a conversation with your bots.</p>
        </div>
        <button @click="exportLeads" class="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold flex items-center hover:bg-gray-800 transition-all shadow-lg shadow-gray-200">
          <Download class="w-5 h-5 mr-2" /> Export CSV
        </button>
      </div>

      <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div class="p-6 border-b border-gray-50">
          <div class="relative">
            <Search class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input v-model="searchQuery" type="text" placeholder="Search leads..." 
              class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all" />
          </div>
        </div>

        <div v-if="loading" class="p-20 flex justify-center">
          <Loader2 class="w-10 h-10 animate-spin text-orange-500" />
        </div>

        <div v-else-if="leads.length > 0" class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-gray-50/50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th class="px-8 py-4">Contact</th>
                <th class="px-8 py-4">Source Bot</th>
                <th class="px-8 py-4">Date Joined</th>
                <th class="px-8 py-4">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="lead in leads" :key="lead.id" class="hover:bg-gray-50/50 transition-colors">
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