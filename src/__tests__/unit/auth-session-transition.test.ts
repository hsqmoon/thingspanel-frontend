import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  storage: new Map<string, unknown>(),
  fetchGetUserInfo: vi.fn(),
  initAuthRoute: vi.fn(),
  logout: vi.fn(),
  resetAuthRoute: vi.fn(),
  transformUser: vi.fn()
}))

vi.mock('@sa/hooks', () => ({
  useLoading: () => ({
    loading: false,
    startLoading: () => mocks.events.push('start-loading'),
    endLoading: () => mocks.events.push('end-loading')
  })
}))
vi.mock('@/hooks/common/router', () => ({
  useRouterPush: () => ({
    route: { value: { meta: { constant: true } } },
    toLogin: vi.fn(),
    redirectFromLogin: async () => {
      mocks.events.push('redirect')
    },
    routerPushByKey: vi.fn()
  })
}))
vi.mock('@/service/api', () => ({
  fetchGetUserInfo: mocks.fetchGetUserInfo,
  fetchLogin: vi.fn(),
  logout: mocks.logout
}))
vi.mock('@/service/api/auth', () => ({ transformUser: mocks.transformUser }))
vi.mock('@/utils/storage', () => ({
  localStg: {
    get: (key: string) => mocks.storage.get(key),
    set: (key: string, value: unknown) => {
      mocks.storage.set(key, value)
      mocks.events.push(`set-${key}`)
    }
  }
}))
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('@/utils/common/tool', () => ({
  encryptDataByRsa: vi.fn(),
  generateRandomHexString: vi.fn()
}))
vi.mock('@/store/modules/route', () => ({
  useRouteStore: () => ({ hasAuthRoutes: true, isInitAuthRoute: true })
}))
vi.mock('@/store/modules/auth/shared', () => ({
  clearAuthStorage: () => {
    mocks.storage.clear()
    mocks.events.push('clear-auth-storage')
  },
  getToken: () => 'old-token',
  getUserInfo: () => ({ authority: 'SYS_ADMIN', id: 'old-user', userId: 'old-user', userName: 'old', roles: [] })
}))
vi.mock('@/utils/thingsvis', () => ({
  clearThingsVisToken: () => mocks.events.push('clear-thingsvis-token')
}))
vi.mock('@/router/auth-route-manager', () => ({
  initAuthRoute: mocks.initAuthRoute,
  resetAuthRoute: mocks.resetAuthRoute
}))

describe('auth session transition', () => {
  beforeEach(() => {
    mocks.events.length = 0
    mocks.storage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())

    mocks.transformUser.mockResolvedValue({
      data: { token: 'new-token', refreshToken: 'new-refresh-token', expires_in: 900 },
      error: null
    })
    mocks.fetchGetUserInfo.mockResolvedValue({
      data: {
        authority: 'TENANT_ADMIN',
        id: 'new-user',
        userId: 'new-user',
        userName: 'new',
        roles: []
      },
      error: null
    })
    mocks.resetAuthRoute.mockImplementation(async () => {
      mocks.events.push('reset-old-session')
    })
    mocks.initAuthRoute.mockImplementation(async () => {
      mocks.events.push('init-new-routes')
      return true
    })
  })

  it('removes the previous identity routes and tabs before storing and initializing the new identity', async () => {
    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.events.indexOf('reset-old-session')).toBeLessThan(mocks.events.indexOf('set-token'))
    expect(mocks.events.indexOf('set-token')).toBeLessThan(mocks.events.indexOf('init-new-routes'))
    expect(mocks.events.indexOf('init-new-routes')).toBeLessThan(mocks.events.indexOf('redirect'))
    expect(mocks.events.at(-1)).toBe('end-loading')
  })

  it('waits for local cleanup and succeeds when the remote logout fails', async () => {
    let finishLocalReset!: () => void
    mocks.logout.mockRejectedValueOnce(new Error('network unavailable'))
    mocks.resetAuthRoute.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          mocks.events.push('reset-old-session')
          finishLocalReset = resolve
        })
    )

    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    const pendingLogout = authStore.requestLogout()
    await vi.waitFor(() => expect(mocks.resetAuthRoute).toHaveBeenCalledOnce())

    let finished = false
    void pendingLogout.then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)

    finishLocalReset()
    await pendingLogout

    expect(mocks.events).toContain('clear-auth-storage')
    expect(authStore.token).toBe('')
    expect(authStore.userInfo.authority).toBe('')
  })

  it('clears a partially replaced identity when loading the new user fails', async () => {
    mocks.fetchGetUserInfo.mockRejectedValueOnce(new Error('user lookup failed'))

    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.resetAuthRoute).toHaveBeenCalledTimes(2)
    expect(mocks.events).toContain('clear-auth-storage')
    expect(authStore.token).toBe('')
    expect(mocks.events.at(-1)).toBe('end-loading')
  })

  it('keeps a fully loaded identity when only dynamic-route loading is temporarily unavailable', async () => {
    mocks.initAuthRoute.mockRejectedValueOnce(new Error('menu service unavailable'))

    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.resetAuthRoute).toHaveBeenCalledOnce()
    expect(mocks.events).not.toContain('clear-auth-storage')
    expect(authStore.token).toBe('new-token')
    expect(mocks.storage.get('token')).toBe('new-token')
    expect(mocks.events.at(-1)).toBe('end-loading')
  })
})
