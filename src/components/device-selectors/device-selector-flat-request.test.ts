import { createApp, defineComponent, h, nextTick, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  deviceListForPanel: vi.fn(),
  deviceMetricsList: vi.fn()
}))

vi.mock('@/service/api', () => api)
vi.mock('@/locales', () => ({ $t: (key: string) => key }))

import DeviceDispatchSelector from './DeviceDispatchSelector.vue'
import DeviceMetricsSelector from './DeviceMetricsSelector.vue'

const requestFailure = {
  data: null,
  error: {
    message: 'metrics unavailable',
    status: 503,
    code: 'ERR_BAD_RESPONSE'
  }
}
const metrics = [
  {
    data_source_type: 'telemetry',
    options: [{ key: 'temperature', label: 'Temperature', data_type: 'number' }]
  }
]

const SelectStub = defineComponent({
  inheritAttrs: false,
  props: {
    options: { type: Array, default: () => [] },
    placeholder: String
  },
  emits: ['update:show'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: props.placeholder === 'generate.selectMetrics' ? 'metrics-select' : 'select',
          onClick: () => emit('update:show', true)
        },
        JSON.stringify(props.options)
      )
  }
})
const Passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})

function mount(component: Component, modelValue: Record<string, unknown>) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(component, {
    modelValue,
    deviceOptions: [{ id: 'device-1', name: 'Device' }]
  })
  app.component('NSelect', SelectStub)
  app.component('NInput', Passthrough)
  app.mount(root)
  return { app, root }
}

async function retryMetricsRequest(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>('.metrics-select')!
  button.click()
  await vi.waitFor(() => expect(api.deviceMetricsList).toHaveBeenCalledOnce())
  button.click()
  await vi.waitFor(() => expect(api.deviceMetricsList).toHaveBeenCalledTimes(2))
  await nextTick()
  expect(button.textContent).toContain('temperature')
}

describe('device selector FlatRequest failures', () => {
  const mountedApps: ReturnType<typeof mount>[] = []

  beforeEach(() => {
    document.body.innerHTML = ''
    api.deviceListForPanel.mockReset()
    api.deviceMetricsList.mockReset().mockResolvedValueOnce(requestFailure).mockResolvedValueOnce({
      data: metrics,
      error: null
    })
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(({ app }) => app.unmount())
    document.body.innerHTML = ''
  })

  it('keeps DeviceMetricsSelector retryable after a resolved failure', async () => {
    const mounted = mount(DeviceMetricsSelector, { deviceId: 'device-1' })
    mountedApps.push(mounted)

    await retryMetricsRequest(mounted.root)
  })

  it('keeps DeviceDispatchSelector retryable after a resolved failure', async () => {
    const mounted = mount(DeviceDispatchSelector, { deviceId: 'device-1', dataType: 'telemetry' })
    mountedApps.push(mounted)

    await retryMetricsRequest(mounted.root)
  })
})
