<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/integrations/supabase/client';
import { 
  Globe, 
  FileText, 
  Type, 
  ArrowRight, 
  Loader2,
  ChevronLeft,
  AlertCircle,
  Upload,
  CheckCircle2,
  Sparkles
} from 'lucide-vue-next';
import { useNotification } from '@/composables/useNotification';

const router = useRouter();
const { showToast } = useNotification();
const step = ref(1);
const botName = ref('');
const sourceType = ref('website');
const sourceValue = ref('');
const loading = ref(false);
const checkingPlan = ref(true);
const planLimitReached = ref(false);
const userPlan = ref('starter');
const fileInput = ref<HTMLInputElement | null>(null);
const trainingStatus = ref<{ pages: number, chunks: number } | null>(null);

const PLAN_LIMITS: Record<string, number> = {
  'starter': 1,
  'pro': 5,
  'enterprise': 1000
};

const canUsePDF = computed(() =>
  ['pro', 'enterprise'].includes(userPlan.value)
);

const checkPlanLimits = async () => {
  checkingPlan.value = true;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();
  
  userPlan.value = profile?.plan || 'starter';

  const { count } = await supabase
    .from('chatbots')
    .select('*', { count: 'exact', head: true });

  const currentCount = count || 0;
  const limit = PLAN_LIMITS[userPlan.value];

  if (currentCount >= limit) {
    planLimitReached.value = true;
  }
  checkingPlan.value = false;
};

const chunkText = (text: string, wordsPerChunk = 600) => {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }
  return chunks;
};

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  if (file.type === 'application/pdf') {
    // For PDF files, we'll store the file reference and process it differently
    sourceValue.value = file.name; // Store filename as reference
  } else {
    // For text files, read content as before
    const reader = new FileReader();
    reader.onload = (e) => {
      sourceValue.value = e.target?.result as string;
    };
    reader.readAsText(file);
  }
  target.value = '';
};

const handleCreate = async () => {
  if (planLimitReached.value) return;
  
  loading.value = true;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // 1. Create the chatbot
  const { data: bot, error: botError } = await supabase
    .from('chatbots')
    .insert({
      name: botName.value,
      user_id: user.id,
      settings: {
        source_type: sourceType.value,
        source_value: sourceType.value === 'website' ? sourceValue.value : '', 
        appearance: {
          primaryColor: '#f97316',
          welcomeMessage: 'Hello! How can I help you today?',
          botName: botName.value,
          userPlaceholder: 'Type your message...'
        }
      }
    })
    .select()
    .single();

  if (botError) {
    showToast(botError.message, 'error');
    loading.value = false;
    return;
  }

  // 2. Handle Training Data
  if (sourceType.value === 'website') {
    try {
      const { data, error } = await supabase.functions.invoke('import_website_training', {
        body: { chatbot_id: bot.id, website_url: sourceValue.value }
      });
      
      if (!error && data) {
        trainingStatus.value = {
          pages: data.pages_scanned,
          chunks: data.chunks_created
        };
        // Wait 2 seconds to show success before redirecting
        setTimeout(() => router.push('/dashboard/bots'), 2500);
      } else {
        router.push('/dashboard/bots');
      }
    } catch (e) {
      console.error("Scraping failed:", e);
      router.push('/dashboard/bots');
    }
  } else if (sourceType.value === 'pdf') {
    // For PDF, we'll store the filename and process it later
    // In a real implementation, you'd upload the PDF to storage and process it
    await supabase
      .from('knowledge_chunks')
      .insert([{
        chatbot_id: bot.id,
        content: `PDF uploaded: ${sourceValue.value}`,
        title: 'PDF Document'
      }]);
    router.push('/dashboard/bots');
  } else {
    if (sourceValue.value.trim()) {
      const chunks = chunkText(sourceValue.value);
      await supabase
        .from('knowledge_chunks')
        .insert(chunks.map(content => ({
          chatbot_id: bot.id,
          content,
          title: 'Initial Training'
        })));
    }
    router.push('/dashboard/bots');
  }
};

onMounted(checkPlanLimits);
</script>

<template>
  <DashboardLayout>
    <div class="max-w-3xl mx-auto">
      <div v-if="checkingPlan" class="py-20 flex flex-col items-center justify-center">
        <Loader2 class="w-10 h-10 animate-spin text-orange-500 mb-4" />
        <p class="text-gray-500">Checking your subscription limits...</p>
      </div>

      <div v-else-if="planLimitReached" class="bg-white p-12 rounded-[3rem] border border-gray-100 shadow-sm text-center">
        <div class="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle class="text-red-500 w-10 h-10" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 mb-2">Plan Limit Reached</h2>
        <p class="text-gray-500 mb-8">
          Your current <span class="font-bold text-orange-600 capitalize">{{ userPlan }}</span> plan allows only {{ PLAN_LIMITS[userPlan] }} chatbot. 
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <button @click="router.back()" class="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold border border-gray-200 hover:bg-gray-50 transition-all">
            Go Back
          </button>
          <router-link to="/dashboard/settings" class="w-full sm:w-auto bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all">
            Upgrade Plan
          </router-link>
        </div>
      </div>

      <div v-else>
        <div class="mb-10">
          <button @click="router.back()" class="flex items-center text-gray-500 hover:text-gray-900 mb-4 transition-colors">
            <ChevronLeft class="w-4 h-4 mr-1" />
            Back
          </button>
          <h1 class="text-3xl font-bold text-gray-900">Create a new Chatbot</h1>
          <p class="text-gray-500 mt-2">Follow the steps to train your AI assistant.</p>
        </div>

        <div class="flex items-center space-x-4 mb-12">
          <div :class="['h-2 flex-1 rounded-full transition-all duration-500', step >= 1 ? 'bg-orange-500' : 'bg-gray-200']"></div>
          <div :class="['h-2 flex-1 rounded-full transition-all duration-500', step >= 2 ? 'bg-orange-500' : 'bg-gray-200']"></div>
        </div>

        <div v-if="step === 1" class="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <h2 class="text-xl font-bold mb-6">Give your chatbot a name</h2>
          <div class="space-y-4">
            <label class="block text-sm font-medium text-gray-700">Chatbot Name</label>
            <input v-model="botName" type="text" placeholder="e.g. My Support Assistant"
              class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none transition-all" />
            <button @click="step = 2" :disabled="!botName"
              class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center justify-center">
              Next Step
              <ArrowRight class="ml-2 w-5 h-5" />
            </button>
          </div>
        </div>

        <div v-if="step === 2" class="space-y-6">
          <div v-if="loading" class="bg-white p-12 rounded-[3rem] border border-gray-100 shadow-sm text-center">
            <div v-if="!trainingStatus">
              <Loader2 class="w-12 h-12 animate-spin text-orange-500 mx-auto mb-6" />
              <h3 class="text-xl font-bold mb-2">Training your AI...</h3>
              <p class="text-gray-500">We are crawling your website and indexing the content. This may take up to 30 seconds.</p>
            </div>
            <div v-else class="animate-in zoom-in duration-500">
              <div class="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 class="text-green-500 w-10 h-10" />
              </div>
              <h3 class="text-xl font-bold mb-2">Training Complete!</h3>
              <p class="text-gray-500 mb-4">Successfully scanned {{ trainingStatus.pages }} pages and created {{ trainingStatus.chunks }} knowledge topics.</p>
              <div class="flex items-center justify-center text-orange-600 font-bold text-sm">
                <Sparkles class="w-4 h-4 mr-2" /> Redirecting to dashboard...
              </div>
            </div>
          </div>

          <div v-else class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button @click="sourceType = 'website'" 
                :class="['p-6 rounded-2xl border-2 text-left transition-all', sourceType === 'website' ? 'border-orange-500 bg-orange-50' : 'border-gray-100 bg-white hover:border-gray-200']">
                <Globe :class="['w-8 h-8 mb-4', sourceType === 'website' ? 'text-orange-500' : 'text-gray-400']" />
                <h3 class="font-bold">Website</h3>
              </button>
              <button @click="canUsePDF ? sourceType = 'pdf' : showToast('PDF support requires Pro plan.', 'warning')" 
                :class="['p-6 rounded-2xl border-2 text-left transition-all relative overflow-hidden', !canUsePDF ? 'opacity-60 cursor-not-allowed' : '', sourceType === 'pdf' ? 'border-orange-500 bg-orange-50' : 'border-gray-100 bg-white hover:border-gray-200']"
                :disabled="!canUsePDF">
                <FileText :class="['w-8 h-8 mb-4', sourceType === 'pdf' ? 'text-orange-500' : 'text-gray-400']" />
                <h3 class="font-bold">PDF File</h3>
                <!-- Pro Badge -->
                <span v-if="!canUsePDF"
                  class="absolute top-3 right-3 text-[10px] font-bold bg-orange-100
                         text-orange-700 px-2 py-0.5 rounded-full">
                  PRO
                </span>
              </button>
              <button @click="sourceType = 'text'" 
                :class="['p-6 rounded-2xl border-2 text-left transition-all', sourceType === 'text' ? 'border-orange-500 bg-orange-50' : 'border-gray-100 bg-white hover:border-gray-200']">
                <Type :class="['w-8 h-8 mb-4', sourceType === 'text' ? 'text-orange-500' : 'text-gray-400']" />
                <h3 class="font-bold">Raw Text</h3>
              </button>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
              <div v-if="sourceType === 'website'" class="space-y-4">
                <label class="block text-sm font-medium text-gray-700">Website URL</label>
                <input v-model="sourceValue" type="url" placeholder="https://example.com"
                  class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
              <div v-if="sourceType === 'pdf'" class="space-y-4">
                <label class="block text-sm font-medium text-gray-700">PDF File</label>
                <div class="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-gray-300 transition-colors">
                  <input 
                    ref="fileInput"
                    type="file" 
                    accept=".pdf"
                    @change="handleFileUpload"
                    class="hidden" 
                  />
                  <Upload class="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p class="text-sm text-gray-600 mb-2">Click to upload PDF file</p>
                  <button 
                    type="button"
                    @click="fileInput?.click()"
                    class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    Choose File
                  </button>
                </div>
                <div v-if="sourceValue" class="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p class="text-sm text-gray-600">PDF loaded and ready for processing</p>
                </div>
              </div>
              <div v-if="sourceType === 'text'" class="space-y-4">
                <textarea v-model="sourceValue" rows="6" placeholder="Paste any text here..."
                  class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 outline-none resize-none"></textarea>
              </div>
              <div class="flex space-x-4 mt-8">
                <button @click="step = 1" class="flex-1 py-4 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all">Back</button>
                <button @click="handleCreate" :disabled="loading || !sourceValue"
                  class="flex-[2] bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center justify-center">
                  {{ sourceType === 'website' ? 'Scan & Create' : 'Create Chatbot' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>