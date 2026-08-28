import { beforeEach, describe, expect, it, vi } from 'vitest'

const marketRefresh = vi.hoisted(() => vi.fn())

vi.mock('@/service/api/market', () => ({ marketRefresh }))

function tokenExpiringAt(exp: number) {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp })}.signature`
}

describe('resource-center authentication envelopes', () => {
  beforeEach(() => {
    vi.resetModules()
    marketRefresh.mockReset()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('stores a refreshed token from a successful flat response', async () => {
    localStorage.setItem('market_refresh_token', 'refresh-1')
    const token = tokenExpiringAt(Math.floor(Date.now() / 1000) + 3600)
    marketRefresh.mockResolvedValue({
      data: { token, refresh_token: 'refresh-2', expires_in: 3600 },
      error: null
    })

    const { useMarketAuth } = await import('./use-market-auth')
    const auth = useMarketAuth()

    await expect(auth.refreshAccessToken()).resolves.toBe(token)
    expect(auth.getToken()).toBe(token)
    expect(localStorage.getItem('market_refresh_token')).toBe('refresh-2')
  })

  it('clears the entire resource-center session on a 401 flat failure', async () => {
    localStorage.setItem('market_refresh_token', 'expired-refresh')
    marketRefresh.mockResolvedValue({
      data: null,
      error: { message: 'expired', status: 401, code: 'ERR_BAD_RESPONSE' }
    })

    const { useMarketAuth } = await import('./use-market-auth')
    const auth = useMarketAuth()

    await expect(auth.refreshAccessToken()).resolves.toBeNull()
    expect(auth.isLoggedIn()).toBe(false)
    expect(localStorage.getItem('market_token')).toBeNull()
    expect(localStorage.getItem('market_refresh_token')).toBeNull()
  })

  it('does not revive the removed sessionStorage token format', async () => {
    sessionStorage.setItem('market_token', tokenExpiringAt(Math.floor(Date.now() / 1000) + 3600))

    const { useMarketAuth } = await import('./use-market-auth')
    const auth = useMarketAuth()

    expect(auth.getToken()).toBeNull()
    expect(localStorage.getItem('market_token')).toBeNull()
  })
})
