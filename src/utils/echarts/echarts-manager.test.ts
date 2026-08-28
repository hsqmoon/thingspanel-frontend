import { beforeEach, describe, expect, it, vi } from 'vitest'

const echartsUse = vi.hoisted(() => vi.fn())

vi.mock('echarts/core', () => ({
  init: vi.fn(),
  use: echartsUse
}))

import { registerEChartsExtensions } from './echarts-manager'

describe('registerEChartsExtensions', () => {
  beforeEach(() => {
    echartsUse.mockReset()
  })

  it('does not mark an extension as registered when ECharts registration fails', () => {
    echartsUse.mockImplementationOnce(() => {
      throw new Error('registration failed')
    })

    expect(() => registerEChartsExtensions(['scatter'])).toThrowError('registration failed')

    registerEChartsExtensions(['scatter'])
    expect(echartsUse).toHaveBeenCalledTimes(2)
  })
})
