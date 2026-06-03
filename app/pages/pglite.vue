<script setup lang="ts">
import { PGlite } from '@electric-sql/pglite'
import { live, type PGliteWithLive } from '@electric-sql/pglite/live'
import { vector } from '@electric-sql/pglite/vector'
import { pipeline } from '@huggingface/transformers'
import { toPgVector } from '~/utility'
import type { ListboxItem } from '@nuxt/ui'
import { db } from '~/db'
import { v4 as uuidv4 } from 'uuid'

const note = ref('')
const notes = reactive<Note[]>([])
const items = computed(() => (
    notes.map(
        note => (
            {
                label: note.note,
                value: note.embedding
            }
        )
    )
))
const loading = ref(false)

class Note {
    id: string = uuidv4()
    note: string
    embedding: number[]

    private constructor(note: string, embedding: number[], id?: string) {
        this.note = note
        this.embedding = embedding
        if (id) {
            this.id = id
        }
    }

    static create(note: string, embedding: number[]) {
        return new Note(note, embedding)
    }

    static fromRow(id: string, note: string, embedding: number[]) {
        return new Note(note, embedding, id)
    }
}

onMounted(async () => {

    await initializeDB()

    await initializeThisPage()
})

async function initializeThisPage() {
    db.live.query("SELECT * FROM notes", [], (result) => {
        notes.splice(0, notes.length, ...result.rows.map((row: any) => Note.fromRow(row.id, row.note, row.embedding)))
        loading.value = false
    }).catch((error) => {
        console.error('Error initializing live query:', error)
    })
}

async function initializeDB() {
    loading.value = true

    db.query('CREATE EXTENSION IF NOT EXISTS vector').then(() => {
        console.log('Vector extension created')
    })

    db.query("CREATE TABLE IF NOT EXISTS notes (id UUID PRIMARY KEY, note TEXT NOT NULL, embedding vector(384))").then(() => {
        console.log('Table created')
    })
}

async function insertNote(note: string) {
    loading.value = true

    const id = crypto.randomUUID()

    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-V2')

    console.log('Extracting features...')

    const output = await extractor(note, { pooling: 'mean', normalize: true })

    const embedding = output.data as number[]

    console.log('Features extracted:', embedding)

    db.query("INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)", [id, note, toPgVector(embedding)]).then(() => {
        console.log('Note inserted')
    }).finally(() => {
        loading.value = false
    })
}

function resetNotes() {
    db.query("DELETE FROM notes").then(() => {
        console.log('Notes reset')
    })
}

async function resetDB() {
    await db.exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
    await initializeDB()
    await initializeThisPage()
    console.log('Database reset')
}

const columns = [
    {
        accessorKey: 'note',
        name: 'note',
        label: 'Note'
    },
    {
        accessorKey: 'embedding',
        name: 'embedding',
        label: 'Embedding'
    },
    {
        accessorKey: 'id',
        name: 'note',
        label: 'Note'
    }
]

</script>

<template>
    <UContainer>
        <h1>PGlite</h1>

        <UContainer class="pb-3">
            <ULabel>Insert a note:</ULabel>
            <UForm @submit.prevent="insertNote(note)">
                <UInput v-model="note" label="Note" />
                <UButton type="submit" label="Insert Note" />
            </UForm>
            <div class="mt-2 flex gap-2 justify-start">
                <UButton label="Reset Notes" target="_blank" @click="resetNotes" />
                <UButton label="Reset DB" target="_blank" @click="resetDB" />
            </div>
        </UContainer>
        <UContainer>
            <UTable sticky :data="notes" :columns="columns" :loading="loading" />
        </UContainer>
    </UContainer>
</template>