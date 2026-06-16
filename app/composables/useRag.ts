import { CreateMLCEngine } from '@mlc-ai/web-llm'
import type { MLCEngine } from '@mlc-ai/web-llm'
import { ref } from 'vue'

import type { SearchResult } from './useKnowledge'

export interface RagSource {
  id: string
  note: string
  similarity: number
  tags: string[]
}

export const RAG_MODELS = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5-1.5B（軽量・日本語対応, ~2GB）',
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Phi-3.5-mini（高品質, ~4GB）',
  },
] as const

let _engine: MLCEngine | null = null
const _isModelLoading = ref(false)
const _isModelLoaded = ref(false)
const _modelLoadProgress = ref('')
const _selectedModel = ref<string>(RAG_MODELS[0].id)
const _isGenerating = ref(false)
const _streamingAnswer = ref('')
const _sources = ref<RagSource[]>([])
const _modelLoadError = ref('')

export function _resetRagForTest() {
  if (!import.meta.env.TEST) return
  _engine = null
  _isModelLoading.value = false
  _isModelLoaded.value = false
  _modelLoadError.value = ''
  _modelLoadProgress.value = ''
  _selectedModel.value = RAG_MODELS[0].id
  _isGenerating.value = false
  _streamingAnswer.value = ''
  _sources.value = []
}

export function useRag(searchFn: (query: string, topK: number) => Promise<SearchResult[]>) {
  async function loadModel(modelId: string) {
    if (_isModelLoading.value) return
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
      _modelLoadError.value = e instanceof Error ? e.message : 'モデルのロードに失敗しました'
    } finally {
      _isModelLoading.value = false
    }
  }

  async function generate(query: string, topK: number = 5): Promise<string> {
    if (_isGenerating.value || !_engine || !_isModelLoaded.value) return ''

    _isGenerating.value = true
    _streamingAnswer.value = ''

    try {
      const results = await searchFn(query, topK)
      _sources.value = results.map((r) => ({
        id: r.id,
        note: r.note,
        similarity: r.similarity,
        tags: r.tags,
      }))

      if (results.length === 0) {
        const msg = '関連するナレッジが見つかりませんでした。'
        _streamingAnswer.value = msg
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
        _streamingAnswer.value = answer
      }
      return answer
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成中にエラーが発生しました'
      _streamingAnswer.value = `エラー: ${msg}`
      throw e
    } finally {
      _isGenerating.value = false
    }
  }

  return {
    isModelLoading: _isModelLoading,
    isModelLoaded: _isModelLoaded,
    modelLoadProgress: _modelLoadProgress,
    modelLoadError: _modelLoadError,
    isGenerating: _isGenerating,
    streamingAnswer: _streamingAnswer,
    sources: _sources,
    selectedModel: _selectedModel,
    generate,
    loadModel,
  }
}
