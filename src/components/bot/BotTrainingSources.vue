<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Type,
  Upload,
} from "lucide-vue-next";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "@/composables/useNotification";
import {
  TrainingError,
  deleteTrainingDocument,
  extractPdfText,
  fetchTrainingDocuments,
  ingestDocument,
  removeTrainingFile,
  uploadTrainingFile,
  type IngestResult,
  type TrainingDocument,
} from "@/integrations/training";

const props = defineProps<{ botId: string }>();
const { showToast, askConfirm } = useNotification();

const documents = ref<TrainingDocument[]>([]);
const loading = ref(true);
const showAdd = ref(false);
const mode = ref<"text" | "pdf">("text");
const title = ref("");
const text = ref("");
const pdfFile = ref<File | null>(null);
const pdfName = ref("");
const pdfText = ref("");
const isExtracting = ref(false);
const isAdding = ref(false);
const errorMessage = ref("");
const quotaMessage = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const userPlan = ref("starter");

const canUsePDF = computed(() => ["pro", "enterprise"].includes(userPlan.value));

const totalChunks = computed(() =>
  documents.value.reduce((sum, doc) => sum + doc.chunk_count, 0),
);

const canSubmit = computed(() => {
  if (isAdding.value || isExtracting.value) return false;
  return mode.value === "pdf" ? Boolean(pdfFile.value) : text.value.trim().length > 0;
});

const loadPlan = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  userPlan.value = profile?.plan || "starter";
};

const loadDocuments = async () => {
  loading.value = true;
  try {
    documents.value = await fetchTrainingDocuments(props.botId);
  } catch (error) {
    showToast((error as Error).message, "error");
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  title.value = "";
  text.value = "";
  pdfFile.value = null;
  pdfName.value = "";
  pdfText.value = "";
  errorMessage.value = "";
};

const handleFile = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;

  isExtracting.value = true;
  errorMessage.value = "";
  try {
    const extracted = await extractPdfText(file);
    if (extracted.trim().length < 30) {
      pdfFile.value = null;
      pdfName.value = "";
      pdfText.value = "";
      showToast(
        "This PDF looks like scanned images with no selectable text — extraction is not possible.",
        "warning",
      );
      return;
    }
    pdfFile.value = file;
    pdfName.value = file.name;
    pdfText.value = extracted;
  } catch (error) {
    showToast("Could not read PDF: " + (error as Error).message, "error");
  } finally {
    isExtracting.value = false;
  }
};

const addSource = async () => {
  if (!canSubmit.value) return;

  isAdding.value = true;
  errorMessage.value = "";
  quotaMessage.value = "";

  try {
    let result: IngestResult;

    if (mode.value === "pdf") {
      const file = pdfFile.value!;
      const storagePath = await uploadTrainingFile(props.botId, file);
      try {
        result = await ingestDocument({
          botId: props.botId,
          title: title.value.trim() || file.name,
          sourceType: "file",
          text: pdfText.value,
          storagePath,
        });
      } catch (error) {
        await removeTrainingFile(storagePath).catch(() => undefined);
        throw error;
      }
    } else {
      result = await ingestDocument({
        botId: props.botId,
        title: title.value.trim() || "Pasted text",
        sourceType: "text",
        text: text.value,
      });
    }

    if (result.duplicate) {
      showToast("This source is already indexed — nothing was duplicated.", "warning");
    } else {
      showToast(
        `Indexed ${result.chunksCreated} chunk${result.chunksCreated === 1 ? "" : "s"}${
          result.embedded ? " with semantic embeddings" : ""
        }.`,
        "success",
      );
    }

    resetForm();
    showAdd.value = false;
    await loadDocuments();
  } catch (error) {
    const failure = error as TrainingError;
    if (failure.code === "CHUNK_QUOTA_EXCEEDED") {
      quotaMessage.value = failure.message;
      showAdd.value = false;
    } else {
      errorMessage.value = failure.message;
    }
  } finally {
    isAdding.value = false;
  }
};

const removeSource = async (doc: TrainingDocument) => {
  const confirmed = await askConfirm(
    "Delete Source?",
    `Delete "${doc.title}" and its ${doc.chunk_count} indexed chunk${
      doc.chunk_count === 1 ? "" : "s"
    }? This cannot be undone.`,
  );
  if (!confirmed) return;

  try {
    await deleteTrainingDocument(doc);
    documents.value = documents.value.filter((item) => item.id !== doc.id);
    showToast("Source deleted.", "success");
  } catch (error) {
    showToast((error as Error).message, "error");
  }
};

onMounted(() => {
  loadPlan();
  loadDocuments();
});

watch(() => props.botId, loadDocuments);
</script>

<template>
  <div class="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0"
    >
      <div class="flex items-center space-x-3">
        <div class="bg-orange-50 p-2.5 rounded-xl text-orange-600">
          <Database class="w-6 h-6" />
        </div>
        <div>
          <h3 class="text-xl font-bold">Training Sources</h3>
          <p class="text-xs text-gray-400">
            {{ documents.length }} source{{ documents.length === 1 ? "" : "s" }} ·
            {{ totalChunks }} chunk{{ totalChunks === 1 ? "" : "s" }} indexed
          </p>
        </div>
      </div>
      <button
        @click="showAdd = !showAdd"
        class="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center hover:bg-orange-600 transition-all shadow-sm"
      >
        <Plus class="w-4 h-4 mr-1.5" /> Add Source
      </button>
    </div>

    <!-- Plan limit reached -->
    <div
      v-if="quotaMessage"
      class="flex items-start justify-between gap-4 bg-red-50 border border-red-100 rounded-2xl p-4"
    >
      <div class="flex items-start space-x-2 text-sm text-red-700">
        <AlertTriangle class="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{{ quotaMessage }}</span>
      </div>
      <router-link
        to="/dashboard/settings"
        class="text-xs font-bold text-red-700 underline whitespace-nowrap"
      >
        Upgrade Plan
      </router-link>
    </div>

    <!-- Add source -->
    <div
      v-if="showAdd"
      class="border border-gray-100 rounded-2xl p-5 bg-gray-50/40 space-y-4"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          @click="mode = 'text'"
          :class="[
            'p-3 rounded-xl border-2 text-left flex items-center space-x-2 transition-all',
            mode === 'text'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-100 bg-white hover:border-gray-200',
          ]"
        >
          <Type
            :class="[
              'w-5 h-5',
              mode === 'text' ? 'text-orange-500' : 'text-gray-400',
            ]"
          />
          <span class="text-sm font-bold">Pasted Text</span>
        </button>
        <button
          @click="
            canUsePDF
              ? (mode = 'pdf')
              : showToast('PDF support requires the Pro plan.', 'warning')
          "
          :disabled="!canUsePDF"
          :class="[
            'p-3 rounded-xl border-2 text-left flex items-center justify-between transition-all relative',
            !canUsePDF ? 'opacity-60 cursor-not-allowed' : '',
            mode === 'pdf'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-100 bg-white hover:border-gray-200',
          ]"
        >
          <span class="flex items-center space-x-2">
            <FileText
              :class="[
                'w-5 h-5',
                mode === 'pdf' ? 'text-orange-500' : 'text-gray-400',
              ]"
            />
            <span class="text-sm font-bold">PDF File</span>
          </span>
          <span
            v-if="!canUsePDF"
            class="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full"
          >
            PRO
          </span>
        </button>
      </div>

      <input
        v-model="title"
        type="text"
        placeholder="Source title (optional, e.g. Pricing FAQ)"
        class="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
      />

      <div v-if="mode === 'text'">
        <textarea
          v-model="text"
          rows="5"
          placeholder="Paste the knowledge you want your bot to answer from..."
          class="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none transition-all"
        ></textarea>
      </div>

      <div v-else class="space-y-2">
        <div
          class="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center bg-white"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".pdf"
            class="hidden"
            @change="handleFile"
          />
          <Loader2
            v-if="isExtracting"
            class="w-6 h-6 text-orange-500 mx-auto mb-2 animate-spin"
          />
          <Upload v-else class="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <p class="text-xs text-gray-500 mb-2">
            {{
              isExtracting ? "Extracting text from PDF..." : "Upload a text-based PDF file"
            }}
          </p>
          <button
            type="button"
            :disabled="isExtracting"
            @click="fileInput?.click()"
            class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Choose File
          </button>
        </div>
        <p v-if="pdfName" class="text-xs text-green-600 flex items-center">
          <CheckCircle2 class="w-3.5 h-3.5 mr-1" />
          {{ pdfName }} — {{ pdfText.length.toLocaleString() }} characters extracted
        </p>
      </div>

      <p v-if="errorMessage" class="text-xs text-red-600">{{ errorMessage }}</p>

      <div class="flex justify-end">
        <button
          @click="addSource"
          :disabled="!canSubmit"
          class="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center hover:bg-gray-800 disabled:opacity-50 transition-all"
        >
          <Loader2 v-if="isAdding" class="w-4 h-4 mr-2 animate-spin" />
          <Plus v-else class="w-4 h-4 mr-2" />
          {{ isAdding ? "Indexing..." : "Add to Knowledge" }}
        </button>
      </div>
    </div>

    <!-- Sources list -->
    <div v-if="loading" class="py-8 flex justify-center">
      <Loader2 class="w-6 h-6 text-orange-500 animate-spin" />
    </div>

    <div
      v-else-if="documents.length === 0"
      class="text-center py-12 border-2 border-dashed border-gray-100 rounded-[2rem] bg-gray-50/30"
    >
      <div
        class="bg-white w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm"
      >
        <Database class="w-7 h-7 text-gray-200" />
      </div>
      <p class="text-gray-400 text-sm font-medium">No training sources yet.</p>
      <p class="text-xs text-gray-300 mt-1">
        Add text or a PDF and the bot will answer from exactly this content.
      </p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="border border-gray-100 rounded-2xl p-4 flex items-start justify-between gap-4 hover:border-gray-200 transition-all"
      >
        <div class="flex items-start space-x-3 min-w-0">
          <div class="bg-gray-50 rounded-xl p-2 text-gray-400 flex-shrink-0">
            <FileText v-if="doc.source_type === 'file'" class="w-5 h-5" />
            <Type v-else class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-bold text-gray-900 truncate">{{ doc.title }}</p>
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                :class="
                  doc.source_type === 'file'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-gray-100 text-gray-500'
                "
              >
                {{ doc.source_type === "file" ? "PDF" : "TEXT" }}
              </span>
              <span
                v-if="doc.status === 'failed'"
                class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600"
              >
                FAILED
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-1">
              {{ doc.chunk_count }} chunk{{ doc.chunk_count === 1 ? "" : "s" }} ·
              {{ doc.char_count.toLocaleString() }} chars ·
              {{ new Date(doc.created_at).toLocaleDateString() }}
            </p>
            <p
              v-if="doc.storage_path"
              class="text-[10px] text-gray-300 font-mono truncate mt-1"
              :title="doc.storage_path"
            >
              {{ doc.storage_path }}
            </p>
          </div>
        </div>
        <button
          @click="removeSource(doc)"
          class="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
          title="Delete this source and its chunks"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
