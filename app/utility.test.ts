import { describe, expect, it } from 'vitest'

import { toPgVector } from './utility'

describe('toPgVector', () => {
  it('数値配列をPostgreSQLベクトルリテラル形式に変換する', () => {
    expect(toPgVector([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]')
  })

  it('空配列を空ベクトルリテラルに変換する', () => {
    expect(toPgVector([])).toBe('[]')
  })

  it('単一要素の配列を正しく変換する', () => {
    expect(toPgVector([1])).toBe('[1]')
  })

  it('負の値と浮動小数点を含む配列を正しく変換する', () => {
    expect(toPgVector([-0.5, 0, 1.5])).toBe('[-0.5,0,1.5]')
  })
})
