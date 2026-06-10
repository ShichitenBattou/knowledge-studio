import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'

import { toPgVector } from '~/utility'

// 384次元ベクトルを生成する。x/y成分だけ設定し余りは0
function makeEmbedding(x: number, y = 0): number[] {
  const v = new Array(384).fill(0)
  v[0] = x
  v[1] = y
  return v
}

const SCHEMA = `
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE notes (
    id UUID PRIMARY KEY,
    note TEXT NOT NULL,
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE tags (id UUID PRIMARY KEY, name TEXT NOT NULL UNIQUE);
  CREATE TABLE note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  );
`

// useKnowledge.searchNotes の SQL と同一のクエリ（タグフィルタなし）
const SQL_NO_TAG_FILTER = `
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

// useKnowledge.searchNotes の SQL と同一のクエリ（タグフィルタあり）
const SQL_WITH_TAG_FILTER = `
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

type Row = { id: string; note: string; tags: string[]; score: number }

const ID_A = '00000000-0000-0000-0000-000000000001'
const ID_B = '00000000-0000-0000-0000-000000000002'
const TAG_ID = '00000000-0000-0000-0000-000000000010'

describe('ベクトル検索 SQL (integration)', () => {
  let db: PGlite

  beforeEach(async () => {
    db = new PGlite({ extensions: { vector } })
    await db.exec(SCHEMA)
  })

  afterEach(async () => {
    await db.close()
  })

  it('類似度の高い順に結果が返される', async () => {
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_A,
      'ノートA',
      toPgVector(makeEmbedding(1, 0)),
    ])
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_B,
      'ノートB',
      toPgVector(makeEmbedding(0, 1)),
    ])

    // クエリベクトルは [0.9, 0.1] → コサイン類似度はノートA（[1,0]）の方が高い
    const result = await db.query<Row>(SQL_NO_TAG_FILTER, [toPgVector(makeEmbedding(0.9, 0.1)), 5])

    expect(result.rows[0]!.id).toBe(ID_A)
    expect(result.rows[1]!.id).toBe(ID_B)
    expect(result.rows[0]!.score).toBeGreaterThan(result.rows[1]!.score)
  })

  it('topK件のみ返される', async () => {
    for (let i = 0; i < 10; i++) {
      await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
        `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        `ノート${i}`,
        toPgVector(makeEmbedding(1, i * 0.1)),
      ])
    }

    const result = await db.query<Row>(SQL_NO_TAG_FILTER, [toPgVector(makeEmbedding(1, 0)), 3])

    expect(result.rows).toHaveLength(3)
  })

  it('タグなしのノートは空配列として返される', async () => {
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_A,
      'タグなし',
      toPgVector(makeEmbedding(1, 0)),
    ])

    const result = await db.query<Row>(SQL_NO_TAG_FILTER, [toPgVector(makeEmbedding(1, 0)), 5])

    expect(result.rows[0]!.tags).toEqual([])
  })

  it('複数タグが名前順に集約される', async () => {
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_A,
      'マルチタグ',
      toPgVector(makeEmbedding(1, 0)),
    ])
    await db.query('INSERT INTO tags (id, name) VALUES ($1, $2)', [
      '00000000-0000-0000-0000-000000000011',
      'Vue',
    ])
    await db.query('INSERT INTO tags (id, name) VALUES ($1, $2)', [TAG_ID, 'TypeScript'])
    await db.query('INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)', [
      ID_A,
      '00000000-0000-0000-0000-000000000011',
    ])
    await db.query('INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)', [ID_A, TAG_ID])

    const result = await db.query<Row>(SQL_NO_TAG_FILTER, [toPgVector(makeEmbedding(1, 0)), 5])

    // 名前順（アルファベット順）で TypeScript → Vue
    expect(result.rows[0]!.tags).toEqual(['TypeScript', 'Vue'])
  })

  it('タグフィルタが一致するノートのみ返す', async () => {
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_A,
      'TypeScriptノート',
      toPgVector(makeEmbedding(1, 0)),
    ])
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_B,
      'タグなしノート',
      toPgVector(makeEmbedding(1, 0)),
    ])
    await db.query('INSERT INTO tags (id, name) VALUES ($1, $2)', [TAG_ID, 'TypeScript'])
    await db.query('INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)', [ID_A, TAG_ID])

    const result = await db.query<Row>(SQL_WITH_TAG_FILTER, [
      toPgVector(makeEmbedding(1, 0)),
      5,
      ['TypeScript'],
    ])

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.id).toBe(ID_A)
    expect(result.rows[0]!.tags).toContain('TypeScript')
  })

  it('スコアは 0〜1 の範囲に収まる', async () => {
    await db.query('INSERT INTO notes (id, note, embedding) VALUES ($1, $2, $3)', [
      ID_A,
      'ノートA',
      toPgVector(makeEmbedding(1, 0)),
    ])

    const result = await db.query<Row>(SQL_NO_TAG_FILTER, [toPgVector(makeEmbedding(1, 0)), 5])

    const score = result.rows[0]!.score
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
