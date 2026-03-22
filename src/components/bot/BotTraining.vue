<script setup lang="ts">
import { ref } from "vue";
import {
  BrainCircuit,
  Info,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  RefreshCw,
  Globe,
  Eraser,
  CheckCircle2,
} from "lucide-vue-next";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/composables/useNotification";

interface Chunk {
  id?: string;
  title: string;
  content: string;
  isExpanded?: boolean;
}

const props = defineProps<{
  chunks: Chunk[];
  sourceType: string;
  botId: string;
  websiteUrl?: string;
}>();

const emit = defineEmits([
  "update:chunks",
  "add-chunk",
  "remove-chunk",
  "bulk-add",
  "refresh-chunks",
  "update:websiteUrl",
]);
const { showToast, askConfirm } = useNotification();

const bulkFileInput = ref<HTMLInputElement | null>(null);
const isParsing = ref(false);
const isSyncing = ref(false);

const addChunk = () => {
  const newChunk: Chunk = { title: "", content: "", isExpanded: true };
  emit("add-chunk", newChunk);
};

const removeChunk = async (index: number) => {
  const confirmed = await askConfirm(
    "Remove Topic?",
    "Are you sure you want to remove this knowledge topic?",
  );
  if (confirmed) {
    emit("remove-chunk", index);
  }
};

const clearAllChunks = async () => {
  const confirmed = await askConfirm(
    "Clear All?",
    "Are you sure you want to clear ALL knowledge topics? This cannot be undone.",
  );
  if (confirmed) {
    emit("update:chunks", []);
  }
};

const toggleExpand = (index: number) => {
  const updatedChunks = [...props.chunks];
  updatedChunks[index].isExpanded = !updatedChunks[index].isExpanded;
  emit("update:chunks", updatedChunks);
};

const updateChunk = (
  index: number,
  field: "title" | "content",
  value: string,
) => {
  const updatedChunks = [...props.chunks];
  updatedChunks[index] = { ...updatedChunks[index], [field]: value };
  emit("update:chunks", updatedChunks);
};

const handleSyncWebsite = async () => {
  if (!props.websiteUrl) return;

  isSyncing.value = true;
  try {
    const { data, error } = await supabase.functions.invoke(
      "import_website_training",
      {
        body: {
          chatbot_id: props.botId,
          website_url: props.websiteUrl,
        },
      },
    );

    if (error) throw error;

    // عرض تقرير بناءً على الحالة
    if (data.status === "failed") {
      showToast(`Sync Complete! Scanned ${data.pages_scanned} pages.`, "error");
    } else if (data.status === "partial") {
      showToast(
        `Sync Complete! Scanned ${data.pages_scanned} pages.`,
        "warning",
      );
    } else {
      showToast(
        `Sync Complete! Scanned ${data.pages_scanned} pages.`,
        "success",
      );
    }

    emit("refresh-chunks");
  } catch (e: any) {
    showToast("Sync failed: " + e.message, "error");
  } finally {
    isSyncing.value = false;
  }
};

const handleBulkUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isParsing.value = true;
  const reader = new FileReader();

  reader.onload = (e) => {
    const text = e.target?.result as string;
    const sections = text.split("---");
    const newChunks: Chunk[] = [];

    sections.forEach((section) => {
      const titleMatch = section.match(/Title:\s*(.*)/i);
      const contentMatch = section.match(/Content:\s*([\s\S]*)/i);

      if (titleMatch && contentMatch) {
        newChunks.push({
          title: titleMatch[1].trim(),
          content: contentMatch[1].trim(),
          isExpanded: false,
        });
      }
    });

    if (newChunks.length > 0) {
      emit("bulk-add", newChunks);
      showToast(`Imported ${newChunks.length} topics!`, "success");
    } else {
      showToast("No valid topics found in file.", "warning");
    }
    isParsing.value = false;
  };

  reader.readAsText(file);
  target.value = "";
};
</script>

<template>
  <div class="space-y-6">
    <!-- Website Sync Section (Only for Website Bots) -->
    <div
      v-if="sourceType === 'website'"
      class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm"
    >
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center space-x-3">
          <div class="bg-blue-50 p-2.5 rounded-xl text-blue-600">
            <Globe class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-xl font-bold">Website Sync</h3>
            <p class="text-xs text-gray-400">
              Keep your AI updated with your site content.
            </p>
          </div>
        </div>
        <button
          @click="handleSyncWebsite"
          :disabled="isSyncing || !websiteUrl"
          class="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center hover:bg-gray-800 transition-all disabled:opacity-50 shadow-lg shadow-gray-200"
        >
          <Loader2 v-if="isSyncing" class="w-4 h-4 mr-2 animate-spin" />
          <RefreshCw v-else class="w-4 h-4 mr-2" />
          {{ isSyncing ? "Syncing..." : "Sync Now" }}
        </button>
      </div>

      <div class="space-y-2">
        <label
          class="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1"
          >Target Website URL</label
        >
        <input
          :value="websiteUrl"
          @input="
            $emit(
              'update:websiteUrl',
              ($event.target as HTMLInputElement).value,
            )
          "
          type="url"
          placeholder="https://example.com"
          class="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
        />
        <div
          class="flex items-center mt-3 text-[10px] text-gray-400 bg-gray-50 p-3 rounded-xl"
        >
          <Info class="w-3 h-3 mr-2 text-blue-500" />
          Clicking "Sync Now" will re-scan this URL and common pages to update
          the knowledge base.
        </div>
      </div>
    </div>

    <!-- Knowledge Manager -->
    <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between mb-8 space-y-4 sm:space-y-0"
      >
        <div class="flex items-center space-x-3">
          <div class="bg-orange-50 p-2.5 rounded-xl text-orange-600">
            <BrainCircuit class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-xl font-bold">Knowledge Base</h3>
            <p class="text-xs text-gray-400">
              {{ chunks.length }} topics indexed
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button
            v-if="chunks.length > 0"
            @click="clearAllChunks"
            class="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center hover:bg-red-100 transition-all"
          >
            <Eraser class="w-4 h-4 mr-1.5" /> Clear All
          </button>

          <button
            @click="bulkFileInput?.click()"
            :disabled="isParsing"
            class="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center hover:bg-gray-200 transition-all"
          >
            <Loader2 v-if="isParsing" class="w-4 h-4 mr-1.5 animate-spin" />
            <FileUp v-else class="w-4 h-4 mr-1.5" /> Bulk Import
          </button>
          <input
            ref="bulkFileInput"
            type="file"
            accept=".txt"
            class="hidden"
            @change="handleBulkUpload"
          />

          <button
            @click="addChunk"
            class="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center hover:bg-orange-600 transition-all shadow-sm"
          >
            <Plus class="w-4 h-4 mr-1.5" /> Add Topic
          </button>
        </div>
      </div>

      <!-- Chunks List -->
      <div class="space-y-4">
        <div
          v-if="chunks.length === 0"
          class="text-center py-16 border-2 border-dashed border-gray-100 rounded-[2rem] bg-gray-50/30"
        >
          <div
            class="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm"
          >
            <BrainCircuit class="w-8 h-8 text-gray-200" />
          </div>
          <p class="text-gray-400 text-sm font-medium">
            No knowledge topics found.
          </p>
          <p class="text-xs text-gray-300 mt-1">
            Add some manually or sync your website to train your AI.
          </p>
        </div>

        <div
          v-for="(chunk, index) in chunks"
          :key="index"
          class="border border-gray-100 rounded-2xl overflow-hidden transition-all"
          :class="
            chunk.isExpanded
              ? 'ring-2 ring-orange-500/10 border-orange-200 shadow-lg'
              : 'hover:border-gray-200'
          "
        >
          <div
            @click="toggleExpand(index)"
            class="p-4 bg-white flex items-center justify-between cursor-pointer select-none"
          >
            <div class="flex items-center space-x-3 flex-1">
              <div
                class="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-xs font-bold text-gray-400"
              >
                {{ index + 1 }}
              </div>
              <input
                v-model="chunk.title"
                @click.stop
                @input="
                  updateChunk(
                    index,
                    'title',
                    ($event.target as HTMLInputElement).value,
                  )
                "
                placeholder="Topic Title (e.g. Pricing, Features, About Us)"
                class="font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full placeholder:text-gray-300"
              />
            </div>
            <div class="flex items-center space-x-2">
              <button
                @click.stop="removeChunk(index)"
                class="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 class="w-4 h-4" />
              </button>
              <component
                :is="chunk.isExpanded ? ChevronUp : ChevronDown"
                class="w-5 h-5 text-gray-400"
              />
            </div>
          </div>

          <div v-if="chunk.isExpanded" class="p-4 pt-0 bg-white">
            <textarea
              v-model="chunk.content"
              @input="
                updateChunk(
                  index,
                  'content',
                  ($event.target as HTMLTextAreaElement).value,
                )
              "
              rows="6"
              class="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none transition-all"
              placeholder="Enter the detailed information for this topic..."
            ></textarea>
            <div class="mt-2 flex items-center text-[10px] text-gray-400">
              <CheckCircle2 class="w-3 h-3 mr-1 text-green-500" />
              Changes are saved when you click "Save Changes" at the top.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
