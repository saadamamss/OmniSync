<script setup lang="ts">
import { Palette, Brain, UserPlus, ListPlus, Layout, Trash2 } from 'lucide-vue-next';

const props = defineProps<{
  settings: {
    primaryColor: string;
    botName: string;
    welcomeMessage: string;
    userPlaceholder: string;
    systemPrompt?: string;
    collectLeads?: boolean;
    suggestedQuestions?: string[];
    widgetPosition?: 'right' | 'left';
  }
}>();

const emit = defineEmits(['update:settings']);

const updateSetting = (key: string, value: any) => {
  emit('update:settings', { ...props.settings, [key]: value });
};

const addQuestion = () => {
  const questions = [...(props.settings.suggestedQuestions || [])];
  questions.push("");
  updateSetting('suggestedQuestions', questions);
};

const removeQuestion = (index: number) => {
  const questions = [...(props.settings.suggestedQuestions || [])];
  questions.splice(index, 1);
  updateSetting('suggestedQuestions', questions);
};

const updateQuestion = (index: number, value: string) => {
  const questions = [...(props.settings.suggestedQuestions || [])];
  questions[index] = value;
  updateSetting('suggestedQuestions', questions);
};
</script>

<template>
  <div class="space-y-6">
    <!-- Visual Appearance -->
    <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
      <div class="flex items-center space-x-3 mb-2">
        <Palette class="w-6 h-6 text-orange-500" />
        <h3 class="text-xl font-bold">Visual Customization</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-3">
          <label class="text-sm font-bold text-gray-700 ml-1">Primary Brand Color</label>
          <div class="flex items-center space-x-4">
            <input
              :value="settings.primaryColor"
              @input="updateSetting('primaryColor', ($event.target as HTMLInputElement).value)"
              type="color"
              class="w-14 h-14 rounded-2xl border-0 p-0 cursor-pointer overflow-hidden"
            />
            <input
              :value="settings.primaryColor"
              @input="updateSetting('primaryColor', ($event.target as HTMLInputElement).value)"
              type="text"
              class="flex-1 px-4 py-3.5 rounded-2xl border border-gray-200 text-sm font-mono"
            />
          </div>
        </div>
        <div class="space-y-3">
          <label class="text-sm font-bold text-gray-700 ml-1">Bot Display Name</label>
          <input
            :value="settings.botName"
            @input="updateSetting('botName', ($event.target as HTMLInputElement).value)"
            type="text"
            class="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm"
          />
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-3">
          <label class="text-sm font-bold text-gray-700 ml-1">Welcome Message</label>
          <textarea
            :value="settings.welcomeMessage"
            @input="updateSetting('welcomeMessage', ($event.target as HTMLTextAreaElement).value)"
            rows="2"
            class="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm resize-none"
          ></textarea>
        </div>
        <div class="space-y-3">
          <label class="text-sm font-bold text-gray-700 ml-1">Widget Position</label>
          <div class="flex p-1 bg-gray-100 rounded-xl">
            <button 
              @click="updateSetting('widgetPosition', 'left')"
              :class="['flex-1 py-2 rounded-lg text-xs font-bold transition-all', settings.widgetPosition === 'left' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500']"
            >Left</button>
            <button 
              @click="updateSetting('widgetPosition', 'right')"
              :class="['flex-1 py-2 rounded-lg text-xs font-bold transition-all', settings.widgetPosition !== 'left' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500']"
            >Right</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Suggested Questions -->
    <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <ListPlus class="w-6 h-6 text-blue-500" />
          <h3 class="text-xl font-bold">Suggested Questions</h3>
        </div>
        <button @click="addQuestion" class="text-xs font-bold text-blue-600 hover:underline">+ Add Question</button>
      </div>
      <div class="space-y-3">
        <div v-for="(q, i) in settings.suggestedQuestions" :key="i" class="flex items-center space-x-2">
          <input 
            :value="q" 
            @input="updateQuestion(i, ($event.target as HTMLInputElement).value)"
            placeholder="e.g. What are your prices?"
            class="flex-1 px-4 py-3 rounded-xl border border-gray-100 text-sm"
          />
          <button @click="removeQuestion(i)" class="p-2 text-gray-400 hover:text-red-500">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
        <p v-if="!settings.suggestedQuestions?.length" class="text-xs text-gray-400 italic">No suggested questions added yet.</p>
      </div>
    </div>

    <!-- AI Personality -->
    <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
      <div class="flex items-center space-x-3">
        <Brain class="w-6 h-6 text-purple-500" />
        <h3 class="text-xl font-bold">AI Personality</h3>
      </div>
      <div class="space-y-3">
        <label class="text-sm font-bold text-gray-700 ml-1">System Instructions (Prompt)</label>
        <textarea
          :value="settings.systemPrompt"
          @input="updateSetting('systemPrompt', ($event.target as HTMLTextAreaElement).value)"
          rows="4"
          placeholder="e.g. You are a helpful support agent..."
          class="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-purple-500 outline-none transition-all"
        ></textarea>
      </div>
    </div>

    <!-- Lead Generation -->
    <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <UserPlus class="w-6 h-6 text-green-500" />
          <h3 class="text-xl font-bold">Lead Generation</h3>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" :checked="settings.collectLeads" @change="updateSetting('collectLeads', ($event.target as HTMLInputElement).checked)" class="sr-only peer">
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
        </label>
      </div>
      <p class="text-sm text-gray-500">When enabled, the bot will ask for the visitor's name and email before starting the conversation.</p>
    </div>
  </div>
</template>