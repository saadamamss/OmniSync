<script setup lang="ts">
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { ref, onMounted } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { useNotification } from '@/composables/useNotification';
import { 
  User, 
  Mail, 
  Save, 
  Loader2,
  CreditCard,
  CheckCircle2,
  Zap,
  X,
  Lock,
  ShieldCheck,
  ArrowDownCircle
} from 'lucide-vue-next';

const { showToast, askConfirm } = useNotification();
const loading = ref(true);
const saving = ref(false);
const upgrading = ref(false);
const showPaymentModal = ref(false);
const selectedPlanToUpgrade = ref('');
const user = ref<any>(null);

// Bot selection modal state for downgrade
const showBotSelectionModal = ref(false);
const userBots = ref<any[]>([]);
const selectedBotsToKeep = ref<string[]>([]);
const pendingDowngradePlan = ref('');

// Plan pricing configuration
const PLAN_PRICES = {
  starter: { monthly: 0, yearly: 0, display: 'Free' },
  pro: { monthly: 49, yearly: 470, display: '$49/mo' },
  enterprise: { monthly: 199, yearly: 1900, display: '$199/mo' }
};

const profile = ref({
  full_name: '',
  email: '',
  avatar_url: '',
  plan: 'starter'
});

const security = ref({
  newPassword: '',
  confirmPassword: ''
});

const fetchProfile = async () => {
  loading.value = true;
  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (authUser) {
    user.value = authUser;
    profile.value.email = authUser.email || '';
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
      
    if (data) {
      profile.value.full_name = data.full_name || '';
      profile.value.avatar_url = data.avatar_url || '';
      profile.value.plan = data.plan || 'starter';
    }
  }
  loading.value = false;
};

const handleSaveProfile = async () => {
  saving.value = true;
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.value.id,
      full_name: profile.value.full_name,
      updated_at: new Date().toISOString(),
    });

  if (error) showToast(error.message, 'error');
  else showToast('Profile updated successfully!', 'success');
  saving.value = false;
};

const handleUpdatePassword = async () => {
  if (security.value.newPassword !== security.value.confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }
  
  saving.value = true;
  const { error } = await supabase.auth.updateUser({
    password: security.value.newPassword
  });

  if (error) showToast(error.message, 'error');
  else {
    showToast('Password updated successfully!', 'success');
    security.value.newPassword = '';
    security.value.confirmPassword = '';
  }
  saving.value = false;
};

const openUpgradeModal = (plan: string) => {
  selectedPlanToUpgrade.value = plan;
  showPaymentModal.value = true;
};

const handleDowngrade = async (newPlan: string) => {
  // Fetch user's bots
  const { data: bots } = await supabase
    .from('chatbots')
    .select('*')
    .eq('user_id', user.value.id)
    .eq('is_active', true);
  
  const limits: Record<string, number> = { starter: 1, pro: 5, enterprise: 1000 };
  const limit = limits[newPlan];
  
  if (bots && bots.length > limit) {
    // Show bot selection modal
    userBots.value = bots;
    selectedBotsToKeep.value = bots.slice(0, limit).map(b => b.id);
    pendingDowngradePlan.value = newPlan;
    showBotSelectionModal.value = true;
    return;
  }
  
  // Proceed with normal downgrade if under limit
  const confirmed = await askConfirm(
    `Downgrade to ${newPlan.toUpperCase()}?`,
    `Are you sure you want to switch to the ${newPlan} plan?`
  );

  if (!confirmed) return;

  saving.value = true;
  const { error } = await supabase
    .from('profiles')
    .update({ plan: newPlan })
    .eq('id', user.value.id);

  if (error) {
    showToast(error.message, 'error');
  } else {
    profile.value.plan = newPlan;
    showToast(`Successfully downgraded to ${newPlan} plan`, 'success');
  }
  saving.value = false;
};

const confirmBotSelection = async () => {
  const confirmed = await askConfirm(
    `Downgrade to ${pendingDowngradePlan.value.toUpperCase()}?`,
    `Are you sure you want to switch to the ${pendingDowngradePlan.value} plan and keep only ${selectedBotsToKeep.value.length} active bot(s)?`
  );

  if (!confirmed) return;

  saving.value = true;
  
  // Deactivate unselected bots
  const botsToDeactivate = userBots.value
    .filter(bot => !selectedBotsToKeep.value.includes(bot.id))
    .map(bot => bot.id);
  
  if (botsToDeactivate.length > 0) {
    await supabase
      .from('chatbots')
      .update({ is_active: false })
      .eq('user_id', user.value.id)
      .in('id', botsToDeactivate);
  }
  
  // Update plan
  const { error } = await supabase
    .from('profiles')
    .update({ plan: pendingDowngradePlan.value })
    .eq('id', user.value.id);

  if (error) {
    showToast(error.message, 'error');
  } else {
    profile.value.plan = pendingDowngradePlan.value;
    showToast(`Successfully downgraded to ${pendingDowngradePlan.value} plan`, 'success');
  }
  
  showBotSelectionModal.value = false;
  selectedBotsToKeep.value = [];
  userBots.value = [];
  pendingDowngradePlan.value = '';
  saving.value = false;
};

const processPayment = async () => {
  upgrading.value = true;
  
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { 
        plan: selectedPlanToUpgrade.value,
        user_id: user.value.id,
        user_email: user.value.email
      }
    });

    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (err: any) {
    showToast(err.message || 'Failed to start checkout', 'error');
    upgrading.value = false;
  }
};

onMounted(fetchProfile);
</script>

<template>
  <DashboardLayout>
    <div class="max-w-4xl mx-auto">
      <div class="mb-10">
        <h1 class="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p class="text-gray-500 mt-1">Manage your profile, security, and subscription.</p>
      </div>

      <div v-if="loading" class="py-20 flex justify-center">
        <Loader2 class="w-10 h-10 animate-spin text-orange-500" />
      </div>

      <div v-else class="space-y-8 pb-20">
        <!-- Profile Section -->
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div class="p-8 border-b border-gray-50 flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <div class="bg-blue-50 p-2.5 rounded-xl text-blue-600"><User class="w-5 h-5" /></div>
              <h2 class="text-xl font-bold">Profile Information</h2>
            </div>
            <button @click="handleSaveProfile" :disabled="saving"
              class="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold flex items-center hover:bg-gray-800 transition-all disabled:opacity-50">
              <Loader2 v-if="saving" class="w-4 h-4 mr-2 animate-spin" />
              <Save v-else class="w-4 h-4 mr-2" />
              Save Changes
            </button>
          </div>
          <div class="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-bold text-gray-700 ml-1">Full Name</label>
              <div class="relative">
                <User class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                <input v-model="profile.full_name" type="text" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all" />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-bold text-gray-700 ml-1">Email Address</label>
              <div class="relative">
                <Mail class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                <input v-model="profile.email" type="email" disabled class="w-full pl-12 pr-4 py-3.5 bg-gray-100 border border-gray-200 rounded-2xl text-gray-500 cursor-not-allowed" />
              </div>
            </div>
          </div>
        </div>

        <!-- Security Section -->
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div class="p-8 border-b border-gray-50 flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <div class="bg-red-50 p-2.5 rounded-xl text-red-600"><ShieldCheck class="w-5 h-5" /></div>
              <h2 class="text-xl font-bold">Security</h2>
            </div>
            <button @click="handleUpdatePassword" :disabled="saving || !security.newPassword"
              class="bg-gray-100 text-gray-900 px-6 py-2.5 rounded-xl font-bold flex items-center hover:bg-gray-200 transition-all disabled:opacity-50">
              Update Password
            </button>
          </div>
          <div class="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-bold text-gray-700 ml-1">New Password</label>
              <div class="relative">
                <Lock class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                <input v-model="security.newPassword" type="password" placeholder="••••••••" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all" />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-bold text-gray-700 ml-1">Confirm Password</label>
              <div class="relative">
                <Lock class="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                <input v-model="security.confirmPassword" type="password" placeholder="••••••••" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all" />
              </div>
            </div>
          </div>
        </div>

        <!-- Subscription Section -->
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div class="p-8 border-b border-gray-50 flex items-center space-x-4">
            <div class="bg-orange-50 p-2.5 rounded-xl text-orange-600"><CreditCard class="w-5 h-5" /></div>
            <h2 class="text-xl font-bold">Subscription Plan</h2>
          </div>
          <div class="p-8">
            <div class="bg-gray-900 rounded-3xl p-8 text-white relative overflow-hidden mb-8">
              <div class="absolute top-0 right-0 p-8 opacity-10"><Zap class="w-32 h-32" /></div>
              <div class="relative z-10">
                <p class="text-orange-400 text-sm font-bold uppercase tracking-widest mb-2">Current Plan</p>
                <h3 class="text-4xl font-black capitalize mb-4">{{ profile.plan }}</h3>
                <div class="flex items-center space-x-2 text-gray-400 text-sm">
                  <CheckCircle2 class="w-4 h-4 text-green-500" />
                  <span>{{ profile.plan === 'starter' ? '1 Chatbot limit' : profile.plan === 'pro' ? '5 Chatbots limit' : 'Unlimited Chatbots' }}</span>
                </div>
              </div>
            </div>

            <!-- Plan Actions -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Upgrade Options -->
              <button v-if="profile.plan === 'starter'" @click="openUpgradeModal('pro')" class="p-6 rounded-2xl border border-gray-200 hover:border-orange-500 transition-all text-left group">
                <span class="font-bold text-lg block mb-1">Upgrade to Pro</span>
                <p class="text-sm text-gray-500 mb-4">Get 5 chatbots and priority support for {{ PLAN_PRICES.pro.display }}.</p>
                <span class="text-orange-600 font-bold group-hover:underline">Upgrade Now →</span>
              </button>
              
              <button v-if="profile.plan !== 'enterprise'" @click="openUpgradeModal('enterprise')" class="p-6 rounded-2xl border border-gray-100 hover:border-orange-500 transition-all text-left group">
                <span class="font-bold text-lg block mb-1">Go Enterprise</span>
                <p class="text-sm text-gray-500 mb-4">Unlimited chatbots and API access for your team.</p>
                <span class="text-orange-600 font-bold group-hover:underline">Contact Sales →</span>
              </button>

              <!-- Downgrade Options -->
              <button v-if="profile.plan !== 'starter'" @click="handleDowngrade('starter')" class="p-6 rounded-2xl border border-gray-100 hover:border-red-200 transition-all text-left group bg-gray-50/50">
                <div class="flex items-center text-gray-400 mb-1">
                  <ArrowDownCircle class="w-4 h-4 mr-2" />
                  <span class="font-bold text-lg block">Downgrade to Starter</span>
                </div>
                <p class="text-xs text-gray-400 mb-4">Switch back to the free plan (1 chatbot limit).</p>
                <span class="text-gray-400 text-xs font-bold group-hover:text-red-500 transition-colors">Switch to Starter</span>
              </button>

              <button v-if="profile.plan === 'enterprise'" @click="handleDowngrade('pro')" class="p-6 rounded-2xl border border-gray-100 hover:border-orange-200 transition-all text-left group bg-gray-50/50">
                <div class="flex items-center text-gray-400 mb-1">
                  <ArrowDownCircle class="w-4 h-4 mr-2" />
                  <span class="font-bold text-lg block">Downgrade to Pro</span>
                </div>
                <p class="text-xs text-gray-400 mb-4">Switch to the Pro plan (5 chatbots limit).</p>
                <span class="text-gray-400 text-xs font-bold group-hover:text-orange-500 transition-colors">Switch to Pro</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <div v-if="showPaymentModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" @click="showPaymentModal = false"></div>
      <div class="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden">
        <div class="p-8 border-b border-gray-50 flex items-center justify-between">
          <h3 class="text-xl font-bold">Upgrade Plan</h3>
          <button @click="showPaymentModal = false" class="text-gray-400 hover:text-gray-600"><X class="w-6 h-6" /></button>
        </div>
        <div class="p-8 space-y-6">
          <div class="bg-gray-50 p-6 rounded-2xl flex items-center justify-between">
            <div>
              <p class="text-xs text-gray-500 uppercase font-bold">Selected Plan</p>
              <p class="font-bold text-gray-900 capitalize text-lg">{{ selectedPlanToUpgrade }}</p>
            </div>
            <p class="text-2xl font-black text-gray-900">{{ PLAN_PRICES[selectedPlanToUpgrade as keyof typeof PLAN_PRICES].display }}<span class="text-xs text-gray-400">/mo</span></p>
          </div>
          
          <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start space-x-3">
            <CreditCard class="w-5 h-5 text-blue-600 mt-0.5" />
            <p class="text-xs text-blue-800 leading-relaxed">
              You will be redirected to Stripe's secure checkout page to complete your payment.
            </p>
          </div>

          <button @click="processPayment" :disabled="upgrading" class="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center shadow-lg">
            <Loader2 v-if="upgrading" class="w-5 h-5 mr-2 animate-spin" />
            <span v-else>Proceed to Checkout</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Bot Selection Modal -->
    <div v-if="showBotSelectionModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" @click="showBotSelectionModal = false"></div>
      <div class="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden">
        <div class="p-8 border-b border-gray-50 flex items-center justify-between">
          <h3 class="text-xl font-bold">Select Bots to Keep Active</h3>
          <button @click="showBotSelectionModal = false" class="text-gray-400 hover:text-gray-600"><X class="w-6 h-6" /></button>
        </div>
        <div class="p-8 space-y-6">
          <div class="bg-orange-50 p-4 rounded-xl border border-orange-100">
            <p class="text-sm text-orange-800">
              You're downgrading to <strong>{{ pendingDowngradePlan }}</strong> which allows <strong>{{ pendingDowngradePlan === 'starter' ? '1' : pendingDowngradePlan === 'pro' ? '5' : 'unlimited' }}</strong> active bot(s). Please choose which bots to keep active.
            </p>
          </div>
          
          <div class="space-y-3 max-h-64 overflow-y-auto">
            <div v-for="bot in userBots" :key="bot.id" class="flex items-center space-x-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50">
              <input 
                type="checkbox" 
                :id="bot.id" 
                v-model="selectedBotsToKeep" 
                :value="bot.id"
                class="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
              />
              <label :for="bot.id" class="flex-1 cursor-pointer">
                <p class="font-medium text-gray-900">{{ bot.name }}</p>
                <p class="text-xs text-gray-500">{{ bot.industry || 'No industry' }}</p>
              </label>
            </div>
          </div>

          <div class="bg-gray-50 p-4 rounded-xl">
            <p class="text-sm text-gray-600">
              <strong>{{ selectedBotsToKeep.length }}</strong> of {{ userBots.length }} bots selected
              <span v-if="selectedBotsToKeep.length > (pendingDowngradePlan === 'starter' ? 1 : pendingDowngradePlan === 'pro' ? 5 : 1000)" class="text-red-600 ml-2">
                (Please select only {{ pendingDowngradePlan === 'starter' ? '1' : pendingDowngradePlan === 'pro' ? '5' : 'unlimited' }})
              </span>
            </p>
          </div>

          <button 
            @click="confirmBotSelection" 
            :disabled="saving || selectedBotsToKeep.length > (pendingDowngradePlan === 'starter' ? 1 : pendingDowngradePlan === 'pro' ? 5 : 1000)" 
            class="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center shadow-lg disabled:opacity-50"
          >
            <Loader2 v-if="saving" class="w-5 h-5 mr-2 animate-spin" />
            <span v-else>Confirm Downgrade</span>
          </button>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>