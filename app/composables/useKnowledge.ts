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

export interface SearchResult extends Note {
  score: number
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
    tagNames?: string[],
  ): Promise<SearchResult[]> {
    const embedding = await generateEmbedding(query)
    const vectorParam = toPgVector(embedding)
    const hasTagFilter = tagNames && tagNames.length > 0

    const sql = hasTagFilter
      ? `
        WITH ranked_notes AS (
          SELECT n.id, n.note, n.created_at, n.embedding <=> $1 AS distance
          FROM notes n
          WHERE EXISTS (
            SELECT 1 FROM note_tags nt2
            JOIN tags t2 ON nt2.tag_id = t2.id
            WHERE nt2.note_id = n.id AND t2.name = ANY($3)
          )
          ORDER BY distance
          LIMIT $2
        )
        SELECT r.id, r.note, r.created_at,
          COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
          1 - r.distance AS score
        FROM ranked_notes r
        LEFT JOIN note_tags nt ON r.id = nt.note_id
        LEFT JOIN tags t ON nt.tag_id = t.id
        GROUP BY r.id, r.note, r.created_at, r.distance
        ORDER BY r.distance
      `
      : `
        WITH ranked_notes AS (
          SELECT n.id, n.note, n.created_at, n.embedding <=> $1 AS distance
          FROM notes n
          ORDER BY distance
          LIMIT $2
        )
        SELECT r.id, r.note, r.created_at,
          COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
          1 - r.distance AS score
        FROM ranked_notes r
        LEFT JOIN note_tags nt ON r.id = nt.note_id
        LEFT JOIN tags t ON nt.tag_id = t.id
        GROUP BY r.id, r.note, r.created_at, r.distance
        ORDER BY r.distance
      `

    const params = hasTagFilter ? [vectorParam, topK, tagNames] : [vectorParam, topK]
    const result = await db.query<SearchResult>(sql, params)
    return result.rows.map((row) => ({ ...row, score: Math.max(0, row.score) }))
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
    searchNotes,
  }
}
