<script setup lang="ts">
import type { Tag, Note } from '~/composables/useKnowledge'

const props = defineProps<{
  allNotes: Note[]
  allTags: Tag[]
  isEmbeddingLoading: boolean
  onUpdate: (id: string, text: string, tags: string[]) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDeleteTag: (tag: Tag) => Promise<void>
  onRenameTag: (id: string, name: string) => Promise<void>
}>()

const filterTags = ref<string[]>([])

const filteredNotes = computed(() => {
  if (filterTags.value.length === 0) return props.allNotes
  return props.allNotes.filter((note) => filterTags.value.every((tag) => note.tags.includes(tag)))
})

// 編集モーダル
const isModalOpen = ref(false)
const editingNote = reactive({ id: '', note: '', tags: [] as string[] })
const editTagInput = ref('')
const isUpdating = ref(false)
const editNoteRef = ref()

const isEditBusy = computed(() => isUpdating.value || props.isEmbeddingLoading)

const editTagSuggestions = computed(() =>
  props.allTags.filter((t) => !editingNote.tags.includes(t.name)),
)

function openEditModal(note: Note) {
  editingNote.id = note.id
  editingNote.note = note.note
  editingNote.tags = [...note.tags]
  editTagInput.value = ''
  isModalOpen.value = true
  setTimeout(() => editNoteRef.value?.textarea?.focus(), 50)
}

async function handleUpdate() {
  isUpdating.value = true
  try {
    await props.onUpdate(editingNote.id, editingNote.note, [...editingNote.tags])
    isModalOpen.value = false
  } finally {
    isUpdating.value = false
  }
}

function addEditTag() {
  const name = editTagInput.value.trim()
  if (name && !editingNote.tags.includes(name)) {
    editingNote.tags.push(name)
  }
  editTagInput.value = ''
}

// タグ管理モーダル
const isTagManagerOpen = ref(false)
const editingTagId = ref<string | null>(null)
const editingTagNameInput = ref('')
// tabindex はHTML属性として UButton に fallthrough するが ButtonProps の型定義に含まれないため
const modalCloseProps = { tabindex: -1 } as Record<string, unknown>
const toast = useToast()

function toggleFilterTag(name: string) {
  const idx = filterTags.value.indexOf(name)
  if (idx === -1) filterTags.value.push(name)
  else filterTags.value.splice(idx, 1)
}

async function handleDeleteTag(tag: Tag) {
  await props.onDeleteTag(tag)
  filterTags.value = filterTags.value.filter((t) => t !== tag.name)
}

function startTagEdit(tag: Tag) {
  editingTagId.value = tag.id
  editingTagNameInput.value = tag.name
}

async function handleTagRename() {
  const id = editingTagId.value
  const trimmedName = editingTagNameInput.value.trim()
  if (!id || !trimmedName) return
  const oldName = props.allTags.find((t) => t.id === id)?.name
  try {
    await props.onRenameTag(id, trimmedName)
    if (oldName && oldName !== trimmedName) {
      const idx = filterTags.value.indexOf(oldName)
      if (idx !== -1) filterTags.value.splice(idx, 1, trimmedName)
    }
    editingTagId.value = null
    editingTagNameInput.value = ''
  } catch (e) {
    console.error(e)
    const isDuplicate = e instanceof Error && /unique|duplicate/i.test(e.message)
    toast.add({
      title: 'タグ名の変更に失敗しました',
      description: isDuplicate ? '同名のタグが既に存在します' : 'エラーが発生しました',
      color: 'error',
    })
  }
}

function cancelTagEdit() {
  editingTagId.value = null
  editingTagNameInput.value = ''
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ja-JP')
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">ナレッジ一覧</h2>
      <UButton
        v-if="allTags.length > 0"
        variant="ghost"
        size="sm"
        icon="i-lucide-tag"
        @click="isTagManagerOpen = true"
      >
        タグ管理
      </UButton>
    </div>

    <!-- タグフィルタバー -->
    <div v-if="allTags.length > 0" class="flex flex-wrap gap-2 mb-5">
      <UBadge
        v-for="tag in allTags"
        :key="tag.id"
        :variant="filterTags.includes(tag.name) ? 'solid' : 'outline'"
        color="secondary"
        class="cursor-pointer select-none"
        tabindex="0"
        role="button"
        :aria-pressed="filterTags.includes(tag.name)"
        @click="toggleFilterTag(tag.name)"
        @keydown.enter.prevent="toggleFilterTag(tag.name)"
        @keydown.space.prevent="toggleFilterTag(tag.name)"
      >
        {{ tag.name }}
      </UBadge>
      <UButton v-if="filterTags.length > 0" variant="ghost" size="xs" @click="filterTags = []">
        クリア
      </UButton>
    </div>

    <!-- ナレッジカード -->
    <div v-if="filteredNotes.length === 0" class="text-center text-gray-400 py-12">
      {{
        allNotes.length === 0
          ? 'ナレッジが登録されていません'
          : 'フィルタ条件に一致するナレッジがありません'
      }}
    </div>

    <div class="space-y-3">
      <UCard v-for="note in filteredNotes" :key="note.id">
        <div class="flex justify-between items-start gap-4">
          <p class="flex-1 text-sm whitespace-pre-wrap">{{ note.note }}</p>
          <div class="flex gap-1 shrink-0">
            <UButton
              size="sm"
              variant="ghost"
              icon="i-lucide-pencil"
              aria-label="編集"
              @click="openEditModal(note)"
            />
            <UButton
              size="sm"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              aria-label="削除"
              @click="onDelete(note.id)"
            />
          </div>
        </div>
        <div v-if="note.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
          <UBadge v-for="tag in note.tags" :key="tag" variant="subtle" color="secondary" size="sm">
            {{ tag }}
          </UBadge>
        </div>
        <template #footer>
          <span class="text-xs text-gray-400">{{ formatDate(note.created_at) }}</span>
        </template>
      </UCard>
    </div>

    <!-- 編集モーダル -->
    <UModal v-model:open="isModalOpen" title="ナレッジを編集" :close="modalCloseProps">
      <template #body>
        <UForm @submit.prevent="handleUpdate">
          <UFormField label="内容" class="mb-4">
            <UTextarea
              ref="editNoteRef"
              v-model="editingNote.note"
              :rows="6"
              class="w-full"
              :disabled="isEditBusy"
            />
          </UFormField>
          <UFormField label="タグ" class="mb-4">
            <div v-if="editingNote.tags.length > 0" class="flex flex-wrap gap-1 mb-2">
              <UBadge v-for="tag in editingNote.tags" :key="tag" variant="solid" color="primary">
                {{ tag }}
                <button
                  type="button"
                  class="ml-1 opacity-60 hover:opacity-100"
                  :aria-label="`${tag}を削除`"
                  @click="editingNote.tags.splice(editingNote.tags.indexOf(tag), 1)"
                >
                  ×
                </button>
              </UBadge>
            </div>
            <div class="flex gap-2">
              <UInput
                v-model="editTagInput"
                placeholder="タグ名を入力して Enter"
                class="flex-1"
                :disabled="isEditBusy"
                @keydown.enter.prevent="addEditTag"
              />
              <UButton
                type="button"
                variant="outline"
                size="sm"
                :disabled="!editTagInput.trim()"
                @click="addEditTag"
              >
                タグを追加
              </UButton>
            </div>
            <div v-if="editTagSuggestions.length > 0" class="flex flex-wrap gap-1 mt-2">
              <span class="text-xs text-gray-400 w-full">既存タグ：</span>
              <UBadge
                v-for="tag in editTagSuggestions"
                :key="tag.id"
                variant="outline"
                color="secondary"
                class="cursor-pointer"
                tabindex="0"
                role="button"
                @click="
                  editingNote.tags.push(tag.name)
                  editTagInput = ''
                "
                @keydown.enter.prevent="
                  editingNote.tags.push(tag.name)
                  editTagInput = ''
                "
                @keydown.space.prevent="
                  editingNote.tags.push(tag.name)
                  editTagInput = ''
                "
              >
                + {{ tag.name }}
              </UBadge>
            </div>
          </UFormField>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" @click="isModalOpen = false"> キャンセル </UButton>
            <UButton
              type="submit"
              :loading="isUpdating || isEmbeddingLoading"
              :disabled="!editingNote.note.trim() || isEditBusy"
            >
              保存
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- タグ管理モーダル -->
    <UModal v-model:open="isTagManagerOpen" title="タグ管理">
      <template #body>
        <div v-if="allTags.length === 0" class="text-center text-gray-400 py-8">
          登録されたタグはありません
        </div>
        <ul class="space-y-2">
          <li v-for="tag in allTags" :key="tag.id" class="flex items-center justify-between gap-2">
            <template v-if="editingTagId === tag.id">
              <UInput
                v-model="editingTagNameInput"
                size="sm"
                class="flex-1"
                autofocus
                @keydown.enter.prevent="handleTagRename"
                @keydown.escape.prevent="cancelTagEdit"
              />
              <UButton
                size="sm"
                variant="ghost"
                icon="i-lucide-check"
                aria-label="保存"
                @click="handleTagRename"
              />
              <UButton
                size="sm"
                variant="ghost"
                icon="i-lucide-x"
                aria-label="キャンセル"
                @click="cancelTagEdit"
              />
            </template>
            <template v-else>
              <UBadge variant="outline" color="secondary">{{ tag.name }}</UBadge>
              <div class="flex gap-1">
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  aria-label="編集"
                  @click="startTagEdit(tag)"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  aria-label="削除"
                  @click="handleDeleteTag(tag)"
                />
              </div>
            </template>
          </li>
        </ul>
      </template>
    </UModal>
  </div>
</template>
