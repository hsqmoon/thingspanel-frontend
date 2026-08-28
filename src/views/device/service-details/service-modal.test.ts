import { createApp, defineComponent, h, nextTick } from 'vue'
import type { App, ComponentPublicInstance } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pluginApi = vi.hoisted(() => ({
  createServiceDrop: vi.fn(),
  getServiceAccessForm: vi.fn(),
  putServiceDrop: vi.fn()
}))
const dynamicValidate = vi.hoisted(() => vi.fn())
const formValidate = vi.hoisted(() => vi.fn())

vi.mock('@/service/api/plugin', () => pluginApi)
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('./components/form.vue', () => ({
  default: defineComponent({
    setup(_, { expose }) {
      expose({ validate: dynamicValidate })
      return () => h('div', { class: 'dynamic-form' })
    }
  })
}))

import ServiceModal from './components/serviceModal.vue'

const passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})
const form = defineComponent({
  setup(_, { expose, slots }) {
    expose({ validate: formValidate })
    return () => h('form', slots.default?.())
  }
})
const input = defineComponent({
  props: { value: { type: String, default: '' } },
  setup(props) {
    return () => h('input', { class: 'name-input', value: props.value })
  }
})
const button = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  }
})
const modal = defineComponent({
  props: { show: Boolean, closable: Boolean, maskClosable: Boolean, closeOnEsc: Boolean },
  emits: ['update:show'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'section',
        {
          class: 'modal',
          'data-show': String(props.show),
          'data-closable': String(props.closable)
        },
        [h('button', { class: 'dismiss', onClick: () => emit('update:show', false) }, 'dismiss'), slots.default?.()]
      )
  }
})

interface MountedServiceModal {
  app: App
  root: HTMLElement
  vm: ComponentPublicInstance
}

const mountedApps: MountedServiceModal[] = []

function mount(rootProps: Record<string, unknown> = {}): MountedServiceModal {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(ServiceModal, rootProps)
  app.component('NModal', modal)
  app.component('NForm', form)
  app.component('NFormItem', passthrough)
  app.component('NInput', input)
  app.component('NRadioGroup', passthrough)
  app.component('NRadio', passthrough)
  app.component('NButton', button)
  const vm = app.mount(root)
  const mounted = { app, root, vm }
  mountedApps.push(mounted)
  return mounted
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('service access editor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.values(pluginApi).forEach((mock) => mock.mockReset())
    dynamicValidate.mockReset().mockResolvedValue(undefined)
    formValidate.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(({ app }) => app.unmount())
  })

  it('does not pollute the form when opening fails before a later successful open', async () => {
    pluginApi.getServiceAccessForm
      .mockResolvedValueOnce({ data: null, error: { message: 'unavailable', status: 503 } })
      .mockResolvedValueOnce({ data: [], error: null })
    const mounted = mount()
    const vm = mounted.vm as unknown as { openModal: (id: string, row?: any) => Promise<void> }

    await vm.openModal('plugin', { id: 'poison', name: 'Poison', voucher: '{"auth_type":"manual"}' })
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')

    await vm.openModal('plugin', { id: 'clean', name: 'Clean', voucher: '{"auth_type":"manual"}' })
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(mounted.root.querySelector<HTMLInputElement>('.name-input')!.value).toBe('Clean')
  })

  it('validates dynamic credentials through the same submission boundary', async () => {
    pluginApi.getServiceAccessForm.mockResolvedValue({ data: [{ dataKey: 'token', type: 'input' }], error: null })
    dynamicValidate.mockRejectedValue(new Error('required'))
    const mounted = mount()
    const vm = mounted.vm as unknown as { openModal: (id: string) => Promise<void> }
    await vm.openModal('plugin')
    await flushUI()

    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()
    expect(formValidate).toHaveBeenCalledOnce()
    expect(dynamicValidate).toHaveBeenCalledOnce()
    expect(pluginApi.createServiceDrop).not.toHaveBeenCalled()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
  })

  it('blocks every close route while saving and emits the complete persisted access point', async () => {
    let resolveCreate!: (value: unknown) => void
    const create = new Promise((resolve) => {
      resolveCreate = resolve
    })
    pluginApi.getServiceAccessForm.mockResolvedValue({ data: [], error: null })
    pluginApi.createServiceDrop.mockReturnValue(create)
    const onIsEdit = vi.fn()
    const mounted = mount({ onIsEdit })
    const vm = mounted.vm as unknown as { openModal: (id: string) => Promise<void> }
    await vm.openModal('plugin')
    await flushUI()

    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-closable')).toBe('false')
    mounted.root.querySelector<HTMLButtonElement>('.dismiss')!.click()
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')

    resolveCreate({ data: { id: 'access-1' }, error: null })
    await flushUI()
    expect(onIsEdit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'access-1', service_plugin_id: 'plugin', vouchers: { auth_type: 'manual' } }),
      false
    )
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')
  })

  it('uses one stable idempotency key for an edit request', async () => {
    pluginApi.getServiceAccessForm.mockResolvedValue({ data: [], error: null })
    pluginApi.putServiceDrop.mockResolvedValue({ data: null, error: null })
    const mounted = mount()
    const vm = mounted.vm as unknown as { openModal: (id: string, row?: any) => Promise<void> }
    await vm.openModal('plugin', {
      id: 'access-1',
      name: 'Existing',
      voucher: '{"auth_type":"manual"}'
    })
    await flushUI()

    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.putServiceDrop).toHaveBeenCalledOnce()
    expect(pluginApi.putServiceDrop.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        id: 'access-1',
        idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/i)
      })
    )
  })
})
