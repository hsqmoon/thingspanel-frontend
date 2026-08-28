import { describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import createHookRequest from './use-request'

describe('createHookRequest', () => {
  it.each([0, false, ''])('stores the falsy success value %#', async value => {
    const request = createHookRequest({
      adapter: async config => ({ config, data: value, headers: {}, status: 200, statusText: 'OK' })
    })

    const state = request({ url: '/value' })

    await vi.waitFor(() => expect(state.loading.value).toBe(false))
    expect(state.data.value).toBe(value)
    expect(state.error.value).toBeNull()
  })

  it('stores the shared flat failure and always stops loading', async () => {
    const request = createHookRequest({
      adapter: async config => {
        throw new AxiosError('网络不可用', 'ERR_NETWORK', config)
      }
    })

    const state = request({ url: '/devices' })

    expect(state.loading.value).toBe(true)
    await vi.waitFor(() => expect(state.loading.value).toBe(false))
    expect(state.data.value).toBeNull()
    expect(state.error.value).toEqual({ message: '网络不可用', status: undefined, code: 'ERR_NETWORK' })
  })
})
