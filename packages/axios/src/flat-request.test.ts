import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFlatRequest, isFlatRequestFailure } from './index'

describe('flat requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('awaits asynchronous response transforms before resolving', async () => {
    const request = createFlatRequest({
      adapter: async config => ({ config, data: 0, headers: {}, status: 200, statusText: 'OK' })
    })

    await expect(request.get<number>('/zero')).resolves.toEqual({ data: 0, error: null })
  })

  it('does not flatten response transform programming errors', async () => {
    const transformError = new TypeError('broken response transform')
    const request = createFlatRequest(
      {
        adapter: async config => ({ config, data: { value: 1 }, headers: {}, status: 200, statusText: 'OK' })
      },
      {
        transformBackendResponse() {
          throw transformError
        }
      }
    )

    await expect(request.get('/devices')).rejects.toBe(transformError)
  })

  it('does not flatten unrecognized request pipeline exceptions', async () => {
    const programmingError = { message: 'adapter programming error', code: 'ERR_NETWORK' }
    const cancel = vi.fn()
    const source = axios.CancelToken.source()
    vi.spyOn(axios.CancelToken, 'source').mockReturnValue({ ...source, cancel })
    const request = createFlatRequest({
      adapter: async () => {
        throw programmingError
      }
    })

    await expect(request.get('/devices')).rejects.toBe(programmingError)
    request.cancelAllRequest()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('recognizes only the simplified rejection contract', () => {
    expect(
      isFlatRequestFailure({
        data: null,
        error: { message: '请求失败', status: 503, code: 'E_DOWN', data: { retryable: true } }
      })
    ).toBe(true)
    expect(isFlatRequestFailure({ data: null, error: { message: '请求失败' } })).toBe(true)
    expect(isFlatRequestFailure({ message: 'Axios error' })).toBe(false)
    expect(isFlatRequestFailure({ data: null, error: { message: '请求失败', status: '503' } })).toBe(false)
    expect(isFlatRequestFailure({ data: null, error: null })).toBe(false)
  })

  it('resolves backend failures with the flat failure contract', async () => {
    const request = createFlatRequest({
      adapter: async (config: InternalAxiosRequestConfig) => {
        throw new axios.AxiosError(
          'transport message',
          'ERR_BAD_RESPONSE',
          config,
          undefined,
          {
            config,
            data: { message: '设备不存在', deviceId: 'missing' },
            headers: {},
            status: 404,
            statusText: 'Not Found'
          }
        )
      }
    })

    await expect(request.get('/devices/missing')).resolves.toEqual({
      data: null,
      error: {
        message: '设备不存在',
        status: 404,
        code: 'ERR_BAD_RESPONSE',
        data: { message: '设备不存在', deviceId: 'missing' }
      }
    })
  })

  it('resolves normalized transport failures with the same contract', async () => {
    const request = createFlatRequest({
      adapter: async config => {
        throw new axios.AxiosError('网络不可用', 'ERR_NETWORK', config)
      }
    })

    await expect(request.get('/devices')).resolves.toEqual({
      data: null,
      error: {
        message: '网络不可用',
        status: undefined,
        code: 'ERR_NETWORK'
      }
    })
  })

  it('removes settled requests from the cancellation registry', async () => {
    const cancel = vi.fn()
    const source = axios.CancelToken.source()
    vi.spyOn(axios.CancelToken, 'source').mockReturnValue({ ...source, cancel })
    const request = createFlatRequest({
      adapter: async config => ({ config, data: { ok: true }, headers: {}, status: 200, statusText: 'OK' })
    })

    await request.get('/devices')
    request.cancelAllRequest()

    expect(cancel).not.toHaveBeenCalled()
  })

  it('removes failed requests from the cancellation registry', async () => {
    const cancel = vi.fn()
    const source = axios.CancelToken.source()
    vi.spyOn(axios.CancelToken, 'source').mockReturnValue({ ...source, cancel })
    const request = createFlatRequest({
      adapter: async config => {
        throw new axios.AxiosError('Offline', 'ERR_NETWORK', config)
      }
    })

    await expect(request.get('/devices')).resolves.toMatchObject({
      data: null,
      error: { message: 'Offline', code: 'ERR_NETWORK' }
    })
    request.cancelAllRequest()

    expect(cancel).not.toHaveBeenCalled()
  })

  it('removes every failed transport attempt before retrying', async () => {
    const cancel = vi.fn()
    const source = axios.CancelToken.source()
    vi.spyOn(axios.CancelToken, 'source').mockReturnValue({ ...source, cancel })
    let attempts = 0
    const config = {
      retries: 2,
      adapter: async (config: InternalAxiosRequestConfig) => {
        attempts += 1
        if (attempts < 3) {
          throw new axios.AxiosError('Offline', 'ERR_NETWORK', config)
        }
        return { config, data: { ok: true }, headers: {}, status: 200, statusText: 'OK' }
      }
    }
    const request = createFlatRequest(config)

    await expect(request.get('/devices')).resolves.toEqual({ data: { ok: true }, error: null })
    request.cancelAllRequest()

    expect(attempts).toBe(3)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('removes requests when the request hook fails before dispatch', async () => {
    const cancel = vi.fn()
    const source = axios.CancelToken.source()
    vi.spyOn(axios.CancelToken, 'source').mockReturnValue({ ...source, cancel })
    const hookError = new TypeError('request hook failed')
    const request = createFlatRequest(undefined, {
      onRequest() {
        throw hookError
      }
    })

    await expect(request.get('/devices')).rejects.toBe(hookError)
    request.cancelAllRequest()

    expect(cancel).not.toHaveBeenCalled()
  })
})
