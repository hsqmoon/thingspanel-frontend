import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  clearTabs: vi.fn<() => Promise<void>>(),
  resetRoutes: vi.fn<() => Promise<void>>()
}))

vi.mock('@/config/runtime-features', () => ({ isThingsVisEnabled: () => true }))
vi.mock('@/service/api/route', () => ({ fetchGetUserRoutes: vi.fn(), fetchIsRouteExist: vi.fn() }))
vi.mock('@/store/modules/auth/shared', () => ({ getUserInfo: () => ({ roles: [] }) }))
vi.mock('@/store/modules/route', () => ({
  useRouteStore: () => ({ resetStore: mocks.resetRoutes })
}))
vi.mock('@/store/modules/route/shared', () => ({
  filterAuthRoutesByRoles: vi.fn(),
  isRouteExistByRouteName: vi.fn(),
  sortRoutesByOrder: vi.fn()
}))
vi.mock('@/store/modules/tab', () => ({
  useTabStore: () => ({ clearTabs: mocks.clearTabs })
}))
vi.mock('@/router/elegant/transform', () => ({ getRouteName: vi.fn(), getRoutePath: vi.fn() }))
vi.mock('@/router/instance', () => ({
  router: { addRoute: vi.fn(), removeRoute: vi.fn() }
}))
vi.mock('@/router/routes/runtime', () => ({ getRouteRuntime: vi.fn() }))

describe('auth route session reset', () => {
  beforeEach(() => {
    mocks.events.length = 0
    vi.clearAllMocks()
  })

  it('waits for old tabs to clear before removing the old dynamic routes', async () => {
    let finishClearingTabs!: () => void
    mocks.clearTabs.mockImplementation(
      () =>
        new Promise(resolve => {
          mocks.events.push('clear-tabs')
          finishClearingTabs = resolve
        })
    )
    mocks.resetRoutes.mockImplementation(async () => {
      mocks.events.push('reset-routes')
    })

    const { resetAuthRoute } = await import('@/router/auth-route-manager')
    const pendingReset = resetAuthRoute()

    await vi.waitFor(() => expect(mocks.clearTabs).toHaveBeenCalledOnce())
    expect(mocks.resetRoutes).not.toHaveBeenCalled()

    finishClearingTabs()
    await pendingReset

    expect(mocks.events).toEqual(['clear-tabs', 'reset-routes'])
  })
})
