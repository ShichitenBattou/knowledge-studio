<script setup lang="ts">
import type { Tag } from '~/composables/useKnowledge'

const props = defineProps<{
  allTags: Tag[]
  isEmbeddingLoading: boolean
  onCreate: (text: string, tags: string[]) => Promise<void>
}>()

const newNote = ref('')
const newNoteTags = ref<string[]>([])
const newTagInput = ref('')
const isCreating = ref(false)

const isBusy = computed(() => isCreating.value || props.isEmbeddingLoading)

const newTagSuggestions = computed(() =>
  props.allTags.filter((t) => !newNoteTags.value.includes(t.name)),
)

async function handleCreate() {
  const text = newNote.value.trim()
  if (!text) return
  isCreating.value = true
  try {
    await props.onCreate(text, [...newNoteTags.value])
    newNote.value = ''
    newNoteTags.value = []
    newTagInput.value = ''
  } finally {
    isCreating.value = false
  }
}

function addSuggestedTag(name: string) {
  newNoteTags.value.push(name)
  newTagInput.value = ''
}

function addNewTag() {
  const name = newTagInput.value.trim()
  if (name && !newNoteTags.value.includes(name)) {
    newNoteTags.value.push(name)
  }
  newTagInput.value = ''
}
</script>

<template>
  <UCard>
    <UForm @submit.prevent="handleCreate">
      <UFormField label="内容" class="mb-3">
        <UTextarea
          v-model="newNote"
          placeholder="知識・経験・気づきなど何でも"
          :rows="4"
          class="w-full"
          :disabled="isBusy"
        />
      </UFormField>
      <UFormField label="タグ" class="mb-4">
        <div v-if="newNoteTags.length > 0" class="flex flex-wrap gap-1 mb-2">
          <UBadge v-for="tag in newNoteTags" :key="tag" variant="solid" color="primary">
            {{ tag }}
            <button
              type="button"
              class="ml-1 opacity-60 hover:opacity-100"
              :aria-label="`${tag}を削除`"
              @click="newNoteTags.splice(newNoteTags.indexOf(tag), 1)"
            >
              ×
            </button>
          </UBadge>
        </div>
        <div class="flex gap-2">
          <UInput
            v-model="newTagInput"
            placeholder="タグ名を入力して Enter"
            class="flex-1"
            :disabled="isBusy"
            @keydown.enter.prevent="addNewTag"
          />
          <UButton
            type="button"
            variant="outline"
            size="sm"
            :disabled="!newTagInput.trim() || isBusy"
            @click="addNewTag"
          >
            タグを追加
          </UButton>
        </div>
        <div v-if="newTagSuggestions.length > 0" class="flex flex-wrap gap-1 mt-2">
          <span class="text-xs text-gray-400 w-full">既存タグ：</span>
          <UBadge
            v-for="tag in newTagSuggestions"
            :key="tag.id"
            variant="outline"
            color="secondary"
            class="cursor-pointer"
            tabindex="0"
            role="button"
            @click="addSuggestedTag(tag.name)"
            @keydown.enter.prevent="addSuggestedTag(tag.name)"
            @keydown.space.prevent="addSuggestedTag(tag.name)"
          >
            + {{ tag.name }}
          </UBadge>
        </div>
      </UFormField>
      <UButton
        type="submit"
        :loading="isCreating || isEmbeddingLoading"
        :disabled="!newNote.trim() || isBusy"
      >
        保存
      </UButton>
    </UForm>
  </UCard>
</template>
