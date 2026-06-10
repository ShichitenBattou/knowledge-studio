// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

import KnowledgePage from './index.vue'

describe('pages/knowledge/index.vue', () => {
  beforeEach(() => {
    vi.stubGlobal('useKnowledge', () => ({
      allNotes: reactive([]),
      allTags: reactive([]),
      isEmbeddingLoading: ref(false),
      handleCreate: vi.fn(),
      handleUpdate: vi.fn(),
      deleteNote: vi.fn(),
      deleteTag: vi.fn(),
      renameTag: vi.fn(),
      searchNotes: vi.fn().mockResolvedValue([]),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ページがエラーなく描画される', () => {
    const wrapper = shallowMount(KnowledgePage)
    expect(wrapper.exists()).toBe(true)
  })

  it('ベクトル検索セクションが表示される', () => {
    const wrapper = shallowMount(KnowledgePage)
    expect(wrapper.text()).toContain('ベクトル検索')
  })

  it('初期状態では検索結果エリアが表示されない', () => {
    const wrapper = shallowMount(KnowledgePage)
    expect(wrapper.text()).not.toContain('該当するナレッジが見つかりませんでした')
  })
})
