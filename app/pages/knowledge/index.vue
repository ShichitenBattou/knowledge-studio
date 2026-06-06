<script setup lang="ts">
import { db, initializeKnowledgeDB } from '~/db'
import { toPgVector } from '~/utility'

interface Note {
    id: string
    note: string
    created_at: string
}

const notes = reactive<Note[]>([])
const newNote = ref('')
const isCreating = ref(false)
const isModalOpen = ref(false)
const editingNote = reactive({ id: '', note: '' })
const isUpdating = ref(false)

const { generateEmbedding, isLoading: isEmbeddingLoading } = useEmbedding()

const isBusy = computed(() => isCreating.value || isUpdating.value || isEmbeddingLoading.value)

onMounted(async () => {
    await initializeKnowledgeDB()
    db.live.query<Note>(
        'SELECT id, note, created_at FROM notes ORDER BY created_at DESC NULLS LAST',
        [],
        (result) => { notes.splice(0, notes.length, ...result.rows) }
    )
})

async function handleCreate() {
    const text = newNote.value.trim()
    if (!text) return
    isCreating.value = true
    try {
        const embedding = await generateEmbedding(text)
        await db.query(
            'INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)',
            [crypto.randomUUID(), text, toPgVector(embedding)]
        )
        newNote.value = ''
    } finally {
        isCreating.value = false
    }
}

function openEditModal(note: Note) {
    editingNote.id = note.id
    editingNote.note = note.note
    isModalOpen.value = true
}

async function handleUpdate() {
    isUpdating.value = true
    try {
        const embedding = await generateEmbedding(editingNote.note)
        await db.query(
            'UPDATE notes SET note = $1, embedding = $2 WHERE id = $3',
            [editingNote.note, toPgVector(embedding), editingNote.id]
        )
        isModalOpen.value = false
    } finally {
        isUpdating.value = false
    }
}

async function deleteNote(id: string) {
    await db.query('DELETE FROM notes WHERE id = $1', [id])
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('ja-JP')
}
</script>

<template>
    <UContainer class="py-8 max-w-3xl">
        <h1 class="text-2xl font-bold mb-6">ナレッジ登録</h1>

        <UCard class="mb-6">
            <UForm @submit.prevent="handleCreate">
                <UFormField label="ナレッジ" class="mb-3">
                    <UTextarea
                        v-model="newNote"
                        placeholder="ナレッジを入力..."
                        :rows="4"
                        class="w-full"
                        :disabled="isBusy"
                    />
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

        <div v-if="notes.length === 0" class="text-center text-gray-400 py-12">
            ナレッジが登録されていません
        </div>

        <div class="space-y-3">
            <UCard v-for="note in notes" :key="note.id">
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
                            @click="deleteNote(note.id)"
                        />
                    </div>
                </div>
                <template #footer>
                    <span class="text-xs text-gray-400">{{ formatDate(note.created_at) }}</span>
                </template>
            </UCard>
        </div>

        <UModal v-model:open="isModalOpen" title="ナレッジを編集">
            <template #body>
                <UForm @submit.prevent="handleUpdate">
                    <UFormField label="ナレッジ" class="mb-4">
                        <UTextarea
                            v-model="editingNote.note"
                            :rows="6"
                            class="w-full"
                            :disabled="isUpdating || isEmbeddingLoading"
                        />
                    </UFormField>
                    <div class="flex gap-2 justify-end">
                        <UButton variant="ghost" @click="isModalOpen = false">
                            キャンセル
                        </UButton>
                        <UButton
                            type="submit"
                            :loading="isUpdating || isEmbeddingLoading"
                            :disabled="!editingNote.note.trim() || isUpdating || isEmbeddingLoading"
                        >
                            保存
                        </UButton>
                    </div>
                </UForm>
            </template>
        </UModal>
    </UContainer>
</template>
