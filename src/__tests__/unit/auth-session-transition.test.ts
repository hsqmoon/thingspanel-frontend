import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  storage: new Map<string, unknown>(),
  fetchLogin: vi.fn(),
  fetchGetUserInfo: vi.fn(),
  initAuthRoute: vi.fn(),
  logout: vi.fn(),
  resetAndInitAuthRoute: vi.fn(),
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
  fetchLogin: mocks.fetchLogin,
  logout: mocks.logout
}))
vi.mock('@/service/api/auth', () => ({ transformUser: mocks.transformUser }))
vi.mock('@/utils/storage', () => ({
  localStg: {
    get: (key: string) => mocks.storage.get(key),
    set: (key: string, value: unknown) => {
      mocks.storage.set(key, value)
      mocks.events.push(`set-${key}`)
    },
    remove: (key: string) => mocks.storage.delete(key)
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
  resetAndInitAuthRoute: mocks.resetAndInitAuthRoute,
  resetAuthRoute: mocks.resetAuthRoute
}))

describe('auth session transition', () => {
  beforeEach(() => {
    mocks.events.length = 0
    mocks.storage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.storage.set('token', 'old-token')
    mocks.storage.set('refreshToken', 'old-refresh-token')
    mocks.storage.set('token_expires_in', '9999999999999')
    mocks.storage.set('tenantScopeId', 'tenant-old')
    mocks.storage.set('userInfo', {
      authority: 'SYS_ADMIN',
      id: 'old-user',
      userId: 'old-user',
      userName: 'old',
      roles: ['SYS_ADMIN']
    })

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
    mocks.resetAndInitAuthRoute.mockImplementation(async () => {
      mocks.events.push('replace-routes')
      return 'success'
    })
    mocks.initAuthRoute.mockImplementation(async () => {
      mocks.events.push('init-new-routes')
      return 'success'
    })
    mocks.fetchLogin.mockResolvedValue({
      data: { token: 'login-token', refreshToken: 'login-refresh-token', expires_in: 900 },
      error: null
    })
  })

  it('commits the new identity only after its profile loads and atomically replaces routes', async () => {
    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.fetchGetUserInfo).toHaveBeenCalledWith('new-token')
    expect(mocks.events.indexOf('set-token')).toBeLessThan(mocks.events.indexOf('replace-routes'))
    expect(mocks.events.indexOf('replace-routes')).toBeLessThan(mocks.events.indexOf('redirect'))
    expect(mocks.resetAuthRoute).not.toHaveBeenCalled()
    expect(mocks.events.at(-1)).toBe('end-loading')
  })

  it('does not persist a login token when loading its profile fails', async () => {
    mocks.fetchGetUserInfo.mockResolvedValueOnce({
      data: null,
      error: { message: 'profile unavailable', status: 503 }
    })
    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.login('user@example.com', 'secret')

    expect(mocks.fetchGetUserInfo).toHaveBeenCalledWith('login-token')
    expect(mocks.storage.get('token')).toBeUndefined()
    expect(authStore.token).toBe('')
    expect(mocks.initAuthRoute).not.toHaveBeenCalled()
  })

  it('clears a committed login when menu initialization throws', async () => {
    mocks.initAuthRoute.mockRejectedValueOnce(new Error('menu unavailable'))
    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.login('user@example.com', 'secret')

    expect(mocks.events).toContain('set-token')
    expect(mocks.events).toContain('clear-auth-storage')
    expect(mocks.storage.get('token')).toBeUndefined()
    expect(authStore.token).toBe('')
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

  it('preserves the current SYS_ADMIN session when transform fails', async () => {
    mocks.transformUser.mockResolvedValueOnce({
      data: null,
      error: { message: 'transform unavailable', status: 503 }
    })

    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.resetAuthRoute).not.toHaveBeenCalled()
    expect(mocks.resetAndInitAuthRoute).not.toHaveBeenCalled()
    expect(mocks.events).not.toContain('clear-auth-storage')
    expect(authStore.token).toBe('old-token')
    expect(authStore.userInfo.authority).toBe('SYS_ADMIN')
    expect(mocks.events.at(-1)).toBe('end-loading')
  })

  it('preserves the current identity when loading the transformed user fails', async () => {
    mocks.fetchGetUserInfo.mockResolvedValueOnce({
      data: null,
      error: { message: 'user lookup failed', status: 503 }
    })

    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.resetAndInitAuthRoute).not.toHaveBeenCalled()
    expect(mocks.events).not.toContain('clear-auth-storage')
    expect(authStore.token).toBe('old-token')
    expect(mocks.storage.get('token')).toBe('old-token')
    expect(mocks.events.at(-1)).toBe('end-loading')
  })

  it('rolls back token, user and routes when the new identity menu fails', async () => {
    mocks.resetAndInitAuthRoute
      .mockRejectedValueOnce(new Error('menu service unavailable'))
      .mockResolvedValueOnce('success')

    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    await authStore.enter('new-user')

    expect(mocks.resetAndInitAuthRoute).toHaveBeenCalledTimes(2)
    expect(mocks.events).not.toContain('clear-auth-storage')
    expect(authStore.token).toBe('old-token')
    expect(authStore.userInfo.authority).toBe('SYS_ADMIN')
    expect(mocks.storage.get('tenantScopeId')).toBe('tenant-old')
    expect(mocks.events).not.toContain('redirect')
    expect(mocks.events.at(-1)).toBe('end-loading')
  })

  it('allows only one A/B identity switch at a time', async () => {
    let resolveTransform!: (value: unknown) => void
    mocks.transformUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveTransform = resolve
        })
    )
    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()

    const switchA = authStore.enter('user-a')
    await vi.waitFor(() => expect(mocks.transformUser).toHaveBeenCalledOnce())
    await expect(authStore.enter('user-b')).resolves.toBe(false)
    expect(authStore.switchingUserId).toBe('user-a')

    resolveTransform({
      data: { token: 'new-token', refreshToken: 'new-refresh-token', expires_in: 900 },
      error: null
    })
    await expect(switchA).resolves.toBe(true)

    expect(mocks.transformUser).toHaveBeenCalledOnce()
    expect(authStore.switchingUserId).toBeNull()
  })

  it('ignores a late successful transform after the current session was reset', async () => {
    let resolveTransform!: (value: unknown) => void
    mocks.transformUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveTransform = resolve
        })
    )
    const { useAuthStore } = await import('@/store/modules/auth')
    const authStore = useAuthStore()
    const pendingSwitch = authStore.enter('new-user')
    await vi.waitFor(() => expect(mocks.transformUser).toHaveBeenCalledOnce())

    await authStore.resetStore(false)
    resolveTransform({
      data: { token: 'late-token', refreshToken: 'late-refresh', expires_in: 900 },
      error: null
    })
    await expect(pendingSwitch).resolves.toBe(false)

    expect(mocks.fetchGetUserInfo).not.toHaveBeenCalled()
    expect(authStore.token).toBe('')
    expect(mocks.storage.get('token')).toBeUndefined()
  })
})
