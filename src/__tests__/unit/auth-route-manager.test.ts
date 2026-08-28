import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const resetRoutes = vi.fn<() => Promise<void>>()
  return {
    events: [] as string[],
    clearTabs: vi.fn<() => Promise<void>>(),
    fetchGetUserRoutes: vi.fn(),
    resetRoutes,
    token: 'token',
    routeStore: {
      authRouteMode: 'dynamic',
      hasAuthRoutes: false,
      resetStore: resetRoutes,
      setIsInitAuthRoute: vi.fn(),
      setRouteHome: vi.fn()
    }
  }
})

vi.mock('@/config/runtime-features', () => ({ isThingsVisEnabled: () => true }))
vi.mock('@/service/api/route', () => ({ fetchGetUserRoutes: mocks.fetchGetUserRoutes, fetchIsRouteExist: vi.fn() }))
vi.mock('@/store/modules/auth/shared', () => ({ getUserInfo: () => ({ roles: [] }) }))
vi.mock('@/store/modules/route', () => ({
  useRouteStore: () => mocks.routeStore
}))
vi.mock('@/utils/storage', () => ({ localStg: { get: () => mocks.token } }))
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
    mocks.clearTabs.mockReset().mockResolvedValue()
    mocks.fetchGetUserRoutes.mockReset()
    mocks.resetRoutes.mockReset().mockResolvedValue()
    mocks.routeStore.setIsInitAuthRoute.mockReset()
    mocks.routeStore.setRouteHome.mockReset()
    mocks.token = 'token'
    mocks.routeStore.authRouteMode = 'dynamic'
    mocks.routeStore.hasAuthRoutes = false
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

  it('leaves a flat 401 route failure to the authentication layer', async () => {
    mocks.fetchGetUserRoutes.mockResolvedValue({
      data: null,
      error: { message: 'Session expired', status: 401, code: 'ERR_BAD_RESPONSE' }
    })

    const { initAuthRoute } = await import('@/router/auth-route-manager')

    await expect(initAuthRoute()).resolves.toBe('failed')
    expect(mocks.routeStore.hasAuthRoutes).toBe(false)
  })

  it('does not initialize routes inside an in-progress reset window', async () => {
    let finishClearingTabs!: () => void
    mocks.clearTabs.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishClearingTabs = resolve
        })
    )
    mocks.fetchGetUserRoutes.mockResolvedValue({ data: { list: [] }, error: null })

    const { initAuthRoute, resetAuthRoute } = await import('@/router/auth-route-manager')
    const reset = resetAuthRoute()
    await vi.waitFor(() => expect(mocks.clearTabs).toHaveBeenCalledOnce())
    const initialization = initAuthRoute()

    await Promise.resolve()
    expect(mocks.fetchGetUserRoutes).not.toHaveBeenCalled()

    finishClearingTabs()
    await reset
    await expect(initialization).resolves.toBe('success')
    expect(mocks.fetchGetUserRoutes).toHaveBeenCalledOnce()
  })

  it('does not let a late route response from the previous identity overwrite a reset and new initialization', async () => {
    let resolveOldRequest!: (value: { data: { list: never[] }; error: null }) => void
    mocks.fetchGetUserRoutes
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOldRequest = resolve
          })
      )
      .mockResolvedValueOnce({ data: { list: [] }, error: null })

    const { initAuthRoute, resetAuthRoute } = await import('@/router/auth-route-manager')
    const oldInitialization = initAuthRoute()
    await vi.waitFor(() => expect(mocks.fetchGetUserRoutes).toHaveBeenCalledOnce())

    await resetAuthRoute()
    await expect(initAuthRoute()).resolves.toBe('success')

    resolveOldRequest({ data: { list: [] }, error: null })
    await expect(oldInitialization).resolves.toBe('stale')

    expect(mocks.routeStore.setIsInitAuthRoute).toHaveBeenCalledOnce()
    expect(mocks.routeStore.hasAuthRoutes).toBe(false)
  })

  it('rejects a late successful route response when the identity token changed outside route initialization', async () => {
    let resolveOldRequest!: (value: { data: { list: never[] }; error: null }) => void
    mocks.fetchGetUserRoutes.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOldRequest = resolve
        })
    )

    const { initAuthRoute } = await import('@/router/auth-route-manager')
    const oldInitialization = initAuthRoute()
    await vi.waitFor(() => expect(mocks.fetchGetUserRoutes).toHaveBeenCalledOnce())
    mocks.token = 'new-token'
    resolveOldRequest({ data: { list: [] }, error: null })

    await expect(oldInitialization).resolves.toBe('failed')
    expect(mocks.routeStore.setIsInitAuthRoute).not.toHaveBeenCalled()
  })
})
