import { createApp, defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  getSysVersion: vi.fn()
}))

vi.mock('axios', () => ({ default: { get: mocks.axiosGet } }))
vi.mock('@/service/api/system-data', () => ({ getSysVersion: mocks.getSysVersion }))

import useVersionInfo from './use-version-info'

function mountVersionInfo() {
  let versionInfo!: ReturnType<typeof useVersionInfo>
  const app = createApp(
    defineComponent({
      setup() {
        versionInfo = useVersionInfo()
        return () => h('div')
      }
    })
  )
  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)

  return { app, versionInfo }
}

describe('useVersionInfo cache', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.axiosGet.mockReset().mockResolvedValue({ data: [{ name: 'v1.2.10' }] })
    mocks.getSysVersion.mockReset()
  })

  it('does not cache the placeholder produced by a failed current-version request', async () => {
    mocks.getSysVersion
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
      .mockResolvedValueOnce({ data: { version: '1.2.10' }, error: null })

    const first = mountVersionInfo()
    await first.versionInfo.loadVersionInfo()
    expect(first.versionInfo.currentVersion.value).toBe('--')
    first.app.unmount()

    const second = mountVersionInfo()
    await second.versionInfo.loadVersionInfo()

    expect(mocks.getSysVersion).toHaveBeenCalledTimes(2)
    expect(second.versionInfo.currentVersion.value).toBe('1.2.10')
    expect(second.versionInfo.latestVersion.value).toBe('1.2.10')
    second.app.unmount()
  })
})
