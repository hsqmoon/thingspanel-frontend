import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestRequestConfig {
  method: string
  url: string
  headers: Record<string, string>
  skipTenantScope?: boolean
}

interface TestRequestError {
  response: { status: number; data: { code: number } }
  config: { headers: { get: (name: string) => string }; preserveSessionOn401?: boolean }
  code?: string
  message?: string
}

interface RequestHooks {
  onRequest: (config: TestRequestConfig) => Promise<TestRequestConfig>
  onError: (error: TestRequestError) => Promise<void>
  transformBackendResponse: (response: {
    config: { method: string; needMessage?: boolean }
    data: { data: unknown }
  }) => unknown
}

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>()

  return {
    values,
    remove: vi.fn((key: string) => values.delete(key)),
    options: [] as RequestHooks[]
  }
})

vi.mock('@sa/axios', () => ({
  BACKEND_ERROR_CODE: 'BACKEND_ERROR',
  createFlatRequest: vi.fn((_config: unknown, options: RequestHooks) => {
    mocks.options.push(options)
    return vi.fn()
  })
}))

vi.mock('@/utils/storage', () => ({
  localStg: {
    get: vi.fn((key: string) => mocks.values.get(key)),
    remove: mocks.remove
  }
}))

vi.mock('~/env.config', () => ({
  createProxyPattern: vi.fn(() => '/proxy'),
  createServiceConfig: vi.fn(() => ({ otherBaseURL: { demo: 'https://api.example.test' } }))
}))

describe('authenticated request lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    mocks.values.clear()
    mocks.remove.mockClear()
    window.$message = {
      destroyAll: vi.fn(),
      error: vi.fn()
    } as unknown as typeof window.$message

    await import('./request')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('omits tenant scope for the recovery tenant list and logout requests', async () => {
    mocks.values.set('token', 'token-a')
    mocks.values.set('userInfo', { authority: 'SYS_ADMIN' })
    mocks.values.set('tenantScopeId', 'tenant-a')

    const businessRequest = { method: 'get', url: '/device', headers: {} }
    const tenantListRequest = { method: 'get', url: '/user', headers: {}, skipTenantScope: true }
    const scopedUserListRequest = { method: 'get', url: '/user', headers: {} }
    const logoutRequest = { method: 'get', url: '/user/logout', headers: {} }

    await mocks.options[0]!.onRequest(businessRequest)
    await mocks.options[0]!.onRequest(tenantListRequest)
    await mocks.options[0]!.onRequest(scopedUserListRequest)
    await mocks.options[0]!.onRequest(logoutRequest)

    expect(businessRequest.headers).toMatchObject({ 'x-token': 'token-a', 'x-tenant-id': 'tenant-a' })
    expect(tenantListRequest.headers).toMatchObject({ 'x-token': 'token-a' })
    expect(tenantListRequest.headers).not.toHaveProperty('x-tenant-id')
    expect(tenantListRequest).not.toHaveProperty('skipTenantScope')
    expect(scopedUserListRequest.headers).toMatchObject({ 'x-tenant-id': 'tenant-a' })
    expect(logoutRequest.headers).not.toHaveProperty('x-tenant-id')
  })

  it('preserves an explicit token used to prepare a new identity', async () => {
    mocks.values.set('token', 'old-token')
    mocks.values.set('userInfo', { authority: 'SYS_ADMIN' })
    mocks.values.set('tenantScopeId', 'old-tenant')
    const request = { method: 'get', url: '/user/detail', headers: { 'x-token': 'new-token' } }

    await mocks.options[0]!.onRequest(request)

    expect(request.headers['x-token']).toBe('new-token')
    expect(request.headers).not.toHaveProperty('x-tenant-id')
  })

  it('does not clear messages after successful mutation responses', () => {
    const response = {
      config: { method: 'post' },
      data: { data: { id: 'created' } }
    }

    expect(mocks.options[0]!.transformBackendResponse(response)).toEqual({ id: 'created' })
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
  })

  it('clears the complete session only when the failed request used the current token', async () => {
    mocks.values.set('token', 'token-a')
    mocks.values.set('refreshToken', 'refresh-a')
    mocks.values.set('token_expires_in', '123')
    mocks.values.set('userInfo', { authority: 'SYS_ADMIN' })
    mocks.values.set('tenantScopeId', 'tenant-a')

    await mocks.options[0]!.onError({
      response: { status: 401, data: { code: 40102 } },
      config: { headers: { get: () => 'token-a' } }
    })

    expect(mocks.remove.mock.calls.map(([key]) => key)).toEqual([
      'token',
      'refreshToken',
      'userInfo',
      'token_expires_in',
      'tenantScopeId'
    ])
  })

  it('ignores a late 401 from an older token', async () => {
    mocks.values.set('token', 'token-b')

    await mocks.options[0]!.onError({
      response: { status: 401, data: { code: 40102 } },
      config: { headers: { get: () => 'token-a' } }
    })

    expect(mocks.remove).not.toHaveBeenCalled()
    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(mocks.values.get('token')).toBe('token-b')
  })

  it('leaves the current session intact when an owned identity-transform request returns 401', async () => {
    mocks.values.set('token', 'token-a')

    await mocks.options[0]!.onError({
      response: { status: 401, data: { code: 40102 } },
      config: { headers: { get: () => 'token-a' }, preserveSessionOn401: true }
    })

    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.values.get('token')).toBe('token-a')
  })

  it('does not destroy unrelated messages for non-authentication failures', async () => {
    await mocks.options[0]!.onError({
      response: { status: 404, data: { code: 404 } },
      config: { headers: { get: () => '' } },
      message: 'Not found'
    })

    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('请求的资源未找到 (404)。')
  })
})
