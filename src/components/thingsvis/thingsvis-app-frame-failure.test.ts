import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deviceApi = vi.hoisted(() => ({
  attributeDataPub: vi.fn(),
  commandDataPub: vi.fn(),
  deviceAlarmStatus: vi.fn(),
  deviceDictProtocolServiceFirstLevel: vi.fn(),
  deviceGroupTree: vi.fn(),
  deviceList: vi.fn(),
  deviceListByGroup: vi.fn(),
  getAttributeDataSet: vi.fn(),
  getDeviceConfigList: vi.fn(),
  telemetryDataCurrent: vi.fn(),
  telemetryDataPub: vi.fn()
}))
const modelApi = vi.hoisted(() => ({
  attributesApi: vi.fn(),
  commandsApi: vi.fn(),
  eventsApi: vi.fn(),
  telemetryApi: vi.fn()
}))
const thingsVisApi = vi.hoisted(() => ({
  getThingsVisDashboard: vi.fn(),
  publishThingsVisDashboard: vi.fn(),
  updateThingsVisDashboard: vi.fn()
}))
const thingsVisUtils = vi.hoisted(() => ({
  clearThingsVisToken: vi.fn(),
  getThingsVisToken: vi.fn().mockResolvedValue('thingsvis-token')
}))

vi.mock('@/service/api/device', () => deviceApi)
vi.mock('@/service/api', () => modelApi)
vi.mock('@/service/api/system-data', () => ({ getTemplat: vi.fn() }))
vi.mock('@/service/api/thingsvis', () => thingsVisApi)
vi.mock('@/config/runtime-features', () => ({ isThingsVisEnabled: () => true }))
vi.mock('@/utils/thingsvis', () => thingsVisUtils)
vi.mock('@/utils/thingsvis/constants', () => ({
  getPlatformApiBase: () => 'https://iot.example.test/api/v1',
  getThingsVisApiBase: () => 'https://iot.example.test/thingsvis/api'
}))
vi.mock('@/utils/storage', () => ({ localStg: { get: vi.fn() } }))
vi.mock('@/utils/common/tool', () => ({ getWebsocketServerUrl: () => 'wss://iot.example.test/api/v1' }))
vi.mock('@/utils/thingsvis/share-url', () => ({ resolveHostPreviewUrl: () => 'https://iot.example.test/tv-preview' }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: () => ({ href: '/tv-preview?id=dashboard-1' }) })
}))

import ThingsVisAppFrame from './ThingsVisAppFrame.vue'

const requestFailure = {
  data: null,
  error: {
    message: 'platform unavailable',
    status: 503,
    code: 'ERR_BAD_RESPONSE'
  }
}
const mountedApps: ReturnType<typeof createApp>[] = []

const StubComponent = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})

function mountFrame(props: Record<string, unknown> = {}) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(ThingsVisAppFrame, {
    id: 'dashboard-1',
    mode: 'editor',
    ...props
  })
  app.component('NResult', StubComponent)
  app.mount(root)
  mountedApps.push(app)
  return { app, root }
}

async function getFrameWindow(root: HTMLElement) {
  await vi.waitFor(() => expect(root.innerHTML).toContain('<iframe'))
  await nextTick()
  const frameWindow = root.querySelector('iframe')!.contentWindow!
  const postMessage = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => {})
  return { frameWindow, postMessage }
}

function dispatchThingsVisMessage(data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: 'http://localhost:3000',
      data
    })
  )
}

describe('ThingsVisAppFrame request failures', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.values(deviceApi).forEach(mock => mock.mockReset())
    Object.values(modelApi).forEach(mock => mock.mockReset())
    Object.values(thingsVisApi).forEach(mock => mock.mockReset())
    thingsVisUtils.clearThingsVisToken.mockReset()
    thingsVisUtils.getThingsVisToken.mockReset().mockResolvedValue('thingsvis-token')
    window.$message = { error: vi.fn() } as unknown as typeof window.$message
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(app => app.unmount())
    document.body.innerHTML = ''
  })

  it('does not cache a failed group request and returns an explicit error before retrying', async () => {
    deviceApi.deviceGroupTree.mockResolvedValueOnce(requestFailure).mockResolvedValueOnce({ data: [], error: null })
    const { root } = mountFrame()
    const { postMessage } = await getFrameWindow(root)

    dispatchThingsVisMessage({ type: 'thingsvis:requestDeviceGroups', payload: {} })
    await vi.waitFor(() => expect(deviceApi.deviceGroupTree).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(postMessage.mock.calls.some(call => (call[0] as any)?.payload?.error === 'platform unavailable')).toBe(true)
    )

    dispatchThingsVisMessage({ type: 'thingsvis:requestDeviceGroups', payload: {} })
    await vi.waitFor(() => expect(deviceApi.deviceGroupTree).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.some(
          call =>
            (call[0] as any)?.type === 'tv:device-groups' &&
            Array.isArray((call[0] as any)?.payload?.groups) &&
            (call[0] as any).payload.groups[0]?.groupId === '__all__'
        )
      ).toBe(true)
    )
  })

  it('reports a resolved control failure without success or echo', async () => {
    deviceApi.telemetryDataPub.mockResolvedValue(requestFailure)
    const { root } = mountFrame()
    const { postMessage } = await getFrameWindow(root)

    dispatchThingsVisMessage({
      type: 'tv:platform-write',
      requestId: 'write-1',
      payload: { deviceId: 'device-1', data: { power: true } }
    })

    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.some(call => {
          const response = call[0] as any
          return (
            response?.type === 'tv:platform-write-result' &&
            response.requestId === 'write-1' &&
            response.success === false &&
            response.error === 'platform unavailable' &&
            !('echo' in response)
          )
        })
      ).toBe(true)
    )
  })

  it('returns a device lookup error envelope without an unhandled derived rejection', async () => {
    deviceApi.deviceGroupTree.mockResolvedValue({ data: [], error: null })
    deviceApi.deviceList.mockResolvedValue(requestFailure)
    const { root } = mountFrame()
    const { postMessage } = await getFrameWindow(root)

    dispatchThingsVisMessage({
      type: 'thingsvis:requestDeviceById',
      payload: { reqId: 'device-lookup-1', deviceId: 'device-1' }
    })

    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.some(call => {
          const response = call[0] as any
          return (
            response?.type === 'tv:device-by-id' &&
            response.payload?.reqId === 'device-lookup-1' &&
            response.payload?.success === false &&
            response.payload?.error === 'platform unavailable' &&
            response.payload?.device === undefined
          )
        })
      ).toBe(true)
    )
  })

  it('does not emit save success when the dashboard update fails', async () => {
    thingsVisApi.updateThingsVisDashboard.mockResolvedValue({
      data: null,
      error: { message: 'dashboard unavailable', status: 503 }
    })
    const hostSaveSuccess = vi.fn()
    const { root } = mountFrame({ onHostSaveSuccess: hostSaveSuccess })
    await getFrameWindow(root)

    dispatchThingsVisMessage({
      type: 'tv:save',
      payload: { config: { meta: { name: 'Dashboard' }, nodes: [], dataSources: [] } }
    })

    await vi.waitFor(() => expect(thingsVisApi.updateThingsVisDashboard).toHaveBeenCalledOnce())
    expect(hostSaveSuccess).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('保存失败: dashboard unavailable')
  })

  it('never retries a dashboard write after a 401 under a potentially new identity', async () => {
    thingsVisApi.updateThingsVisDashboard.mockResolvedValue({
      data: null,
      error: { message: 'expired identity', status: 401 }
    })
    const hostSaveSuccess = vi.fn()
    const { root } = mountFrame({ onHostSaveSuccess: hostSaveSuccess })
    await getFrameWindow(root)

    dispatchThingsVisMessage({
      type: 'tv:save',
      payload: { config: { meta: { name: 'Dashboard' }, nodes: [], dataSources: [] } }
    })

    await vi.waitFor(() => expect(thingsVisApi.updateThingsVisDashboard).toHaveBeenCalledOnce())
    expect(hostSaveSuccess).not.toHaveBeenCalled()
    expect(thingsVisUtils.clearThingsVisToken).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('保存失败: expired identity')
  })
})
