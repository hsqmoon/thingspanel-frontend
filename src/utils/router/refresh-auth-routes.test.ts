import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initAuthRoute: vi.fn(),
  replace: vi.fn(),
  resetAuthRouteStore: vi.fn()
}))

vi.mock('@/router', () => ({
  router: {
    currentRoute: { value: { fullPath: '/current' } },
    replace: mocks.replace
  }
}))
vi.mock('@/router/auth-route-manager', () => ({
  initAuthRoute: mocks.initAuthRoute,
  resetAuthRouteStore: mocks.resetAuthRouteStore
}))

import { refreshAuthRoutes } from './refresh-auth-routes'

describe('refreshAuthRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resetAuthRouteStore.mockResolvedValue(undefined)
  })

  it('replaces the current route only after the latest route initialization succeeds', async () => {
    mocks.initAuthRoute.mockResolvedValue('success')

    await expect(refreshAuthRoutes('/target')).resolves.toBe('success')

    expect(mocks.resetAuthRouteStore).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/target')
  })

  it('does not navigate when this refresh was superseded', async () => {
    mocks.initAuthRoute.mockResolvedValue('stale')

    await expect(refreshAuthRoutes('/target')).resolves.toBe('stale')

    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
