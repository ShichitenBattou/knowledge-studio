// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import KnowledgeAddForm from './KnowledgeAddForm.vue'

describe('KnowledgeAddForm', () => {
  const defaultProps = {
    allTags: [],
    isEmbeddingLoading: false,
    onCreate: vi.fn(),
  }

  it('エラーなくレンダリングされる', () => {
    const wrapper = shallowMount(KnowledgeAddForm, { props: defaultProps })
    expect(wrapper.exists()).toBe(true)
  })

  it('タグありでもエラーなくレンダリングされる', () => {
    const wrapper = shallowMount(KnowledgeAddForm, {
      props: {
        ...defaultProps,
        allTags: [
          { id: 'tag-1', name: 'TypeScript' },
          { id: 'tag-2', name: 'Vue' },
        ],
      },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('isEmbeddingLoadingがtrueでもエラーなくレンダリングされる', () => {
    const wrapper = shallowMount(KnowledgeAddForm, {
      props: { ...defaultProps, isEmbeddingLoading: true },
    })
    expect(wrapper.exists()).toBe(true)
  })
})
