<script setup lang="ts">
import { ref, computed } from 'vue';
import { Code, Info, Copy, Check } from 'lucide-vue-next';

const props = defineProps<{
  botId: string;
}>();

const copied = ref(false);

const embedCode = computed(() => {
  const baseUrl = window.location.origin;
  const script = `<tag_name>
  window.omnisyncConfig = {
    botId: "${props.botId}",
    baseUrl: "${baseUrl}"
  };
</tag_name>
<tag_name src="${baseUrl}/widget-loader.js" async></tag_name>`;
  return script.replaceAll("tag_name", "script");
});

const copyToClipboard = () => {
  navigator.clipboard.writeText(embedCode.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
};
</script>

<template>
  <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
    <div class="flex items-center space-x-3">
      <Code class="w-6 h-6 text-orange-500" />
      <h3 class="text-xl font-bold">Installation</h3>
    </div>
    <p class="text-gray-500 text-sm leading-relaxed">
      Copy and paste this code snippet into your website's <strong>&lt;head&gt;</strong> or <strong>&lt;body&gt;</strong> tag to activate the chat widget.
    </p>

    <div class="relative group">
      <div class="absolute top-4 right-4 z-10">
        <button
          @click="copyToClipboard"
          class="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
        >
          <Check v-if="copied" class="w-3 h-3 text-green-400" />
          <Copy v-else class="w-3 h-3" />
          <span>{{ copied ? "Copied!" : "Copy Code" }}</span>
        </button>
      </div>
      <pre class="bg-gray-900 text-gray-300 p-8 pt-14 rounded-3xl text-xs overflow-x-auto font-mono leading-loose border border-gray-800">{{ embedCode }}</pre>
    </div>

    <div class="bg-orange-50 p-6 rounded-2xl border border-orange-100">
      <h4 class="font-bold text-orange-900 mb-2 flex items-center">
        <Info class="w-4 h-4 mr-2" /> How to install?
      </h4>
      <ol class="text-sm text-orange-800 space-y-2 list-decimal ml-4">
        <li>Copy the code snippet above.</li>
        <li>Go to your website's admin panel.</li>
        <li>Find the "Custom HTML" or "Header/Footer" settings.</li>
        <li>Paste the code and save. The widget will appear instantly!</li>
      </ol>
    </div>
  </div>
</template>