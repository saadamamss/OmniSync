<script setup lang="ts">
import { useNotification } from '@/composables/useNotification';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  X,
  HelpCircle
} from 'lucide-vue-next';

const { notifications, confirmState, handleConfirm } = useNotification();

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle
};

const colors = {
  success: 'bg-green-50 border-green-100 text-green-800',
  error: 'bg-red-50 border-red-100 text-red-800',
  info: 'bg-blue-50 border-blue-100 text-blue-800',
  warning: 'bg-orange-50 border-orange-100 text-orange-800'
};

const iconColors = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-orange-500'
};
</script>

<template>
  <!-- Toasts -->
  <div class="fixed top-6 right-6 z-[9999] flex flex-col space-y-3 w-full max-w-sm pointer-events-none">
    <TransitionGroup 
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform translate-x-10 opacity-0"
      enter-to-class="transform translate-x-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-for="n in notifications" :key="n.id" 
        :class="['p-4 rounded-2xl border shadow-xl flex items-start space-x-3 pointer-events-auto', colors[n.type]]">
        <component :is="icons[n.type]" :class="['w-5 h-5 mt-0.5', iconColors[n.type]]" />
        <p class="text-sm font-bold flex-1">{{ n.message }}</p>
      </div>
    </TransitionGroup>
  </div>

  <!-- Confirmation Modal -->
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="confirmState.show" class="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" @click="handleConfirm(false)"></div>
      <div class="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300">
        <div class="p-8 text-center">
          <div class="bg-orange-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <HelpCircle class="text-orange-500 w-10 h-10" />
          </div>
          <h3 class="text-2xl font-bold text-gray-900 mb-2">{{ confirmState.title }}</h3>
          <p class="text-gray-500 leading-relaxed">{{ confirmState.message }}</p>
        </div>
        <div class="p-6 bg-gray-50 flex space-x-3">
          <button @click="handleConfirm(false)" class="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all">
            Cancel
          </button>
          <button @click="handleConfirm(true)" class="flex-1 py-4 rounded-2xl font-bold text-white bg-gray-900 hover:bg-gray-800 transition-all shadow-lg">
            Confirm
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>