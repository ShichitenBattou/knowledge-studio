<script setup lang="ts">
import type { SearchResult } from '~/composables/useKnowledge'

const {
  allNotes,
  allTags,
  isEmbeddingLoading,
  isSearching,
  handleCreate,
  handleUpdate,
  deleteNote,
  deleteTag,
  renameTag,
  searchNotes,
} = useKnowledge()

const searchQuery = ref('')
const searchTopK = ref(5)
const searchFilterTags = ref<string[]>([])
const searchResults = ref<SearchResult[]>([])
const isDev = import.meta.dev

async function handleSearch() {
  if (!searchQuery.value.trim() || isSearching.value) return
  try {
    searchResults.value = await searchNotes(
      searchQuery.value,
      searchTopK.value,
      searchFilterTags.value,
    )
  } catch (e) {
    console.error('ベクトル検索に失敗しました', e)
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchTopK.value = 5
  searchFilterTags.value = []
  searchResults.value = []
}
</script>

<template>
  <UContainer class="py-8 max-w-3xl">
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-4">ナレッジ追加</h2>
      <KnowledgeAddForm
        :all-tags="allTags"
        :is-embedding-loading="isEmbeddingLoading"
        :on-create="handleCreate"
      />
    </section>

    <template v-if="isDev">
      <USeparator class="mb-8" />

      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">
          ベクトル検索 <UBadge color="warning" variant="subtle">Dev</UBadge>
        </h2>
        <div class="space-y-4">
          <div class="flex gap-2">
            <UInput
              v-model="searchQuery"
              class="flex-1"
              placeholder="検索クエリを入力..."
              :disabled="isSearching"
            />
            <UButton
              :loading="isSearching"
              :disabled="!searchQuery.trim() || isSearching"
              @click="handleSearch"
            >
              検索
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="!searchResults.length"
              @click="clearSearch"
            >
              クリア
            </UButton>
          </div>
          <div class="flex gap-4 items-center">
            <div class="flex items-center gap-2">
              <label class="text-sm text-muted">件数 (top-k)</label>
              <UInput v-model.number="searchTopK" type="number" class="w-20" :min="1" :max="20" />
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm text-muted">タグフィルタ</label>
              <USelectMenu
                v-model="searchFilterTags"
                :items="allTags.map((t) => t.name)"
                multiple
                placeholder="すべて"
                class="w-48"
              />
            </div>
          </div>
          <div v-if="searchResults.length" class="space-y-2">
            <div
              v-for="result in searchResults"
              :key="result.id"
              class="p-3 rounded-lg border border-default bg-elevated"
            >
              <div class="flex justify-between items-start gap-2">
                <p class="text-sm flex-1 whitespace-pre-wrap">{{ result.note }}</p>
                <UBadge color="success" variant="subtle" class="shrink-0">
                  {{ result.similarity.toFixed(2) }}
                </UBadge>
              </div>
              <div v-if="result.tags.length" class="flex gap-1 mt-2 flex-wrap">
                <UBadge
                  v-for="tag in result.tags"
                  :key="tag"
                  color="neutral"
                  variant="outline"
                  size="sm"
                >
                  {{ tag }}
                </UBadge>
              </div>
            </div>
          </div>
          <p v-else-if="searchQuery && !isSearching" class="text-sm text-muted">
            検索結果がありません
          </p>
        </div>
      </section>
    </template>

    <USeparator class="mb-8" />

    <section>
      <KnowledgeList
        :all-notes="allNotes"
        :all-tags="allTags"
        :is-embedding-loading="isEmbeddingLoading"
        :on-update="handleUpdate"
        :on-delete="deleteNote"
        :on-delete-tag="deleteTag"
        :on-rename-tag="renameTag"
      />
    </section>
  </UContainer>
</template>
