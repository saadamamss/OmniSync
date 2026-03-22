<script setup lang="ts">
import { ref } from 'vue';
import { supabase } from '@/integrations/supabase/client';
import { useRouter } from 'vue-router';
import { LogIn, Mail, Lock, Loader2, ArrowLeft } from 'lucide-vue-next';

const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');

const handleLogin = async () => {
  loading.value = true;
  errorMsg.value = '';
  
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });

  if (error) {
    errorMsg.value = error.message;
    loading.value = false;
  } else {
    router.push('/dashboard');
  }
};
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <router-link to="/" class="flex items-center justify-center space-x-2 mb-6 text-gray-500 hover:text-orange-500 transition-colors">
        <ArrowLeft class="w-4 h-4" />
        <span class="text-sm font-medium">Back to home</span>
      </router-link>
      <h2 class="text-center text-3xl font-extrabold text-gray-900">Welcome back</h2>
      <p class="mt-2 text-center text-sm text-gray-600">
        Or
        <router-link to="/register" class="font-medium text-orange-600 hover:text-orange-500">
          create a new account
        </router-link>
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow-xl shadow-gray-200/50 sm:rounded-3xl sm:px-10 border border-gray-100">
        <form class="space-y-6" @submit.prevent="handleLogin">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">Email address</label>
            <div class="mt-1 relative">
              <Mail class="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input v-model="email" id="email" type="email" required 
                class="appearance-none block w-full px-10 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm" />
            </div>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
            <div class="mt-1 relative">
              <Lock class="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input v-model="password" id="password" type="password" required 
                class="appearance-none block w-full px-10 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm" />
            </div>
          </div>

          <div v-if="errorMsg" class="text-red-500 text-xs bg-red-50 p-3 rounded-lg border border-red-100">
            {{ errorMsg }}
          </div>

          <div>
            <button type="submit" :disabled="loading"
              class="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-all">
              <Loader2 v-if="loading" class="animate-spin h-5 w-5 mr-2" />
              <LogIn v-else class="h-5 w-5 mr-2" />
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>