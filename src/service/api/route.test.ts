import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn())

vi.mock('../request', () => ({ request: { get: requestGet } }))

import { fetchUIElementList } from './route'

describe('route API failures', () => {
  beforeEach(() => {
    requestGet.mockReset()
  })

  it('preserves a UI-element list failure instead of turning it into an empty permission tree', async () => {
    const failure = { data: null, error: { message: 'Unavailable', status: 503 } }
    requestGet.mockResolvedValue(failure)

    await expect(fetchUIElementList()).resolves.toBe(failure)
    expect(requestGet).toHaveBeenCalledWith('/ui_elements/select/form')
  })
})
