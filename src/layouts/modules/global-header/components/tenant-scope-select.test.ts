import { createApp } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchUserList: vi.fn(),
  remove: vi.fn(),
  set: vi.fn()
}))

vi.mock('@/service/api/auth', () => ({ fetchUserList: mocks.fetchUserList }))
vi.mock('@/store/modules/auth', () => ({
  useAuthStore: () => ({ userInfo: { authority: 'SYS_ADMIN' } })
}))
vi.mock('@/utils/storage', () => ({
  localStg: {
    get: () => 'tenant-1',
    remove: mocks.remove,
    set: mocks.set
  }
}))

import TenantScopeSelect from './tenant-scope-select.vue'

const mountedApps: ReturnType<typeof createApp>[] = []

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
  delete window.$message
  vi.clearAllMocks()
})

describe('TenantScopeSelect', () => {
  it.each([
    { data: null, error: { message: 'Unavailable', status: 503 } },
    { data: null, error: null }
  ])('keeps the current tenant scope when the tenant list is not authoritative', async response => {
    const showError = vi.fn()
    window.$message = { error: showError } as any
    mocks.fetchUserList.mockResolvedValue(response)

    const app = createApp(TenantScopeSelect)
    const root = document.createElement('div')
    document.body.appendChild(root)
    app.mount(root)
    mountedApps.push(app)

    await vi.waitFor(() => expect(showError).toHaveBeenCalledOnce())
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
