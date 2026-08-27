import { describe, expect, it } from 'vitest'
import { createViteProxy } from '../../../build/config/proxy'

const createEnv = (overrides: Partial<Env.ImportMeta> = {}) =>
  ({
    VITE_HTTP_PROXY: 'Y',
    VITE_SERVICE_ENV: 'dev',
    ...overrides
  }) as Env.ImportMeta

describe('ThingsVis development proxy', () => {
  it('rejects an invalid ThingsVis API URL instead of starting with a broken proxy', () => {
    expect(() => createViteProxy(createEnv({ VITE_THINGSVIS_API_URL: 'not-a-url' }))).toThrow(
      'VITE_THINGSVIS_API_URL must be a valid absolute HTTP(S) URL'
    )
  })

  it('validates ThingsVis URLs even when the development proxy is disabled', () => {
    expect(() =>
      createViteProxy(createEnv({ VITE_HTTP_PROXY: 'N', VITE_THINGSVIS_API_URL: 'not-a-url' }))
    ).toThrow('VITE_THINGSVIS_API_URL must be a valid absolute HTTP(S) URL')
  })

  it('accepts production same-origin ThingsVis paths when the development proxy is disabled', () => {
    expect(() =>
      createViteProxy(
        createEnv({
          VITE_HTTP_PROXY: 'N',
          VITE_THINGSVIS_API_URL: '/thingsvis-api',
          VITE_THINGSVIS_STUDIO_URL: '/main/'
        })
      )
    ).not.toThrow()
  })

  it('rejects an invalid ThingsVis Studio URL instead of silently using localhost', () => {
    expect(() => createViteProxy(createEnv({ VITE_THINGSVIS_STUDIO_URL: 'not-a-url' }))).toThrow(
      'VITE_THINGSVIS_STUDIO_URL must be a valid absolute HTTP(S) URL'
    )
  })

  it('rejects a non-HTTP ThingsVis URL', () => {
    expect(() => createViteProxy(createEnv({ VITE_THINGSVIS_STUDIO_URL: 'file:///tmp/studio' }))).toThrow(
      'VITE_THINGSVIS_STUDIO_URL must use HTTP or HTTPS'
    )
  })

  it('uses the configured Studio origin for valid URLs', () => {
    const proxy = createViteProxy(
      createEnv({ VITE_THINGSVIS_STUDIO_URL: 'https://studio.example.test/main?embedded=true' })
    )

    expect(Array.isArray(proxy)).toBe(false)
    expect((proxy as Record<string, { target?: string }>)['/thingsvis']?.target).toBe('https://studio.example.test')
  })
})
