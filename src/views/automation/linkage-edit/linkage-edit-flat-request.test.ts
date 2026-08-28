import { createApp, defineComponent, h, nextTick, ref, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const automationApi = vi.hoisted(() => ({
  configMetricsConditionMenu: vi.fn(),
  deviceConfigAll: vi.fn(),
  deviceConfigMetricsMenu: vi.fn(),
  deviceListAll: vi.fn(),
  deviceMetricsConditionMenu: vi.fn(),
  deviceMetricsMenu: vi.fn(),
  sceneAutomationsAdd: vi.fn(),
  sceneAutomationsEdit: vi.fn(),
  sceneAutomationsInfo: vi.fn(),
  sceneGet: vi.fn()
}))
const deviceApi = vi.hoisted(() => ({ deviceGroupTree: vi.fn() }))
const alarmApi = vi.hoisted(() => ({ warningMessageList: vi.fn() }))
const dialog = vi.hoisted(() => ({ warning: vi.fn() }))
const message = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
const routeState = vi.hoisted(() => ({ path: '/automation/linkage-edit', query: {} as Record<string, string> }))
const removeTab = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/service/api/automation', () => automationApi)
vi.mock('@/service/api', () => deviceApi)
vi.mock('@/service/api/alarm', () => alarmApi)
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('@/store/modules/tab', () => ({ useTabStore: () => ({ removeTab }) }))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => router
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: ref('zh-CN') }) }))
vi.mock('@/views/alarm/warning-message/components/pop-up.vue', () => ({ default: { render: () => null } }))
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
    useDialog: () => dialog,
    useMessage: () => message
  }
})

import LinkageEdit from '@/views/automation/linkage-edit/index.vue'
import EditAction from '@/views/automation/linkage-edit/modules/edit-action.vue'
import EditPremise from '@/views/automation/linkage-edit/modules/edit-premise.vue'

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
  app.component('NForm', form)
  ;[
    'NCascader',
    'NCheckbox',
    'NCheckboxGroup',
    'NDatePicker',
    'NDivider',
    'NFormItem',
    'NIcon',
    'NInput',
    'NInputNumber',
    'NRadio',
    'NRadioGroup',
    'NSelect',
    'NSpace',
    'NSwitch',
    'NTag',
    'NTimePicker',
    'NTooltip'
  ].forEach(name => app.component(name, passthrough))
  const componentProxy = app.mount(root) as any
  mountedApps.push(app)
  return componentProxy.$.setupState as any
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
  removeTab.mockReset().mockResolvedValue(undefined)
  routeState.path = '/automation/linkage-edit'
  routeState.query = {}
  window.$message = message as any

  deviceApi.deviceGroupTree.mockResolvedValue(success([{ group: { id: 'group-1' } }]))
  automationApi.deviceListAll.mockResolvedValue(success([{ id: 'device-1' }]))
  automationApi.deviceConfigAll.mockResolvedValue(success([{ id: 'config-1' }]))
  automationApi.deviceMetricsMenu.mockResolvedValue(success([]))
  automationApi.deviceConfigMetricsMenu.mockResolvedValue(success([]))
  automationApi.deviceMetricsConditionMenu.mockResolvedValue(success([]))
  automationApi.configMetricsConditionMenu.mockResolvedValue(success([]))
  automationApi.sceneGet.mockResolvedValue(success({ list: [{ id: 'scene-1' }] }))
  alarmApi.warningMessageList.mockResolvedValue(success({ list: [{ id: 'alarm-1' }] }))
})

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

describe('linkage editor FlatResponse failure handling', () => {
  it('does not close the tab or navigate when linkage creation fails', async () => {
    automationApi.sceneAutomationsAdd.mockResolvedValue(requestFailure('save failed', 401))
    const vm = mount(LinkageEdit)
    await vi.waitFor(() => expect(deviceApi.deviceGroupTree).toHaveBeenCalledTimes(2))

    await vm.submitData()
    const confirmation = dialog.warning.mock.calls.at(-1)?.[0]
    await confirmation.onPositiveClick()

    expect(removeTab).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    expect(message.error).not.toHaveBeenCalled()
  })

  it.each(['{legacy-invalid-json', '{"fault":true}'])(
    'blocks editing and saving when an event trigger is not in the current schema: %s',
    async triggerValue => {
      routeState.query = { id: 'link-1' }
      automationApi.sceneAutomationsInfo.mockResolvedValue(
        success({
          id: 'link-1',
          name: 'Damaged linkage',
          description: '',
          enabled: 'Y',
          trigger_condition_groups: [
            [
              {
                trigger_conditions_type: '10',
                trigger_param_type: 'event',
                trigger_param: 'fault',
                trigger_value: triggerValue
              }
            ]
          ],
          actions: []
        })
      )
      const vm = mount(LinkageEdit)
      await vi.waitFor(() =>
        expect(message.error).toHaveBeenCalledWith(
          '场景联动数据损坏，触发条件或动作不是有效格式，无法编辑或保存。'
        )
      )

      expect(vm.editBlocked).toBe(true)
      expect(vm.configForm.name).toBeNull()
      expect(vm.conditionData).toEqual([])
      dialog.warning.mockClear()
      await vm.submitData()

      expect(dialog.warning).not.toHaveBeenCalled()
      expect(automationApi.sceneAutomationsEdit).not.toHaveBeenCalled()
    }
  )

  it('keeps action selector options and releases shared loading after refresh failures', async () => {
    const vm = mount(EditAction)
    await vi.waitFor(() => expect(vm.deviceGroupOptions).toEqual([{ id: 'group-1' }]))
    await vi.waitFor(() => expect(vm.sceneList).toEqual([{ id: 'scene-1' }]))

    deviceApi.deviceGroupTree.mockResolvedValue(requestFailure())
    automationApi.deviceListAll.mockResolvedValue(requestFailure())
    automationApi.deviceConfigAll.mockResolvedValue(requestFailure())
    automationApi.sceneGet.mockResolvedValue(requestFailure())
    alarmApi.warningMessageList.mockResolvedValue(requestFailure())
    await Promise.all([
      vm.getGroup(),
      vm.getDevice(null, 'new'),
      vm.getDeviceConfig('new'),
      vm.getSceneList('new'),
      vm.getAlarmList('new')
    ])
    await flushUI()

    expect(vm.deviceGroupOptions).toEqual([{ id: 'group-1' }])
    expect(vm.deviceOptions).toEqual([{ id: 'device-1' }])
    expect(vm.deviceConfigOption).toEqual([{ id: 'config-1' }])
    expect(vm.sceneList).toEqual([{ id: 'scene-1' }])
    expect(vm.alarmList).toEqual([{ id: 'alarm-1' }])
    expect(vm.loadingSelect).toBe(false)
  })

  it('keeps premise selector options and the selected metric when refreshes fail', async () => {
    const vm = mount(EditPremise)
    await vi.waitFor(() => expect(vm.deviceGroupOptions).toEqual([{ id: 'group-1' }]))

    deviceApi.deviceGroupTree.mockResolvedValue(requestFailure())
    automationApi.deviceListAll.mockResolvedValue(requestFailure())
    automationApi.deviceConfigAll.mockResolvedValue(requestFailure())
    automationApi.deviceMetricsConditionMenu.mockResolvedValue(requestFailure())
    await Promise.all([vm.getGroup(), vm.getDevice(null, 'new'), vm.getDeviceConfig('new')])

    const ifItem = {
      trigger_source: 'device-1',
      trigger_conditions_type: '10',
      trigger_param: 'telemetry/temperature',
      triggerParamOptions: [{ value: 'telemetry', label: 'Telemetry', options: [] }],
      triggerParamOptionsLoaded: false,
      eventParamOptions: [],
      eventParamConditions: []
    }
    await vm.loadTriggerParamOptions(ifItem)

    expect(vm.deviceGroupOptions).toEqual([{ id: 'group-1' }])
    expect(vm.deviceOptions).toEqual([{ id: 'device-1' }])
    expect(vm.deviceConfigOption).toEqual([{ id: 'config-1' }])
    expect(ifItem.triggerParamOptions.some((option: any) => option.value === 'telemetry')).toBe(true)
    expect(ifItem.triggerParamOptionsLoaded).toBe(false)
  })
})
