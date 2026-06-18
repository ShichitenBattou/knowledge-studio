import { db, initializeKnowledgeDB } from '~/db'
import { toPgVector } from '~/utility'

export interface SearchResult {
  id: string
  note: string
  created_at: string
  tags: string[]
  similarity: number
}

let _dbInitPromise: Promise<void> | null = null

function ensureDbInitialized(): Promise<void> {
  if (!_dbInitPromise) {
    _dbInitPromise = Promise.resolve(initializeKnowledgeDB()).catch((e) => {
      _dbInitPromise = null
      throw e
    })
  }
  return _dbInitPromise
}

export function useKnowledgeSearch(generateEmbedding: (text: string) => Promise<number[]>) {
  const isSearching = ref(false)

  async function searchNotes(
    query: string,
    topK: number = 5,
    filterTagNames: string[] = [],
  ): Promise<SearchResult[]> {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || isSearching.value) return []
    let safeTopK = Number.isFinite(topK) ? Math.floor(topK) : 5
    if (20 < safeTopK) {
      safeTopK = 20
    } else if (safeTopK < 1) {
      safeTopK = 1
    }
    const safeFilterTags = filterTagNames.map((t) => t.trim()).filter(Boolean)
    isSearching.value = true
    try {
      await ensureDbInitialized()
      const queryEmbedding = await generateEmbedding(trimmedQuery)
      const vectorStr = toPgVector(queryEmbedding)

      let sql: string
      let params: unknown[]

      if (safeFilterTags.length === 0) {
        sql = `
          WITH ranked_notes AS (
            SELECT
              n.id, n.note, n.created_at,
              COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
              MIN(n.embedding <=> $1::vector) AS distance
            FROM notes n
            LEFT JOIN note_tags nt ON n.id = nt.note_id
            LEFT JOIN tags t ON nt.tag_id = t.id
            WHERE n.embedding IS NOT NULL
            GROUP BY n.id, n.note, n.created_at
          )
          SELECT id, note, created_at, tags, (1 - distance) AS similarity
          FROM ranked_notes
          ORDER BY distance ASC
          LIMIT $2
        `
        params = [vectorStr, safeTopK]
      } else {
        sql = `
          WITH ranked_notes AS (
            SELECT
              n.id, n.note, n.created_at,
              COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
              MIN(n.embedding <=> $1::vector) AS distance
            FROM notes n
            LEFT JOIN note_tags nt ON n.id = nt.note_id
            LEFT JOIN tags t ON nt.tag_id = t.id
            WHERE n.embedding IS NOT NULL
            GROUP BY n.id, n.note, n.created_at
            HAVING bool_or(t.name = ANY($3::text[]))
          )
          SELECT id, note, created_at, tags, (1 - distance) AS similarity
          FROM ranked_notes
          ORDER BY distance ASC
          LIMIT $2
        `
        params = [vectorStr, safeTopK, safeFilterTags]
      }

      const result = await db.query<SearchResult>(sql, params)
      return result.rows
    } finally {
      isSearching.value = false
    }
  }

  return { isSearching, searchNotes }
}
