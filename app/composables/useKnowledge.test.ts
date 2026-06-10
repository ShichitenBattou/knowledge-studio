import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  initializeKnowledgeDB: vi.fn(),
}))

// useEmbedding は Nuxt auto-import のため globalThis で提供する
const mockGenerateEmbedding = vi.fn()
Object.assign(globalThis, {
  useEmbedding: () => ({
    generateEmbedding: mockGenerateEmbedding,
    isLoading: ref(false),
  }),
})

describe('useKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateEmbedding.mockResolvedValue(Array(384).fill(0.1))
    mockTransaction.mockImplementation(
      async (callback: (tx: { query: typeof mockTxQuery }) => Promise<void>) => {
        await callback({ query: mockTxQuery })
      },
    )
    // SELECT id FROM tags は tag ID を返す、その他の INSERT/UPDATE/DELETE は空を返す
    mockTxQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id FROM tags')) {
        return { rows: [{ id: 'mock-tag-id' }] }
      }
      return { rows: [] }
    })
  })

  describe('handleCreate', () => {
    it('テキストを埋め込みに変換してノートを作成する', async () => {
      const { handleCreate } = useKnowledge()
      await handleCreate('テストノート', [])
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('テストノート')
      expect(mockTransaction).toHaveBeenCalledOnce()
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
})
