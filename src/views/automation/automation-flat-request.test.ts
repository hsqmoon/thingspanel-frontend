import { createApp, defineComponent, h, nextTick, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const automationApi = vi.hoisted(() => ({
  deviceConfigAll: vi.fn(),
  deviceConfigMetricsMenu: vi.fn(),
  deviceListAll: vi.fn(),
  deviceMetricsMenu: vi.fn(),
  sceneActive: vi.fn(),
  sceneAdd: vi.fn(),
  sceneAutomationsDel: vi.fn(),
  sceneAutomationsGet: vi.fn(),
  sceneAutomationsInfo: vi.fn(),
  sceneAutomationsLog: vi.fn(),
  sceneAutomationsSwitch: vi.fn(),
  sceneDel: vi.fn(),
  sceneEdit: vi.fn(),
  sceneGet: vi.fn(),
  sceneInfo: vi.fn(),
  sceneLog: vi.fn()
}))
const deviceApi = vi.hoisted(() => ({
  deviceAlarmList: vi.fn(),
  deviceGroupTree: vi.fn()
}))
const alarmApi = vi.hoisted(() => ({ warningMessageList: vi.fn() }))
const dialog = vi.hoisted(() => ({ warning: vi.fn() }))
const message = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
const routeState = vi.hoisted(() => ({ path: '/automation/test', query: {} as Record<string, string> }))
const removeTab = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const routerPushByKey = vi.hoisted(() => vi.fn())

vi.mock('@/service/api/automation', () => automationApi)
vi.mock('@/service/api', () => deviceApi)
vi.mock('@/service/api/alarm', () => alarmApi)
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('@/hooks/common/router', () => ({ useRouterPush: () => ({ routerPushByKey }) }))
vi.mock('@/store/modules/tab', () => ({ useTabStore: () => ({ removeTab }) }))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router
}))
vi.mock('@/views/alarm/warning-message/components/pop-up.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/dev-card-item/index.vue', () => ({ default: { render: () => null } }))
vi.mock('naive-ui', async () => {
  const { defineComponent: define, h: render } = await import('vue')
  const passthrough = define({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => render('div', attrs, Object.values(slots).flatMap(slot => slot?.() || []))
    }
  })
  return {
    NButton: passthrough,
    NCard: passthrough,
    NFlex: passthrough,
    NGrid: passthrough,
    NGridItem: passthrough,
    NPagination: passthrough,
    NPopconfirm: passthrough,
    NSpace: passthrough,
    useDialog: () => dialog,
    useMessage: () => message
  }
})

import SceneEdit from '@/views/automation/scene-edit/index.vue'
import SceneLinkage from '@/views/automation/scene-linkage/modules/dataList.vue'
import SceneManage from '@/views/automation/scene-manage/index.vue'

const requestFailure = (messageText = 'service unavailable', status = 503) => ({
  data: null,
  error: { message: messageText, status, code: 'ERR_BAD_RESPONSE' }
})
const success = <T>(data: T) => ({ data, error: null })

const passthrough = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, Object.values(slots).flatMap(slot => slot?.() || []))
  }
})
const form = defineComponent({
  setup(_, { expose, slots }) {
    expose({ validate: vi.fn().mockResolvedValue(undefined) })
    return () => h('form', slots.default?.())
  }
})
const mountedApps: ReturnType<typeof createApp>[] = []

function mount(component: Component, props: Record<string, unknown> = {}) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(component, props)
  app.config.globalProperties.getPlatform = () => 'pc'
  app.component('NForm', form)
  ;[
    'NAvatar',
    'NDataTable',
    'NDatePicker',
    'NEllipsis',
    'NEmpty',
    'NFormItem',
    'NIcon',
    'NInput',
    'NInputNumber',
    'NModal',
    'NRadio',
    'NRadioGroup',
    'NSelect',
    'NSpace',
    'NSwitch',
    'NTable',
    'NTooltip'
  ].forEach(name => app.component(name, passthrough))
  const componentProxy = app.mount(root) as any
  mountedApps.push(app)
  return { root, vm: componentProxy.$.setupState as any }
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  document.body.innerHTML = ''
  Object.values(automationApi).forEach(mock => mock.mockReset())
  Object.values(deviceApi).forEach(mock => mock.mockReset())
  Object.values(alarmApi).forEach(mock => mock.mockReset())
  Object.values(dialog).forEach(mock => mock.mockReset())
  Object.values(message).forEach(mock => mock.mockReset())
  router.replace.mockReset()
  routerPushByKey.mockReset()
  removeTab.mockReset().mockResolvedValue(undefined)
  routeState.path = '/automation/test'
  routeState.query = {}
})

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

describe('automation FlatResponse failure handling', () => {
  it('keeps the current scene rows and does not report a failed delete as successful', async () => {
    automationApi.sceneGet.mockResolvedValueOnce(success({ list: [{ id: 'scene-1' }], total: 1 }))
    automationApi.sceneDel.mockResolvedValue(requestFailure('delete failed'))
    const { vm } = mount(SceneManage)
    await vi.waitFor(() => expect(vm.tableData).toEqual([{ id: 'scene-1' }]))

    automationApi.sceneGet.mockResolvedValueOnce(requestFailure())
    await vm.getData()
    expect(vm.tableData).toEqual([{ id: 'scene-1' }])
    expect(vm.dataTotal).toBe(1)

    await vm.deleteScene({ id: 'scene-1' })
    const confirmation = dialog.warning.mock.calls.at(-1)?.[0]
    await confirmation.onPositiveClick()

    expect(automationApi.sceneGet).toHaveBeenCalledTimes(2)
    expect(message.success).not.toHaveBeenCalled()
  })

  it('keeps linkage rows and skips refresh when switch and refresh requests fail', async () => {
    automationApi.sceneAutomationsGet.mockResolvedValueOnce(success({ list: [{ id: 'link-1' }], total: 1 }))
    automationApi.sceneAutomationsSwitch.mockResolvedValue(requestFailure('switch failed', 401))
    const { vm } = mount(SceneLinkage)
    await vi.waitFor(() => expect(vm.sceneLinkageList).toEqual([{ id: 'link-1' }]))

    automationApi.sceneAutomationsGet.mockResolvedValueOnce(requestFailure())
    await vm.getData()
    expect(vm.sceneLinkageList).toEqual([{ id: 'link-1' }])
    expect(vm.dataTotal).toBe(1)

    await vm.linkActivation({ id: 'link-1' })
    expect(automationApi.sceneAutomationsGet).toHaveBeenCalledTimes(2)
    expect(message.error).not.toHaveBeenCalled()
  })

  it('preserves selector state, releases loading, and does not navigate after a failed scene save', async () => {
    deviceApi.deviceGroupTree.mockResolvedValue(success([{ group: { id: 'group-1' } }]))
    automationApi.deviceListAll.mockResolvedValue(success([{ id: 'device-1' }]))
    automationApi.deviceConfigAll.mockResolvedValue(success([{ id: 'config-1' }]))
    alarmApi.warningMessageList.mockResolvedValue(success({ list: [{ id: 'alarm-1' }] }))
    automationApi.sceneGet.mockResolvedValueOnce(success({ list: [{ id: 'scene-1' }] }))
    automationApi.sceneAdd.mockResolvedValue(requestFailure('save failed', 401))
    const { vm } = mount(SceneEdit)
    await vi.waitFor(() => expect(vm.sceneList).toEqual([{ id: 'scene-1' }]))
    await vi.waitFor(() => expect(vm.loadingSelect).toBe(false))

    automationApi.sceneGet.mockResolvedValueOnce(requestFailure())
    await vm.getSceneList('next')
    expect(vm.sceneList).toEqual([{ id: 'scene-1' }])
    expect(vm.loadingSelect).toBe(false)

    await vm.submitData()
    const confirmation = dialog.warning.mock.calls.at(-1)?.[0]
    await confirmation.onPositiveClick()

    expect(removeTab).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    expect(message.error).not.toHaveBeenCalled()
  })

  it('leaves the edit form untouched when scene detail resolves as a real failure', async () => {
    routeState.query = { id: 'scene-1' }
    deviceApi.deviceGroupTree.mockResolvedValue(success([]))
    automationApi.deviceListAll.mockResolvedValue(success([]))
    automationApi.deviceConfigAll.mockResolvedValue(success([]))
    alarmApi.warningMessageList.mockResolvedValue(success({ list: [] }))
    automationApi.sceneGet.mockResolvedValue(success({ list: [] }))
    automationApi.sceneInfo.mockResolvedValue(requestFailure('detail failed'))

    const { vm } = mount(SceneEdit)
    await vi.waitFor(() => expect(automationApi.sceneInfo).toHaveBeenCalledOnce())
    await flushUI()

    expect(vm.configForm.name).toBe('')
    expect(vm.configForm.actions).toEqual([])
  })
})
