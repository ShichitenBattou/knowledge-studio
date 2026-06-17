<script setup lang="ts">
import { RAG_MODELS, useRag } from '~/composables/useRag'
import type { RagSource } from '~/composables/useRag'

const { generateEmbedding } = useEmbedding()
const { searchNotes } = useKnowledgeSearch(generateEmbedding)
const {
  isModelLoading,
  isModelLoaded,
  modelLoadProgress,
  modelLoadError,
  isGenerating,
  streamingAnswer,
  sources,
  selectedModel,
  generate,
  loadModel,
  selectModel,
} = useRag(searchNotes)

const modelOptions = RAG_MODELS.map((m) => ({ label: m.label, value: m.id }))
const query = ref('')
const topK = ref(5)

const generateError = ref('')
const selectedSourceNote = ref<RagSource | null>(null)
const isSourceModalOpen = ref(false)

function openSourceModal(source: RagSource) {
  selectedSourceNote.value = source
  isSourceModalOpen.value = true
}

async function handleLoadModel() {
  await loadModel(selectedModel.value)
}

async function handleGenerate() {
  if (!query.value.trim() || isGenerating.value || !isModelLoaded.value) return
  generateError.value = ''
  try {
    await generate(query.value.trim(), topK.value)
  } catch (e) {
    generateError.value = e instanceof Error ? e.message : '生成中にエラーが発生しました'
    console.error('RAG生成エラー', e)
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-3xl">
    <h1 class="text-2xl font-bold mb-8">RAG チャット</h1>

    <!-- モデル設定 -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-4">モデル設定</h2>
      <div class="space-y-3">
        <div class="flex gap-3 items-center">
          <USelect
            :model-value="selectedModel"
            :items="modelOptions"
            value-key="value"
            label-key="label"
            class="flex-1"
            :disabled="isModelLoading || isGenerating"
            @update:model-value="selectModel"
          />
          <UButton
            :loading="isModelLoading"
            :disabled="isModelLoading || isGenerating"
            @click="handleLoadModel"
          >
            {{ isModelLoaded ? 'モデルを切り替え' : 'モデルをロード' }}
          </UButton>
        </div>
        <p v-if="isModelLoading && modelLoadProgress" class="text-sm text-muted">
          {{ modelLoadProgress }}
        </p>
        <p v-if="modelLoadError" class="text-sm text-error">{{ modelLoadError }}</p>
        <p v-if="isModelLoaded" class="text-sm text-success">モデルの準備ができました</p>
      </div>
    </section>

    <USeparator class="mb-8" />

    <!-- 質問入力 -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-4">質問</h2>
      <div class="space-y-3">
        <UTextarea
          v-model="query"
          placeholder="ナレッジベースに質問してください..."
          :rows="3"
          :disabled="!isModelLoaded || isGenerating"
          class="w-full"
        />
        <div class="flex gap-4 items-center justify-between">
          <div class="flex items-center gap-2">
            <label for="top-k-input" class="text-sm text-muted">参照件数 (top-k)</label>
            <UInput
              id="top-k-input"
              v-model.number="topK"
              type="number"
              class="w-20"
              :min="1"
              :max="10"
              :disabled="!isModelLoaded || isGenerating"
            />
          </div>
          <UButton
            :loading="isGenerating"
            :disabled="!isModelLoaded || isGenerating || !query.trim()"
            @click="handleGenerate"
          >
            回答を生成
          </UButton>
        </div>
      </div>
    </section>

    <!-- 生成エラー -->
    <p v-if="generateError" class="text-sm text-error mt-2">{{ generateError }}</p>

    <!-- 回答 -->
    <template v-if="streamingAnswer || isGenerating">
      <USeparator class="mb-8" />

      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">回答</h2>
        <div class="p-4 rounded-lg border border-default bg-elevated">
          <p v-if="isGenerating && !streamingAnswer" class="text-sm text-muted animate-pulse">
            生成中...
          </p>
          <p v-else class="text-sm whitespace-pre-wrap">{{ streamingAnswer }}</p>
        </div>
      </section>

      <!-- 出典 (#8) -->
      <section v-if="!isGenerating">
        <h2 class="text-lg font-semibold mb-4">
          出典
          <UBadge color="neutral" variant="subtle" class="ml-2">{{ sources.length }}件</UBadge>
        </h2>
        <div v-if="sources.length" class="space-y-2">
          <button
            v-for="source in sources"
            :key="source.id"
            class="w-full text-left p-3 rounded-lg border border-default bg-elevated hover:bg-muted transition-colors cursor-pointer"
            @click="openSourceModal(source)"
          >
            <div class="flex justify-between items-start gap-2">
              <p class="text-sm flex-1 truncate">
                {{ source.note.slice(0, 30) }}{{ source.note.length > 30 ? '...' : '' }}
              </p>
              <UBadge color="success" variant="subtle" class="shrink-0">
                {{ source.similarity.toFixed(2) }}
              </UBadge>
            </div>
            <div v-if="source.tags.length" class="flex gap-1 mt-2 flex-wrap">
              <UBadge
                v-for="tag in source.tags"
                :key="tag"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ tag }}
              </UBadge>
            </div>
          </button>
        </div>
        <p v-else class="text-sm text-muted">参照したナレッジはありません</p>
      </section>
    </template>

    <!-- 出典モーダル -->
    <UModal v-model:open="isSourceModalOpen" title="ナレッジ全文">
      <template #body>
        <div class="p-6">
          <UBadge v-if="selectedSourceNote" color="success" variant="subtle" class="mb-4">
            類似度 {{ selectedSourceNote.similarity.toFixed(2) }}
          </UBadge>
          <p v-if="selectedSourceNote" class="text-sm whitespace-pre-wrap">
            {{ selectedSourceNote.note }}
          </p>
          <div v-if="selectedSourceNote?.tags.length" class="flex gap-1 mt-4 flex-wrap">
            <UBadge
              v-for="tag in selectedSourceNote.tags"
              :key="tag"
              color="neutral"
              variant="outline"
              size="sm"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
