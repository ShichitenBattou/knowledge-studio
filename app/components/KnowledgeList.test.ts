// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import KnowledgeList from './KnowledgeList.vue'

describe('KnowledgeList', () => {
  beforeEach(() => {
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const defaultProps = {
    allNotes: [],
    allTags: [],
    isEmbeddingLoading: false,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onDeleteTag: vi.fn(),
    onRenameTag: vi.fn(),
  }

  it('エラーなくレンダリングされる', () => {
    const wrapper = shallowMount(KnowledgeList, { props: defaultProps })
    expect(wrapper.exists()).toBe(true)
  })

  it('ノートリストを受け取ってエラーなくレンダリングされる', () => {
    const wrapper = shallowMount(KnowledgeList, {
      props: {
        ...defaultProps,
        allNotes: [
          {
            id: '1',
            note: 'テストノート',
            created_at: '2026-06-16T00:00:00Z',
            tags: ['TypeScript'],
          },
          { id: '2', note: '別のノート', created_at: '2026-06-16T01:00:00Z', tags: [] },
        ],
        allTags: [{ id: 'tag-1', name: 'TypeScript' }],
      },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('isEmbeddingLoadingがtrueでもエラーなくレンダリングされる', () => {
    const wrapper = shallowMount(KnowledgeList, {
      props: { ...defaultProps, isEmbeddingLoading: true },
    })
    expect(wrapper.exists()).toBe(true)
  })
})
