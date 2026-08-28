import { createApp } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const deviceApi = vi.hoisted(() => ({
  checkDevice: vi.fn(),
  devicCeonnectForm: vi.fn(),
  deviceDictProtocolServiceFirstLevel: vi.fn(),
  deviceDictProtocolServiceSecondLevel: vi.fn(),
  deviceGroupTree: vi.fn(),
  deviceList: vi.fn(),
  getDeviceConfigList: vi.fn(),
  putDeviceActive: vi.fn()
}))
const deviceStatus = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/device/manage',
    query: {
      service_identifier: 'service-one',
      service_access_id: 'access-one'
    }
  }),
  useRouter: () => ({ push: vi.fn() })
}))
vi.mock('@/service/api/device', () => deviceApi)
vi.mock('@/service/api/auth', () => ({ fetchUserList: vi.fn() }))
vi.mock('@/store/modules/auth', () => ({
  useAuthStore: () => ({ userInfo: { authority: 'TENANT_ADMIN' } })
}))
vi.mock('@/utils/usePageCache', () => ({
  usePageCache: () => ({ cache: {}, setCache: vi.fn() })
}))
vi.mock('@/utils/deviceStatusWebSocket', () => ({
  useDeviceStatusWebSocket: () => deviceStatus
}))
vi.mock('@/utils/storage', () => ({ localStg: { get: () => 'zh-CN' } }))
vi.mock('@/hooks/common/router', () => ({ useRouterPush: () => ({ routerPushByKey: vi.fn() }) }))
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('@/utils/common/tool', () => ({ getDemoServerUrl: () => 'https://example.test/api/v1' }))
vi.mock('@/components/list-page/index.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/dev-card-item/index.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/data-table-page/modules/tencent-map.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/device/manage/modules/add-devices-step1.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/device/manage/modules/add-devices-step2.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/device/manage/modules/add-devices-step3.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/device/manage/modules/add-devices-server1.vue', () => ({ default: { render: () => null } }))

import DataTablePage from '@/components/data-table-page/index.vue'
import DeviceManage from './index.vue'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

const mountedApps: ReturnType<typeof createApp>[] = []

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
})

describe('device manage service deep link', () => {
  it('keeps both service identifiers in the first query while search options are still loading', async () => {
    const firstLevel = deferred<any>()
    deviceApi.deviceDictProtocolServiceFirstLevel.mockReturnValueOnce(firstLevel.promise)
    deviceApi.deviceDictProtocolServiceSecondLevel.mockResolvedValue({
      data: { list: [{ id: 'access-one', name: 'Access One' }], total: 1 },
      error: null
    })
    deviceApi.deviceGroupTree.mockResolvedValue({ data: [], error: null })
    deviceApi.getDeviceConfigList.mockResolvedValue({ data: { list: [], total: 0 }, error: null })
    deviceApi.deviceList.mockResolvedValue({ data: { list: [], total: 0 }, error: null })

    const app = createApp(DeviceManage)
    app.component('DataTablePage', DataTablePage)
    const emptyComponent = { render: () => null }
    ;['NDrawer', 'NDrawerContent', 'NSteps', 'NStep', 'NCard', 'NH4', 'NLi', 'NText'].forEach(name => {
      app.component(name, emptyComponent)
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    app.mount(root)
    mountedApps.push(app)

    await vi.waitFor(() => expect(deviceApi.deviceList).toHaveBeenCalledOnce())
    expect(deviceApi.deviceList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        service_identifier: 'service-one',
        service_access_id: 'access-one'
      })
    )

    firstLevel.resolve({
      data: {
        protocol: [],
        service: [
          {
            name: 'Service One',
            service_identifier: 'service-one',
            service_plugin_id: 'plugin-one'
          }
        ]
      },
      error: null
    })

    await vi.waitFor(() => expect(deviceApi.deviceDictProtocolServiceSecondLevel).toHaveBeenCalledOnce())
    expect(deviceApi.deviceList).toHaveBeenCalledOnce()
    expect(
      deviceApi.deviceList.mock.calls.every(
        ([params]) => params.service_identifier === 'service-one' && params.service_access_id === 'access-one'
      )
    ).toBe(true)
  })
})
