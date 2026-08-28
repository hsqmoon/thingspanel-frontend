import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  beforeEachGuard: undefined as ((to: any, from: any, next: any) => Promise<void>) | undefined,
  initAuthRoute: vi.fn(),
  resetStore: vi.fn(),
  token: 'new-token'
}))

vi.mock('@/store/modules/auth', () => ({
  useAuthStore: () => ({
    resetStore: mocks.resetStore,
    userInfo: { roles: ['SYS_ADMIN'] }
  })
}))
vi.mock('@/store/modules/route', () => ({
  useRouteStore: () => ({ isInitAuthRoute: false })
}))
vi.mock('@/utils/storage', () => ({
  localStg: { get: () => mocks.token }
}))
vi.mock('../auth-route-manager', () => ({
  getIsAuthRouteExist: vi.fn(),
  initAuthRoute: mocks.initAuthRoute
}))

import { createPermissionGuard } from './permission'

describe('permission guard route initialization', () => {
  beforeEach(() => {
    mocks.beforeEachGuard = undefined
    mocks.initAuthRoute.mockReset()
    mocks.resetStore.mockReset()
    mocks.token = 'new-token'
  })

  it('cancels only the stale navigation and keeps the newer authenticated session', async () => {
    mocks.initAuthRoute.mockResolvedValue('stale')
    const router = {
      beforeEach: vi.fn(guard => {
        mocks.beforeEachGuard = guard
      })
    }
    createPermissionGuard(router as any)
    const next = vi.fn()

    await mocks.beforeEachGuard!(
      { fullPath: '/device/manage', meta: { constant: false }, name: 'device_manage', path: '/device/manage' },
      { fullPath: '/', meta: {}, query: {} },
      next
    )

    expect(next).toHaveBeenCalledWith(false)
    expect(mocks.resetStore).not.toHaveBeenCalled()
  })
})
