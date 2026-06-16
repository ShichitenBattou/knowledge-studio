import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetRagForTest, useRag } from './useRag'

const { mockChatCreate, mockCreateMLCEngine } = vi.hoisted(() => {
  const mockChatCreate = vi.fn()
  const mockCreateMLCEngine = vi.fn().mockResolvedValue({
    chat: { completions: { create: mockChatCreate } },
  })
  return { mockChatCreate, mockCreateMLCEngine }
})

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: mockCreateMLCEngine,
}))

function makeAsyncStream(chunks: string[]) {
  return (async function* () {
    for (const content of chunks) {
      yield { choices: [{ delta: { content } }] }
    }
  })()
}

const MOCK_RESULTS = [
  { id: '1', note: 'テストナレッジ1', similarity: 0.9, tags: ['tag1'], created_at: '2024-01-01' },
  { id: '2', note: 'テストナレッジ2', similarity: 0.8, tags: [], created_at: '2024-01-01' },
]

describe('useRag', () => {
  const mockSearchFn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    _resetRagForTest()
    mockSearchFn.mockResolvedValue(MOCK_RESULTS)
    mockChatCreate.mockReturnValue(makeAsyncStream(['回答', 'テキスト']))
    mockCreateMLCEngine.mockResolvedValue({
      chat: { completions: { create: mockChatCreate } },
    })
  })

  afterEach(() => {
    _resetRagForTest()
  })

  describe('loadModel', () => {
    it('モデルをロードし selectedModel と isModelLoaded を更新する', async () => {
      const { loadModel, selectedModel, isModelLoaded, isModelLoading } = useRag(mockSearchFn)
      expect(isModelLoaded.value).toBe(false)
      await loadModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
      expect(mockCreateMLCEngine).toHaveBeenCalledWith(
        'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
        expect.objectContaining({ initProgressCallback: expect.any(Function) }),
      )
      expect(selectedModel.value).toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
      expect(isModelLoaded.value).toBe(true)
      expect(isModelLoading.value).toBe(false)
    })

    it('ロード中の重複呼び出しは無視される', async () => {
      const { loadModel, isModelLoading } = useRag(mockSearchFn)
      isModelLoading.value = true
      await loadModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
      expect(mockCreateMLCEngine).not.toHaveBeenCalled()
    })

    it('initProgressCallback でモデルロード進捗が更新される', async () => {
      const { loadModel, modelLoadProgress } = useRag(mockSearchFn)
      mockCreateMLCEngine.mockImplementation(
        async (_modelId: string, opts: { initProgressCallback: (p: { text: string }) => void }) => {
          opts.initProgressCallback({ text: 'Loading 50%' })
          return { chat: { completions: { create: mockChatCreate } } }
        },
      )
      await loadModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
      expect(modelLoadProgress.value).toBe('Loading 50%')
    })
  })

  describe('generate', () => {
    beforeEach(async () => {
      const { loadModel } = useRag(mockSearchFn)
      await loadModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
    })

    it('searchFn を正しく呼び出す', async () => {
      const { generate } = useRag(mockSearchFn)
      await generate('テストクエリ', 3)
      expect(mockSearchFn).toHaveBeenCalledWith('テストクエリ', 3)
    })

    it('sources が検索結果と一致する', async () => {
      const { generate, sources } = useRag(mockSearchFn)
      await generate('テスト', 5)
      expect(sources.value).toHaveLength(2)
      expect(sources.value[0]).toMatchObject({ id: '1', note: 'テストナレッジ1', similarity: 0.9 })
      expect(sources.value[1]).toMatchObject({ id: '2', note: 'テストナレッジ2', similarity: 0.8 })
    })

    it('isGenerating が推論中 true、完了後 false になる', async () => {
      const { generate, isGenerating } = useRag(mockSearchFn)

      // searchFn を遅延させて isGenerating の中間状態を確認する
      let resolveSearch!: (v: typeof MOCK_RESULTS) => void
      mockSearchFn.mockReturnValue(
        new Promise<typeof MOCK_RESULTS>((r) => {
          resolveSearch = r
        }),
      )

      const promise = generate('テスト')
      const duringGeneration = isGenerating.value // true（awaitの前に設定済み）
      resolveSearch(MOCK_RESULTS)
      await promise

      expect(duringGeneration).toBe(true)
      expect(isGenerating.value).toBe(false)
    })

    it('generate 中の再呼び出しは空文字を返し searchFn を呼ばない', async () => {
      const { generate, isGenerating } = useRag(mockSearchFn)
      isGenerating.value = true
      const result = await generate('テスト')
      expect(result).toBe('')
      expect(mockSearchFn).not.toHaveBeenCalled()
    })

    it('ナレッジが0件の場合は LLM を呼ばず固定メッセージを返す', async () => {
      mockSearchFn.mockResolvedValue([])
      const { generate, streamingAnswer, sources } = useRag(mockSearchFn)
      const result = await generate('テスト')
      expect(result).toBe('関連するナレッジが見つかりませんでした。')
      expect(streamingAnswer.value).toBe('関連するナレッジが見つかりませんでした。')
      expect(sources.value).toHaveLength(0)
      expect(mockChatCreate).not.toHaveBeenCalled()
    })

    it('ストリーミングトークンが streamingAnswer に逐次追記される', async () => {
      mockChatCreate.mockReturnValue(makeAsyncStream(['Hello', ' World']))
      const { generate, streamingAnswer } = useRag(mockSearchFn)
      await generate('テスト')
      expect(streamingAnswer.value).toBe('Hello World')
    })

    it('エンジン未ロード時は空文字を返す', async () => {
      _resetRagForTest()
      const { generate } = useRag(mockSearchFn)
      const result = await generate('テスト')
      expect(result).toBe('')
      expect(mockSearchFn).not.toHaveBeenCalled()
    })
  })
})
