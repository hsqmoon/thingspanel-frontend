import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('@/utils/storage', () => ({
  localStg: {
    get: mockGet
  }
}))

describe('thingsvis-auth', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGet.mockImplementation((key: string) => {
      if (key === 'token') return 'tp-token'
      if (key === 'userInfo') {
        return {
          userId: 'user-1',
          userName: 'tester',
          email: 'tester@example.com',
          tenantId: 'tenant-1'
        }
      }
      return null
    })
  })

  it('enters cooldown after a network failure and skips the next fetch attempt', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const { getThingsVisToken } = await import('@/utils/thingsvis/thingsvis-auth')

    await expect(getThingsVisToken()).rejects.toThrow(/ThingsVis SSO backend unavailable/)
    await expect(getThingsVisToken()).rejects.toThrow(/retry in/i)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('prevents an invalidated exchange and its finally handler from overwriting a new identity exchange', async () => {
    let token = 'old-platform-token'
    let userInfo = {
      userId: 'old-user',
      userName: 'old',
      email: 'old@example.com',
      tenantId: 'old-tenant'
    }
    mockGet.mockImplementation((key: string) => {
      if (key === 'token') return token
      if (key === 'userInfo') return userInfo
      return null
    })

    let resolveOld!: (response: Response) => void
    let resolveNew!: (response: Response) => void
    const oldResponse = new Promise<Response>(resolve => {
      resolveOld = resolve
    })
    const newResponse = new Promise<Response>(resolve => {
      resolveNew = resolve
    })
    const fetchMock = vi.fn().mockReturnValueOnce(oldResponse).mockReturnValueOnce(newResponse)
    vi.stubGlobal('fetch', fetchMock)

    const { getThingsVisToken } = await import('@/utils/thingsvis/thingsvis-auth')
    const oldExchange = getThingsVisToken()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    token = 'new-platform-token'
    userInfo = {
      userId: 'new-user',
      userName: 'new',
      email: 'new@example.com',
      tenantId: 'new-tenant'
    }
    const newExchange = getThingsVisToken()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    resolveOld(
      new Response(JSON.stringify({ accessToken: 'old-thingsvis-token', expiresIn: 3600 }), { status: 200 })
    )
    await expect(oldExchange).rejects.toThrow(/invalidated|identity changed/i)

    const joinedNewExchange = getThingsVisToken()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolveNew(
      new Response(JSON.stringify({ accessToken: 'new-thingsvis-token', expiresIn: 3600 }), { status: 200 })
    )

    await expect(newExchange).resolves.toBe('new-thingsvis-token')
    await expect(joinedNewExchange).resolves.toBe('new-thingsvis-token')
    await expect(getThingsVisToken()).resolves.toBe('new-thingsvis-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not clear a newer cached token when an older request reports 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'old-thingsvis-token', expiresIn: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'new-thingsvis-token', expiresIn: 3600 }), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { clearThingsVisToken, getThingsVisToken } = await import('@/utils/thingsvis/thingsvis-auth')
    await expect(getThingsVisToken()).resolves.toBe('old-thingsvis-token')
    expect(clearThingsVisToken()).toBe(true)
    await expect(getThingsVisToken()).resolves.toBe('new-thingsvis-token')

    expect(clearThingsVisToken('old-thingsvis-token')).toBe(false)
    await expect(getThingsVisToken()).resolves.toBe('new-thingsvis-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cancel an in-flight refresh when the expired token reports 401', async () => {
    let resolveRefresh!: (response: Response) => void
    const refreshResponse = new Promise<Response>(resolve => {
      resolveRefresh = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'expired-thingsvis-token', expiresIn: 3600 }), { status: 200 })
      )
      .mockReturnValueOnce(refreshResponse)
    vi.stubGlobal('fetch', fetchMock)

    const { clearThingsVisToken, getThingsVisToken, thingsvisAuthService } = await import(
      '@/utils/thingsvis/thingsvis-auth'
    )
    await expect(getThingsVisToken()).resolves.toBe('expired-thingsvis-token')
    ;(thingsvisAuthService as unknown as { tokenExpiry: number }).tokenExpiry = 0
    const refresh = getThingsVisToken()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(clearThingsVisToken('expired-thingsvis-token')).toBe(true)
    resolveRefresh(
      new Response(JSON.stringify({ accessToken: 'refreshed-thingsvis-token', expiresIn: 3600 }), { status: 200 })
    )

    await expect(refresh).resolves.toBe('refreshed-thingsvis-token')
    await expect(getThingsVisToken()).resolves.toBe('refreshed-thingsvis-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
