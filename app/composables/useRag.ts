import { CreateMLCEngine } from '@mlc-ai/web-llm'
import type { MLCEngine } from '@mlc-ai/web-llm'

import type { SearchResult } from './useKnowledgeSearch'

export interface RagSource {
  id: string
  note: string
  similarity: number
  tags: string[]
}

const SIMILARITY_THRESHOLD = 0.6

export const RAG_MODELS = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5-1.5B（軽量・日本語対応, ~2GB）',
  },
  {
    id: 'Phi-4-mini-instruct-q4f16_1-MLC',
    label: 'Phi-4-mini（高品質, ~4GB）',
  },
] as const

export type RagModelId = (typeof RAG_MODELS)[number]['id']

let _engine: MLCEngine | null = null
let _generationLock = false
const _isModelLoading = ref(false)
const _isModelLoaded = ref(false)
const _modelLoadProgress = ref('')
const _selectedModel = ref<(typeof RAG_MODELS)[number]['id']>(RAG_MODELS[0].id)
const _modelLoadError = ref('')

export function _resetRagForTest() {
  if (!import.meta.env.VITEST) return
  _engine = null
  _generationLock = false
  _isModelLoading.value = false
  _isModelLoaded.value = false
  _modelLoadError.value = ''
  _modelLoadProgress.value = ''
  _selectedModel.value = RAG_MODELS[0].id
}

export function useRag(searchFn: (query: string, topK: number) => Promise<SearchResult[]>) {
  const isGenerating = ref(false)
  const streamingAnswer = ref('')
  const sources = ref<RagSource[]>([])

  function selectModel(modelId: RagModelId) {
    if (_selectedModel.value === modelId) return
    _selectedModel.value = modelId
    _engine = null
    _isModelLoaded.value = false
    _modelLoadError.value = ''
    streamingAnswer.value = ''
    sources.value = []
  }

  async function loadModel(modelId: RagModelId) {
    if (_isModelLoading.value) return
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      _modelLoadError.value =
        'WebGPUが利用できません。Chrome/Edge など WebGPU 対応ブラウザをお使いください。詳細: https://webgpureport.org/'
      return
    }
    _isModelLoading.value = true
    _isModelLoaded.value = false
    _engine = null
    _modelLoadProgress.value = ''
    _modelLoadError.value = ''
    try {
      _engine = await CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          _modelLoadProgress.value = progress.text
        },
      })
      _selectedModel.value = modelId
      _isModelLoaded.value = true
    } catch (e) {
      _engine = null
      const msg = e instanceof Error ? e.message : String(e)
      console.error('モデルのロードに失敗しました', e)
      _modelLoadError.value = `モデルのロードに失敗しました: ${msg}`
    } finally {
      _isModelLoading.value = false
    }
  }

  async function generate(query: string, topK: number = 5): Promise<string> {
    if (_generationLock || !_engine || !_isModelLoaded.value) return ''

    _generationLock = true
    isGenerating.value = true
    streamingAnswer.value = ''
    sources.value = []

    try {
      const results = (await searchFn(query, topK)).filter(
        (r) => r.similarity >= SIMILARITY_THRESHOLD,
      )
      sources.value = results.map((r) => ({
        id: r.id,
        note: r.note,
        similarity: r.similarity,
        tags: r.tags,
      }))

      if (results.length === 0) {
        const msg = '関連するナレッジが見つかりませんでした。'
        streamingAnswer.value = msg
        return msg
      }

      const context = results.map((r, i) => `${i + 1}. ${r.note}`).join('\n')
      const userMessage = [
        'あなたはナレッジベースのアシスタントです。以下の参照ナレッジをもとに質問に回答してください。',
        '参照ナレッジにない情報は含めないでください。',
        '',
        '## 参照ナレッジ',
        context,
        '',
        '## 質問',
        query,
        '',
        '## 回答',
      ].join('\n')

      const stream = await _engine.chat.completions.create({
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
      })

      let answer = ''
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? ''
        answer += delta
        streamingAnswer.value = answer
      }
      return answer
    } finally {
      _generationLock = false
      isGenerating.value = false
    }
  }

  return {
    isModelLoading: _isModelLoading,
    isModelLoaded: _isModelLoaded,
    modelLoadProgress: _modelLoadProgress,
    modelLoadError: _modelLoadError,
    isGenerating,
    streamingAnswer,
    sources,
    selectedModel: _selectedModel,
    generate,
    loadModel,
    selectModel,
  }
}
