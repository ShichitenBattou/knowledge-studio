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

export interface SearchResult {
  id: string
  note: string
  created_at: string
  tags: string[]
  similarity: number
}

export function useKnowledge() {
  const allNotes = reactive<Note[]>([])
  const allTags = reactive<Tag[]>([])
  const isSearching = ref(false)
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
      (result) => {
        allNotes.splice(0, allNotes.length, ...result.rows)
      },
    )
    db.live.query<Tag>('SELECT id, name FROM tags ORDER BY name', [], (result) => {
      allTags.splice(0, allTags.length, ...result.rows)
    })
  })

  async function handleCreate(text: string, tagNames: string[]): Promise<void> {
    const noteId = crypto.randomUUID()
    const embedding = await generateEmbedding(text)
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
        noteId,
        text,
        toPgVector(embedding),
      ])
      for (const name of tagNames) {
        const trimmed = name.trim()
        if (!trimmed) continue
        const newTagId = crypto.randomUUID()
        await tx.query(
          'INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [newTagId, trimmed],
        )
        const tagResult = await tx.query<{ id: string }>('SELECT id FROM tags WHERE name = $1', [
          trimmed,
        ])
        const tagId = tagResult.rows[0]!.id
        await tx.query(
          'INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [noteId, tagId],
        )
      }
    })
  }

  async function handleUpdate(id: string, text: string, tagNames: string[]): Promise<void> {
    const embedding = await generateEmbedding(text)
    await db.transaction(async (tx) => {
      await tx.query('UPDATE notes SET note = $1, embedding = $2 WHERE id = $3', [
        text,
        toPgVector(embedding),
        id,
      ])
      await tx.query('DELETE FROM note_tags WHERE note_id = $1', [id])
      for (const name of tagNames) {
        const trimmed = name.trim()
        if (!trimmed) continue
        const newTagId = crypto.randomUUID()
        await tx.query(
          'INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [newTagId, trimmed],
        )
        const tagResult = await tx.query<{ id: string }>('SELECT id FROM tags WHERE name = $1', [
          trimmed,
        ])
        const tagId = tagResult.rows[0]!.id
        await tx.query(
          'INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, tagId],
        )
      }
    })
  }

  async function deleteNote(id: string): Promise<void> {
    await db.query('DELETE FROM notes WHERE id = $1', [id])
  }

  async function deleteTag(tag: Tag): Promise<void> {
    await db.query('DELETE FROM tags WHERE id = $1', [tag.id])
  }

  async function renameTag(id: string, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.query('UPDATE tags SET name = $1 WHERE id = $2', [trimmed, id])
  }

  async function searchNotes(
    query: string,
    topK: number = 5,
    filterTagNames: string[] = [],
  ): Promise<SearchResult[]> {
    if (isSearching.value) return []
    isSearching.value = true
    try {
      const queryEmbedding = await generateEmbedding(query)
      const vectorStr = toPgVector(queryEmbedding)

      let sql: string
      let params: unknown[]

      if (filterTagNames.length === 0) {
        sql = `
          WITH ranked_notes AS (
            SELECT
              n.id, n.note, n.created_at,
              COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
              (n.embedding <=> $1::vector) AS distance
            FROM notes n
            LEFT JOIN note_tags nt ON n.id = nt.note_id
            LEFT JOIN tags t ON nt.tag_id = t.id
            GROUP BY n.id, n.note, n.created_at, n.embedding
          )
          SELECT id, note, created_at, tags, (1 - distance) AS similarity
          FROM ranked_notes
          ORDER BY distance ASC
          LIMIT $2
        `
        params = [vectorStr, topK]
      } else {
        sql = `
          WITH ranked_notes AS (
            SELECT
              n.id, n.note, n.created_at,
              COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
              (n.embedding <=> $1::vector) AS distance
            FROM notes n
            LEFT JOIN note_tags nt ON n.id = nt.note_id
            LEFT JOIN tags t ON nt.tag_id = t.id
            GROUP BY n.id, n.note, n.created_at, n.embedding
            HAVING bool_or(t.name = ANY($3::text[]))
          )
          SELECT id, note, created_at, tags, (1 - distance) AS similarity
          FROM ranked_notes
          ORDER BY distance ASC
          LIMIT $2
        `
        params = [vectorStr, topK, filterTagNames]
      }

      const result = await db.query<SearchResult>(sql, params)
      return result.rows
    } finally {
      isSearching.value = false
    }
  }

  return {
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
  }
}
