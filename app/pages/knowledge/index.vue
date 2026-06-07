<script setup lang="ts">
import { db, initializeKnowledgeDB } from '~/db'
import { toPgVector } from '~/utility'

interface Tag {
    id: string
    name: string
}

interface Note {
    id: string
    note: string
    created_at: string
    tags: string[]
}

const allNotes = reactive<Note[]>([])
const allTags = reactive<Tag[]>([])

const newNote = ref('')
const newNoteTags = ref<string[]>([])
const newTagInput = ref('')
const isCreating = ref(false)

const isModalOpen = ref(false)
const editingNote = reactive({ id: '', note: '', tags: [] as string[] })
const editTagInput = ref('')
const isUpdating = ref(false)

const isTagManagerOpen = ref(false)
const filterTags = ref<string[]>([])
const editNoteRef = ref()
const editingTagId = ref<string | null>(null)
const editingTagNameInput = ref('')

const { generateEmbedding, isLoading: isEmbeddingLoading } = useEmbedding()

const isBusy = computed(() => isCreating.value || isUpdating.value || isEmbeddingLoading.value)

const filteredNotes = computed(() => {
    if (filterTags.value.length === 0) return allNotes
    return allNotes.filter(note =>
        filterTags.value.every(tag => note.tags.includes(tag))
    )
})

const newTagSuggestions = computed(() => {
    const input = newTagInput.value.trim().toLowerCase()
    return allTags.filter(t =>
        !newNoteTags.value.includes(t.name) &&
        (!input || t.name.toLowerCase().startsWith(input))
    )
})

const editTagSuggestions = computed(() => {
    const input = editTagInput.value.trim().toLowerCase()
    return allTags.filter(t =>
        !editingNote.tags.includes(t.name) &&
        (!input || t.name.toLowerCase().startsWith(input))
    )
})

onMounted(async () => {
    await initializeKnowledgeDB()
    db.live.query<Note>(
        `SELECT n.id, n.note, n.created_at,
                COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
         FROM notes n
         LEFT JOIN note_tags nt ON n.id = nt.note_id
         LEFT JOIN tags t ON nt.tag_id = t.id
         GROUP BY n.id, n.note, n.created_at
         ORDER BY n.created_at DESC NULLS LAST`,
        [],
        (result) => { allNotes.splice(0, allNotes.length, ...result.rows) }
    )
    db.live.query<Tag>(
        'SELECT id, name FROM tags ORDER BY name',
        [],
        (result) => { allTags.splice(0, allTags.length, ...result.rows) }
    )
})

async function getOrCreateTagId(name: string): Promise<string> {
    const newId = crypto.randomUUID()
    await db.query(
        'INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [newId, name]
    )
    const result = await db.query<Tag>('SELECT id FROM tags WHERE name = $1', [name])
    return result.rows[0]!.id
}

async function saveTags(noteId: string, tagNames: string[]): Promise<void> {
    await db.query('DELETE FROM note_tags WHERE note_id = $1', [noteId])
    for (const name of tagNames) {
        const trimmed = name.trim()
        if (!trimmed) continue
        const tagId = await getOrCreateTagId(trimmed)
        await db.query(
            'INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [noteId, tagId]
        )
    }
}

async function handleCreate() {
    const text = newNote.value.trim()
    if (!text) return
    isCreating.value = true
    try {
        const noteId = crypto.randomUUID()
        const embedding = await generateEmbedding(text)
        await db.query(
            'INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)',
            [noteId, text, toPgVector(embedding)]
        )
        await saveTags(noteId, newNoteTags.value)
        newNote.value = ''
        newNoteTags.value = []
        newTagInput.value = ''
    } finally {
        isCreating.value = false
    }
}

function addNewTag() {
    const name = newTagInput.value.trim()
    if (name && !newNoteTags.value.includes(name)) {
        newNoteTags.value.push(name)
    }
    newTagInput.value = ''
}

function addEditTag() {
    const name = editTagInput.value.trim()
    if (name && !editingNote.tags.includes(name)) {
        editingNote.tags.push(name)
    }
    editTagInput.value = ''
}

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
        const embedding = await generateEmbedding(editingNote.note)
        await db.query(
            'UPDATE notes SET note = $1, embedding = $2 WHERE id = $3',
            [editingNote.note, toPgVector(embedding), editingNote.id]
        )
        await saveTags(editingNote.id, editingNote.tags)
        isModalOpen.value = false
    } finally {
        isUpdating.value = false
    }
}

async function deleteNote(id: string) {
    await db.query('DELETE FROM notes WHERE id = $1', [id])
}

async function deleteTag(tag: Tag) {
    await db.query('DELETE FROM tags WHERE id = $1', [tag.id])
    filterTags.value = filterTags.value.filter(t => t !== tag.name)
}

function startTagEdit(tag: Tag) {
    editingTagId.value = tag.id
    editingTagNameInput.value = tag.name
}

async function handleTagRename() {
    const id = editingTagId.value
    const name = editingTagNameInput.value.trim()
    if (!id || !name) return
    try {
        await db.query('UPDATE tags SET name = $1 WHERE id = $2', [name, id])
    } finally {
        editingTagId.value = null
        editingTagNameInput.value = ''
    }
}

function cancelTagEdit() {
    editingTagId.value = null
    editingTagNameInput.value = ''
}

function toggleFilterTag(name: string) {
    const idx = filterTags.value.indexOf(name)
    if (idx === -1) filterTags.value.push(name)
    else filterTags.value.splice(idx, 1)
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('ja-JP')
}
</script>

<template>
    <UContainer class="py-8 max-w-3xl">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl font-bold">ナレッジ登録</h1>
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
                @click="toggleFilterTag(tag.name)"
            >
                {{ tag.name }}
            </UBadge>
            <UButton
                v-if="filterTags.length > 0"
                variant="ghost"
                size="xs"
                @click="filterTags = []"
            >
                クリア
            </UButton>
        </div>

        <!-- 登録フォーム -->
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
                <UFormField label="タグ" class="mb-4">
                    <div v-if="newNoteTags.length > 0" class="flex flex-wrap gap-1 mb-2">
                        <UBadge
                            v-for="tag in newNoteTags"
                            :key="tag"
                            variant="solid"
                            color="primary"
                        >
                            {{ tag }}
                            <button
                                type="button"
                                class="ml-1 opacity-60 hover:opacity-100"
                                @click="newNoteTags.splice(newNoteTags.indexOf(tag), 1)"
                            >×</button>
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
                        <UButton type="button" variant="outline" size="sm" :disabled="!newTagInput.trim() || isBusy" @click="addNewTag">
                            追加
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
                            @click="newNoteTags.push(tag.name); newTagInput = ''"
                            @keydown.enter.prevent="newNoteTags.push(tag.name); newTagInput = ''"
                            @keydown.space.prevent="newNoteTags.push(tag.name); newTagInput = ''"
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

        <!-- ナレッジ一覧 -->
        <div v-if="filteredNotes.length === 0" class="text-center text-gray-400 py-12">
            {{ allNotes.length === 0 ? 'ナレッジが登録されていません' : 'フィルタ条件に一致するナレッジがありません' }}
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
                            @click="deleteNote(note.id)"
                        />
                    </div>
                </div>
                <div v-if="note.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                    <UBadge
                        v-for="tag in note.tags"
                        :key="tag"
                        variant="subtle"
                        color="secondary"
                        size="sm"
                    >
                        {{ tag }}
                    </UBadge>
                </div>
                <template #footer>
                    <span class="text-xs text-gray-400">{{ formatDate(note.created_at) }}</span>
                </template>
            </UCard>
        </div>

        <!-- 編集モーダル -->
        <UModal v-model:open="isModalOpen" title="ナレッジを編集" :close="{ tabindex: -1 }">
            <template #body>
                <UForm @submit.prevent="handleUpdate">
                    <UFormField label="ナレッジ" class="mb-4">
                        <UTextarea
                            ref="editNoteRef"
                            v-model="editingNote.note"
                            :rows="6"
                            class="w-full"
                            :disabled="isUpdating || isEmbeddingLoading"
                        />
                    </UFormField>
                    <UFormField label="タグ" class="mb-4">
                        <div v-if="editingNote.tags.length > 0" class="flex flex-wrap gap-1 mb-2">
                            <UBadge
                                v-for="tag in editingNote.tags"
                                :key="tag"
                                variant="solid"
                                color="primary"
                            >
                                {{ tag }}
                                <button
                                    type="button"
                                    class="ml-1 opacity-60 hover:opacity-100"
                                    @click="editingNote.tags.splice(editingNote.tags.indexOf(tag), 1)"
                                >×</button>
                            </UBadge>
                        </div>
                        <div class="flex gap-2">
                            <UInput
                                v-model="editTagInput"
                                placeholder="タグ名を入力して Enter"
                                class="flex-1"
                                :disabled="isUpdating || isEmbeddingLoading"
                                @keydown.enter.prevent="addEditTag"
                            />
                            <UButton type="button" variant="outline" size="sm" :disabled="!editTagInput.trim()" @click="addEditTag">
                                追加
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
                                @click="editingNote.tags.push(tag.name); editTagInput = ''"
                                @keydown.enter.prevent="editingNote.tags.push(tag.name); editTagInput = ''"
                                @keydown.space.prevent="editingNote.tags.push(tag.name); editTagInput = ''"
                            >
                                + {{ tag.name }}
                            </UBadge>
                        </div>
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

        <!-- タグ管理モーダル -->
        <UModal v-model:open="isTagManagerOpen" title="タグ管理">
            <template #body>
                <div v-if="allTags.length === 0" class="text-center text-gray-400 py-8">
                    登録されたタグはありません
                </div>
                <ul class="space-y-2">
                    <li
                        v-for="tag in allTags"
                        :key="tag.id"
                        class="flex items-center justify-between gap-2"
                    >
                        <template v-if="editingTagId === tag.id">
                            <UInput
                                v-model="editingTagNameInput"
                                size="sm"
                                class="flex-1"
                                autofocus
                                @keydown.enter.prevent="handleTagRename"
                                @keydown.escape.prevent="cancelTagEdit"
                            />
                            <UButton size="sm" variant="ghost" icon="i-lucide-check" aria-label="保存" @click="handleTagRename" />
                            <UButton size="sm" variant="ghost" icon="i-lucide-x" aria-label="キャンセル" @click="cancelTagEdit" />
                        </template>
                        <template v-else>
                            <UBadge variant="outline" color="secondary">{{ tag.name }}</UBadge>
                            <div class="flex gap-1">
                                <UButton size="sm" variant="ghost" icon="i-lucide-pencil" aria-label="編集" @click="startTagEdit(tag)" />
                                <UButton size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="削除" @click="deleteTag(tag)" />
                            </div>
                        </template>
                    </li>
                </ul>
            </template>
        </UModal>
    </UContainer>
</template>
