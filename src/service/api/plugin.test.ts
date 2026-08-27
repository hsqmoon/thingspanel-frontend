import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn())

vi.mock('../request', () => ({
  request: {
    delete: vi.fn(),
    get: requestGet,
    post: vi.fn(),
    put: vi.fn()
  }
}))

import { getServiceAccess, getServices } from './plugin'

describe('plugin list API error ownership', () => {
  beforeEach(() => {
    requestGet.mockReset()
    requestGet.mockResolvedValue({ data: { list: [], total: 0 } })
  })

  it('lets the plugin list component sequence and display its own errors', async () => {
    const params = { page: 1, page_size: 10 }
    await getServices(params)

    expect(requestGet).toHaveBeenCalledWith('/service/list', { params, silentError: true })
  })

  it('lets the access-point component sequence and display its own errors', async () => {
    const params = { page: 1, page_size: 10, service_plugin_id: 'plugin-1' }
    await getServiceAccess(params)

    expect(requestGet).toHaveBeenCalledWith('/service/access/list', { params, silentError: true })
  })
})
