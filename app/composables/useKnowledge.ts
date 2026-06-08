import { db, initializeKnowledgeDB } from '~/db'
import { toPgVector } from '~/utility'

export interface Tag {
    id: string
    name: string
}

export interface Note {
    id: string
    note: string
    created_at: string
    tags: string[]
}

export function useKnowledge() {
    const allNotes = reactive<Note[]>([])
    const allTags = reactive<Tag[]>([])
    const { generateEmbedding, isLoading: isEmbeddingLoading } = useEmbedding()

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

    async function handleCreate(text: string, tagNames: string[]): Promise<void> {
        const noteId = crypto.randomUUID()
        const embedding = await generateEmbedding(text)
        await db.query(
            'INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)',
            [noteId, text, toPgVector(embedding)]
        )
        await saveTags(noteId, tagNames)
    }

    async function handleUpdate(id: string, text: string, tagNames: string[]): Promise<void> {
        const embedding = await generateEmbedding(text)
        await db.query(
            'UPDATE notes SET note = $1, embedding = $2 WHERE id = $3',
            [text, toPgVector(embedding), id]
        )
        await saveTags(id, tagNames)
    }

    async function deleteNote(id: string): Promise<void> {
        await db.query('DELETE FROM notes WHERE id = $1', [id])
    }

    async function deleteTag(tag: Tag): Promise<void> {
        await db.query('DELETE FROM tags WHERE id = $1', [tag.id])
    }

    async function renameTag(id: string, name: string): Promise<void> {
        await db.query('UPDATE tags SET name = $1 WHERE id = $2', [name, id])
    }

    return {
        allNotes,
        allTags,
        isEmbeddingLoading,
        handleCreate,
        handleUpdate,
        deleteNote,
        deleteTag,
        renameTag,
    }
}
