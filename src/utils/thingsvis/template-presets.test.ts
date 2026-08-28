import { describe, expect, it } from 'vitest'
import { parseTemplateChartConfig } from './template-presets'

describe('template chart config parsing', () => {
  it('accepts an empty or valid object configuration', () => {
    expect(parseTemplateChartConfig('')).toEqual({})
    expect(parseTemplateChartConfig('{"nodes":[]}')).toEqual({ nodes: [] })
  })

  it.each(['{"nodes":', '[]', 123])('rejects damaged configuration %# instead of treating it as empty', raw => {
    expect(() => parseTemplateChartConfig(raw)).toThrow(/禁止覆盖保存/)
  })
})
