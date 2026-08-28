import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearThingsVisToken: vi.fn(),
  getThingsVisToken: vi.fn(),
  requestUse: vi.fn(),
  responseUse: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: mocks.requestUse },
        response: { use: mocks.responseUse }
      },
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn()
    })
  }
}))
vi.mock('@/utils/thingsvis', () => ({
  clearThingsVisToken: mocks.clearThingsVisToken,
  getThingsVisToken: mocks.getThingsVisToken
}))

describe('ThingsVis API authentication failures', () => {
  beforeEach(async () => {
    vi.resetModules()
    Object.values(mocks).forEach(mock => mock.mockReset())
    await import('./thingsvis')
  })

  it('invalidates only the token used by a 401 request and never retries it under a new identity', async () => {
    const rejected = mocks.responseUse.mock.calls[0]?.[1] as (error: unknown) => Promise<never>
    const error = {
      config: {
        method: 'put',
        headers: { Authorization: 'Bearer old-thingsvis-token' }
      },
      response: { status: 401 }
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(mocks.clearThingsVisToken).toHaveBeenCalledOnce()
    expect(mocks.clearThingsVisToken).toHaveBeenCalledWith('old-thingsvis-token')
    expect(mocks.getThingsVisToken).not.toHaveBeenCalled()
  })
})
