import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn())
const requestPost = vi.hoisted(() => vi.fn())

vi.mock('../request', () => ({
  request: {
    delete: vi.fn(),
    get: requestGet,
    post: requestPost,
    put: vi.fn()
  }
}))

import {
  batchAddServiceMenuList,
  getSelectServiceMenuList,
  getServiceAccess,
  getServiceListDrop,
  getServices
} from './plugin'

describe('plugin list API error ownership', () => {
  beforeEach(() => {
    requestGet.mockReset()
    requestGet.mockResolvedValue({ data: { list: [], total: 0 } })
    requestPost.mockReset()
    requestPost.mockResolvedValue({ data: null, error: null })
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

  it('accepts component-owned silent errors for all service configuration requests', async () => {
    const config = { silentError: true }
    await getServiceListDrop({ service_access_id: 'access' }, config)
    await getSelectServiceMenuList({ protocol_type: 'protocol' }, config)
    await batchAddServiceMenuList({ service_access_id: 'access', device_list: [] }, config)

    expect(requestGet).toHaveBeenNthCalledWith(1, '/service/access/device/list', {
      params: { service_access_id: 'access' },
      silentError: true
    })
    expect(requestGet).toHaveBeenNthCalledWith(2, '/device_config/menu', {
      params: { protocol_type: 'protocol' },
      silentError: true
    })
    expect(requestPost).toHaveBeenCalledWith(
      '/device/service/access/batch',
      { service_access_id: 'access', device_list: [] },
      config
    )
  })
})
