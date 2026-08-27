import { createApp, defineComponent, h, nextTick, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pluginApi = vi.hoisted(() => ({
  batchAddServiceMenuList: vi.fn(),
  delRegisterService: vi.fn(),
  delServiceAccess: vi.fn(),
  getSelectServiceMenuList: vi.fn(),
  getServiceAccess: vi.fn(),
  getServiceListDrop: vi.fn(),
  getServices: vi.fn()
}))

const deviceApi = vi.hoisted(() => ({
  deviceConfigMenu: vi.fn()
}))
const componentLogger = vi.hoisted(() => ({
  error: vi.fn()
}))

vi.mock('@/service/api/plugin', () => pluginApi)
vi.mock('@/service/api/device', () => deviceApi)
vi.mock('@/utils/logger', () => ({ componentLogger }))
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {
      id: 'plugin-1',
      service_identifier: 'protocol-1',
      service_name: 'Test service',
      service_type: 1
    }
  }),
  useRouter: () => ({ push: vi.fn() })
}))
vi.mock('@/views/apply/plugin/components/serviceConfigModal.vue', () => ({
  default: defineComponent({ render: () => h('div') })
}))
vi.mock('@/views/apply/plugin/components/serviceModal.vue', () => ({
  default: defineComponent({ render: () => h('div') })
}))
vi.mock('@/views/device/service-details/components/serviceModal.vue', () => ({
  default: defineComponent({ render: () => h('div') })
}))
vi.mock('naive-ui', () => {
  const passthrough = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('div', attrs, slots.default?.())
    }
  })
  const button = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    }
  })

  return {
    NAlert: passthrough,
    NButton: button,
    NInput: passthrough,
    NPopconfirm: passthrough,
    NSelect: passthrough,
    NSpace: passthrough,
    NTag: passthrough
  }
})

import PluginIndex from '@/views/apply/plugin/index.vue'
import ServiceDetails from '@/views/device/service-details/index.vue'
import ServiceConfigModal from '@/views/device/service-details/components/serviceConfigModal.vue'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})

const button = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  }
})

const dataTable = defineComponent({
  props: {
    data: { type: Array, default: () => [] },
    loading: Boolean,
    pagination: { type: Object, default: () => ({}) }
  },
  emits: ['update:checkedRowKeys'],
  setup(props, { emit }) {
    return () =>
      h('div', { class: 'data-table', 'data-loading': String(props.loading) }, [
        h('pre', { class: 'table-rows' }, JSON.stringify(props.data)),
        h(
          'button',
          {
            class: 'next-page',
            onClick: () => {
              const changePage = props.pagination.onChange || props.pagination.onUpdatePage
              changePage?.(2)
            }
          },
          'next'
        ),
        h(
          'button',
          {
            class: 'select-device',
            onClick: () => emit('update:checkedRowKeys', [String((props.data[0] as any)?.device_number)])
          },
          'select'
        )
      ])
  }
})

const modal = defineComponent({
  props: {
    show: Boolean,
    closable: Boolean,
    maskClosable: Boolean,
    closeOnEsc: Boolean
  },
  emits: ['update:show'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'section',
        {
          class: 'modal',
          'data-show': String(props.show),
          'data-closable': String(props.closable),
          'data-mask-closable': String(props.maskClosable),
          'data-close-on-esc': String(props.closeOnEsc)
        },
        [
          h('button', { class: 'modal-dismiss', onClick: () => emit('update:show', false) }, 'dismiss'),
          slots.default?.()
        ]
      )
  }
})

function mount(component: Component, rootProps: Record<string, unknown> = {}) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(component, rootProps)
  app.component('NCard', passthrough)
  app.component('NButton', button)
  app.component('NDataTable', dataTable)
  app.component('NModal', modal)
  app.component('NSelect', passthrough)
  const vm = app.mount(root)
  return { app, root, vm }
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('service list request sequencing', () => {
  const mountedApps: ReturnType<typeof mount>[] = []

  beforeEach(() => {
    document.body.innerHTML = ''
    Object.values(pluginApi).forEach(mock => mock.mockReset())
    Object.values(deviceApi).forEach(mock => mock.mockReset())
    componentLogger.error.mockReset()
    window.$message = {
      destroyAll: vi.fn(),
      error: vi.fn(),
      success: vi.fn()
    } as any
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(({ app }) => app.unmount())
  })

  it('keeps the newest plugin list when an older page response arrives late', async () => {
    const first = deferred<any>()
    const second = deferred<any>()
    pluginApi.getServices.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)

    const mounted = mount(PluginIndex)
    mountedApps.push(mounted)
    mounted.root.querySelector<HTMLButtonElement>('.next-page')!.click()

    second.resolve({ data: { list: [{ id: 'new-plugin' }], total: 1 } })
    await flushUI()
    expect(mounted.root.querySelector('.table-rows')!.textContent).toContain('new-plugin')

    first.reject(new Error('stale plugin request'))
    await flushUI()
    expect(mounted.root.querySelector('.table-rows')!.textContent).toContain('new-plugin')
    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(componentLogger.error).not.toHaveBeenCalled()
  })

  it('handles a current plugin-list rejection without an unhandled promise', async () => {
    const error = new Error('plugin list unavailable')
    pluginApi.getServices.mockRejectedValue(error)

    const mounted = mount(PluginIndex)
    mountedApps.push(mounted)
    await flushUI()

    expect(componentLogger.error).toHaveBeenCalledWith('Failed to load plugin services', error)
    expect(window.$message?.destroyAll).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith('plugin list unavailable')
    expect(mounted.root.querySelector('.data-table')!.getAttribute('data-loading')).toBe('false')
  })

  it('handles a plugin-list rejection after unmount without showing a stale error', async () => {
    const request = deferred<any>()
    pluginApi.getServices.mockImplementation(() => request.promise)

    const mounted = mount(PluginIndex)
    mounted.app.unmount()
    request.reject(new Error('request completed after unmount'))
    await flushUI()

    expect(componentLogger.error).not.toHaveBeenCalled()
    expect(window.$message?.error).not.toHaveBeenCalled()
  })

  it('keeps the newest access-point list when an older page response arrives late', async () => {
    const first = deferred<any>()
    const second = deferred<any>()
    pluginApi.getServiceAccess.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)

    const mounted = mount(ServiceDetails)
    mountedApps.push(mounted)
    mounted.root.querySelector<HTMLButtonElement>('.next-page')!.click()

    second.resolve({ data: { list: [{ id: 'new-access' }], total: 1 } })
    await flushUI()
    first.resolve({ data: { list: [{ id: 'stale-access' }], total: 1 } })
    await flushUI()

    expect(mounted.root.querySelector('.table-rows')!.textContent).toContain('new-access')
    expect(mounted.root.querySelector('.table-rows')!.textContent).not.toContain('stale-access')
  })

  it('handles a current access-point rejection without an unhandled promise', async () => {
    const error = { response: { data: { message: 'Access points unavailable' } } }
    pluginApi.getServiceAccess.mockRejectedValue(error)

    const mounted = mount(ServiceDetails)
    mountedApps.push(mounted)
    await flushUI()

    expect(componentLogger.error).toHaveBeenCalledWith('Failed to load service access points', error)
    expect(window.$message?.destroyAll).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith('Access points unavailable')
    expect(mounted.root.querySelector('.data-table')!.getAttribute('data-loading')).toBe('false')
  })

  it('invalidates an earlier modal session without clearing the current loading state', async () => {
    const first = deferred<any>()
    const second = deferred<any>()
    pluginApi.getServiceListDrop.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('old-voucher', { id: 'old-access' }, false)
    vm.openModal('new-voucher', { id: 'new-access' }, false)

    first.resolve({ data: { list: [{ device_number: 'stale-device' }], total: 1 } })
    await flushUI()
    expect(mounted.root.querySelector('.data-table')!.getAttribute('data-loading')).toBe('true')
    expect(mounted.root.querySelector('.table-rows')!.textContent).not.toContain('stale-device')

    second.resolve({ data: { list: [{ device_number: 'current-device' }], total: 1 } })
    await flushUI()
    expect(mounted.root.querySelector('.data-table')!.getAttribute('data-loading')).toBe('false')
    expect(mounted.root.querySelector('.table-rows')!.textContent).toContain('current-device')
  })

  it('blocks every close path during submission, then closes and refreshes after success', async () => {
    const submit = deferred<any>()
    const getList = vi.fn()
    const goBack = vi.fn()
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: 'Device 1' }], total: 1 }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockImplementation(() => submit.promise)

    const mounted = mount(ServiceConfigModal, { onGetList: getList, onGoBack: goBack })
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('first-voucher', { id: 'first-access' }, true)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()
    expect(pluginApi.batchAddServiceMenuList).toHaveBeenCalledOnce()

    const renderedModal = mounted.root.querySelector('.modal')!
    expect(renderedModal.getAttribute('data-closable')).toBe('false')
    expect(renderedModal.getAttribute('data-mask-closable')).toBe('false')
    expect(renderedModal.getAttribute('data-close-on-esc')).toBe('false')
    mounted.root.querySelector<HTMLButtonElement>('.modal-dismiss')!.click()
    mounted.root.querySelectorAll<HTMLButtonElement>('.footer button:not(.btn)').forEach(closeButton => {
      expect(closeButton.disabled).toBe(true)
      closeButton.click()
    })
    vm.openModal('second-voucher', { id: 'second-access' }, false)
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(goBack).not.toHaveBeenCalled()

    submit.resolve({ data: true })
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')
    expect(window.$message?.success).toHaveBeenCalledWith('common.operationSuccess')
    expect(getList).toHaveBeenCalledOnce()
    expect(goBack).not.toHaveBeenCalled()
  })

  it('shows the generic operation failure when a submission has no backend message', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: 'Device 1' }], total: 1 }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue({})

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(componentLogger.error).toHaveBeenCalledWith('Service configuration submission failed', {})
    expect(window.$message?.destroyAll).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith('common.operationFailed')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
  })

  it('logs a rejected submission and replaces the request-layer message with its specific error', async () => {
    const error = { response: { data: { message: 'Backend rejected this device' } } }
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: 'Device 1' }], total: 1 }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockRejectedValue(error)

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(componentLogger.error).toHaveBeenCalledWith('Failed to submit service configuration', error)
    expect(window.$message?.destroyAll).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith('Backend rejected this device')
  })
})
