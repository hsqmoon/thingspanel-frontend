import { beforeEach, describe, expect, it, vi } from 'vitest'

const deviceTemplateDetail = vi.hoisted(() => vi.fn())

vi.mock('@/service/api/device', () => ({ deviceTemplateDetail }))

import { clearCachedDeviceTemplateDetail, getCachedDeviceTemplateDetail } from './template-detail-cache'

const requestFailure = {
  data: null,
  error: {
    message: 'template unavailable',
    status: 503,
    code: 'ERR_BAD_RESPONSE'
  }
}

describe('ThingsVis template detail cache', () => {
  beforeEach(() => {
    deviceTemplateDetail.mockReset()
    clearCachedDeviceTemplateDetail('template-1')
  })

  it('evicts a resolved FlatRequest failure so the next request can retry', async () => {
    const success = { data: { id: 'template-1', name: 'Recovered template' }, error: null }
    deviceTemplateDetail.mockResolvedValueOnce(requestFailure).mockResolvedValueOnce(success)

    await expect(getCachedDeviceTemplateDetail('template-1')).rejects.toEqual(requestFailure)
    await expect(getCachedDeviceTemplateDetail('template-1')).resolves.toEqual(success)

    expect(deviceTemplateDetail).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent successful requests', async () => {
    const success = { data: { id: 'template-1' }, error: null }
    deviceTemplateDetail.mockResolvedValue(success)

    const [first, second] = await Promise.all([
      getCachedDeviceTemplateDetail('template-1'),
      getCachedDeviceTemplateDetail('template-1')
    ])

    expect(first).toEqual(success)
    expect(second).toBe(first)
    expect(deviceTemplateDetail).toHaveBeenCalledOnce()
  })
})
