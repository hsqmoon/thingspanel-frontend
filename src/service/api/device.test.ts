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

import { deviceDiagnostics, getDeviceDebugLogs } from './device'

describe('device diagnostics API error ownership', () => {
  const failure = {
    data: null,
    error: {
      message: 'diagnostics unavailable',
      status: 503,
      code: 'ERR_BAD_RESPONSE',
      data: { message: 'diagnostics unavailable' }
    }
  }

  beforeEach(() => {
    requestGet.mockReset()
    requestGet.mockResolvedValue(failure)
  })

  it('lets the diagnosis component sequence and display its own errors', async () => {
    await expect(deviceDiagnostics('device-1')).resolves.toEqual(failure)

    expect(requestGet).toHaveBeenCalledWith('/devices/device-1/diagnostics', { silentError: true })
  })

  it('lets the debug log poller render failures without global message storms', async () => {
    await expect(getDeviceDebugLogs('device-1', { limit: 100 })).resolves.toEqual(failure)

    expect(requestGet).toHaveBeenCalledWith('/device/device-1/debug/logs', {
      params: { limit: 100 },
      silentError: true
    })
  })
})
