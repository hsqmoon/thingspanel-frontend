import { describe, expect, it, vi } from 'vitest'

const getThingsVisToken = vi.hoisted(() => vi.fn())

vi.mock('./thingsvis-auth', () => ({ getThingsVisToken }))

import { buildThingsVisUrl } from './url-builder'

describe('ThingsVis URL authentication', () => {
  it('fails closed without logging or falling back to a ThingsPanel token', async () => {
    getThingsVisToken.mockRejectedValue(new Error('SSO unavailable'))

    await expect(buildThingsVisUrl({ mode: 'viewer' })).rejects.toThrow('SSO unavailable')
  })
})
