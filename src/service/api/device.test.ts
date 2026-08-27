import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn())

vi.mock('../request', () => ({
  request: {
    delete: vi.fn(),
    get: requestGet,
    post: vi.fn(),
    put: vi.fn()
  }
}))

import { deviceDiagnostics } from './device'

describe('device diagnostics API error ownership', () => {
  beforeEach(() => {
    requestGet.mockReset()
    requestGet.mockRejectedValue(new Error('diagnostics unavailable'))
  })

  it('lets the diagnosis component sequence and display its own errors', async () => {
    await expect(deviceDiagnostics('device-1')).rejects.toThrow('diagnostics unavailable')

    expect(requestGet).toHaveBeenCalledWith('/devices/device-1/diagnostics', { silentError: true })
  })
})
