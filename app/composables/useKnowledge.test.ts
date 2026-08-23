import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useKnowledge } from './useKnowledge'

// vi.mock ファクトリから参照するモック関数を vi.hoisted で定義する
const { mockTxQuery, mockTransaction, mockDbQuery } = vi.hoisted(() => ({
  mockTxQuery: vi.fn(),
  mockTransaction: vi.fn(),
  mockDbQuery: vi.fn(),
}))

// PGlite は WASM/ブラウザ依存のためモックに置き換える
vi.mock('../db', () => ({
  db: {
    live: { query: vi.fn() },
    query: mockDbQuery,
    transaction: mockTransaction,
  },
  initializeKnowledgeDB: vi.fn().mockResolvedValue(undefined),
}))

// useEmbedding は Nuxt auto-import のため vi.stubGlobal で提供する
const mockGenerateEmbedding = vi.fn()

describe('useKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // vi.stubGlobal でテスト間の globalThis 汚染を防ぐ
    vi.stubGlobal('useEmbedding', () => ({
      generateEmbedding: mockGenerateEmbedding,
      isLoading: ref(false),
    }))
    mockGenerateEmbedding.mockResolvedValue(Array(384).fill(0.1))
    mockTransaction.mockImplementation(
      async (callback: (tx: { query: typeof mockTxQuery }) => Promise<void>) => {
        await callback({ query: mockTxQuery })
      },
    )
    // SELECT id FROM tags WHERE name は tag ID を返す、その他は空を返す
    mockTxQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM tags WHERE name')) {
        return { rows: [{ id: 'mock-tag-id' }] }
      }
      return { rows: [] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('handleCreate', () => {
    it('テキストを埋め込みに変換してノートを作成する', async () => {
      const { handleCreate } = useKnowledge()
      await handleCreate('テストノート', [])
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('テストノート')
      expect(mockTransaction).toHaveBeenCalledOnce()
      const notesInsert = mockTxQuery.mock.calls.find(([sql]: [string]) =>
        sql.startsWith('INSERT INTO notes'),
      )
      expect(notesInsert).toBeDefined()
      expect(notesInsert![1][1]).toBe('テストノート')
    })

    it('タグ名の前後スペースを除去して登録する', async () => {
      const { handleCreate } = useKnowledge()
      await handleCreate('ノート', ['  タグA  ', ' タグB'])
      const tagInsertCalls = mockTxQuery.mock.calls.filter(([sql]: [string]) =>
        sql.startsWith('INSERT INTO tags'),
      )
      expect(tagInsertCalls[0][1][1]).toBe('タグA')
      expect(tagInsertCalls[1][1][1]).toBe('タグB')
    })

    it('空文字・スペースのみのタグ名はスキップする', async () => {
      const { handleCreate } = useKnowledge()
      await handleCreate('ノート', ['', '   ', 'タグA'])
      const tagInsertCalls = mockTxQuery.mock.calls.filter(([sql]: [string]) =>
        sql.startsWith('INSERT INTO tags'),
      )
      expect(tagInsertCalls).toHaveLength(1)
      expect(tagInsertCalls[0][1][1]).toBe('タグA')
    })
  })

  describe('handleUpdate', () => {
    it('ノートの内容と埋め込みを更新する', async () => {
      const { handleUpdate } = useKnowledge()
      await handleUpdate('note-id', '更新後テキスト', [])
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('更新後テキスト')
      const updateCall = mockTxQuery.mock.calls.find(([sql]: [string]) =>
        sql.startsWith('UPDATE notes'),
      )
      expect(updateCall).toBeDefined()
      expect(updateCall![1][2]).toBe('note-id')
    })

    it('更新前に既存のタグ紐付けを削除する', async () => {
      const { handleUpdate } = useKnowledge()
      await handleUpdate('note-id', 'テキスト', ['新タグ'])
      const deleteCall = mockTxQuery.mock.calls.find(([sql]: [string]) =>
        sql.startsWith('DELETE FROM note_tags'),
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![1][0]).toBe('note-id')
    })
  })

  describe('deleteNote', () => {
    it('指定したIDのノートを削除する', async () => {
      const { deleteNote } = useKnowledge()
      await deleteNote('target-note-id')
      expect(mockDbQuery).toHaveBeenCalledWith('DELETE FROM notes WHERE id = $1', [
        'target-note-id',
      ])
    })
  })

  describe('deleteTag', () => {
    it('指定したタグを削除する', async () => {
      const { deleteTag } = useKnowledge()
      await deleteTag({ id: 'tag-id', name: 'タグ' })
      expect(mockDbQuery).toHaveBeenCalledWith('DELETE FROM tags WHERE id = $1', ['tag-id'])
    })
  })

  describe('renameTag', () => {
    it('タグ名をトリムして更新する', async () => {
      const { renameTag } = useKnowledge()
      await renameTag('tag-id', '  新名前  ')
      expect(mockDbQuery).toHaveBeenCalledWith('UPDATE tags SET name = $1 WHERE id = $2', [
        '新名前',
        'tag-id',
      ])
    })

    it('トリム後に空になる場合は更新をスキップする', async () => {
      const { renameTag } = useKnowledge()
      await renameTag('tag-id', '   ')
      expect(mockDbQuery).not.toHaveBeenCalled()
    })
  })

  describe('searchNotes', () => {
    beforeEach(() => {
      mockDbQuery.mockResolvedValue({ rows: [] })
    })

    it('クエリから埋め込みを生成してDBに渡す', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('テスト検索')
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('テスト検索')
      expect(mockDbQuery).toHaveBeenCalledOnce()
      const [sql, params] = mockDbQuery.mock.calls[0]
      expect(sql).toContain('<=> $1::vector')
      expect(params[0]).toMatch(/^\[/)
    })

    it('topKをデフォルト5で検索する', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ')
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(5)
    })

    it('topKを任意値で指定できる', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 3)
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(3)
    })

    it('filterTagNamesを渡した場合はHAVING句付きSQLを使用する', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 5, ['タグA', 'タグB'])
      const [sql, params] = mockDbQuery.mock.calls[0]
      expect(sql).toContain('HAVING bool_or')
      expect(params[2]).toEqual(['タグA', 'タグB'])
    })

    it('空白のみのクエリは空配列を返しEmbeddingを呼ばない', async () => {
      const { searchNotes } = useKnowledge()
      const result = await searchNotes('   ')
      expect(result).toEqual([])
      expect(mockGenerateEmbedding).not.toHaveBeenCalled()
    })

    it('topKが小数の場合は切り捨てて渡す', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 3.7)
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(3)
    })

    it('topKが20を超える場合は20にクランプする', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 100)
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(20)
    })

    it('topKがNaNの場合はデフォルト5にフォールバックする', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', NaN)
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(5)
    })

    it('topKが0の場合は1にクランプする', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 0)
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(1)
    })

    it('topKが負数の場合は1にクランプする', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', -5)
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[1]).toBe(1)
    })

    it('filterTagNamesの空文字は除去して渡す', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 5, ['タグA', '', '  '])
      const [sql, params] = mockDbQuery.mock.calls[0]
      expect(sql).toContain('HAVING bool_or')
      expect(params[2]).toEqual(['タグA'])
    })

    it('filterTagNamesの前後スペースをトリムして渡す', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 5, ['  タグA  '])
      const [, params] = mockDbQuery.mock.calls[0]
      expect(params[2]).toEqual(['タグA'])
    })

    it('filterTagNamesが空白のみの場合はHAVINGなしSQLを使用する', async () => {
      const { searchNotes } = useKnowledge()
      await searchNotes('クエリ', 5, ['', '  '])
      const [sql] = mockDbQuery.mock.calls[0]
      expect(sql).not.toContain('HAVING bool_or')
    })

    it('検索中の再呼び出しは空配列を返す', async () => {
      const { searchNotes, isSearching } = useKnowledge()
      isSearching.value = true
      const result = await searchNotes('クエリ')
      expect(result).toEqual([])
      expect(mockGenerateEmbedding).not.toHaveBeenCalled()
    })

    it('generateEmbeddingが失敗した場合はisSearchingをfalseに戻す', async () => {
      const { searchNotes, isSearching } = useKnowledge()
      mockGenerateEmbedding.mockRejectedValueOnce(new Error('embedding失敗'))
      await expect(searchNotes('クエリ')).rejects.toThrow('embedding失敗')
      expect(isSearching.value).toBe(false)
    })
  })
})
