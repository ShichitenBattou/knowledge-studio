<script setup lang="ts">
import type { SearchResult } from '~/composables/useKnowledge'

const {
  allNotes,
  allTags,
  isEmbeddingLoading,
  handleCreate,
  handleUpdate,
  deleteNote,
  deleteTag,
  renameTag,
  searchNotes,
} = useKnowledge()

const searchQuery = ref('')
const searchTopK = ref(5)
const searchTagNames = ref<string[]>([])
const searchResults = ref<SearchResult[]>([])
const isSearching = ref(false)
const isSearchError = ref(false)
const hasSearched = ref(false)

const tagOptions = computed(() => allTags.map((t) => ({ label: t.name, value: t.name })))

async function handleSearch() {
  const trimmed = searchQuery.value.trim()
  if (!trimmed || isSearching.value) return
  isSearching.value = true
  isSearchError.value = false
  try {
    searchResults.value = await searchNotes(
      trimmed,
      searchTopK.value,
      searchTagNames.value.length > 0 ? searchTagNames.value : undefined,
    )
    hasSearched.value = true
  } catch (e) {
    console.error(e)
    isSearchError.value = true
  } finally {
    isSearching.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchTopK.value = 5
  searchTagNames.value = []
  searchResults.value = []
  isSearchError.value = false
  hasSearched.value = false
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

    <USeparator class="mb-8" />

    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-4">ベクトル検索</h2>
      <div class="flex gap-2 mb-3">
        <UInput
          v-model="searchQuery"
          class="flex-1"
          placeholder="検索クエリを入力..."
          :disabled="isEmbeddingLoading || isSearching"
          @keydown.enter="handleSearch"
        />
        <UButton
          :loading="isSearching"
          :disabled="!searchQuery.trim() || isEmbeddingLoading"
          @click="handleSearch"
        >
          検索
        </UButton>
        <UButton v-if="hasSearched" variant="ghost" @click="clearSearch">クリア</UButton>
      </div>
      <div class="flex gap-4 items-center mb-3">
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-400">件数</span>
          <UInput v-model.number="searchTopK" type="number" class="w-20" :min="1" :max="20" />
        </div>
        <div class="flex-1">
          <USelectMenu
            v-model="searchTagNames"
            :options="tagOptions"
            value-attribute="value"
            option-attribute="label"
            multiple
            placeholder="タグで絞り込み"
          />
        </div>
      </div>

      <UAlert
        v-if="isSearchError"
        color="error"
        variant="soft"
        class="mb-3"
        title="検索中にエラーが発生しました。もう一度お試しください。"
      />

      <div v-if="hasSearched && !isSearchError">
        <p v-if="searchResults.length === 0" class="text-sm text-gray-400">
          該当するナレッジが見つかりませんでした。
        </p>
        <ul v-else class="space-y-3">
          <li
            v-for="result in searchResults"
            :key="result.id"
            class="border border-gray-700 rounded-lg p-4"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <p class="text-sm whitespace-pre-wrap flex-1">{{ result.note }}</p>
              <UBadge color="primary" variant="soft">
                {{ result.score.toFixed(2) }}
              </UBadge>
            </div>
            <div v-if="result.tags.length > 0" class="flex flex-wrap gap-1">
              <UBadge
                v-for="tag in result.tags"
                :key="tag"
                color="secondary"
                variant="soft"
                size="xs"
              >
                {{ tag }}
              </UBadge>
            </div>
          </li>
        </ul>
      </div>
    </section>

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
