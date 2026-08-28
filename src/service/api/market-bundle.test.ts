import { describe, expect, it } from 'vitest'
import { normalizeMarketBundleList } from './market-bundle'

describe('market bundle list contract', () => {
  it('accepts only the current list and total object', () => {
    const item = { bundleKey: 'bundle', name: 'Bundle' }
    expect(normalizeMarketBundleList({ list: [item], total: 1 })).toEqual({ list: [item], total: 1 })
  })

  it.each([[[]], [{ data: [], total: 0 }], [{ list: [] }]])('rejects removed response shapes: %j', (payload) => {
    expect(() => normalizeMarketBundleList(payload)).toThrow('Invalid dashboard market list response')
  })
})
