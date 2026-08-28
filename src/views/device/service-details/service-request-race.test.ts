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
const messageDestroy = vi.fn()

vi.mock('@/service/api/plugin', () => pluginApi)
vi.mock('@/service/api/device', () => deviceApi)
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
  const select = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => h('select', { ...attrs, class: 'device-config-select' })
    }
  })
  const popconfirm = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () =>
        h('div', [
          slots.trigger?.(),
          h(
            'button',
            {
              class: 'confirm-delete',
              onClick: () => (attrs.onPositiveClick as (() => void) | undefined)?.()
            },
            'confirm delete'
          )
        ])
    }
  })

  return {
    NAlert: passthrough,
    NButton: button,
    NInput: passthrough,
    NPopconfirm: popconfirm,
    NSelect: select,
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

function requestFailure(message: string, status = 500) {
  return {
    data: null,
    error: {
      message,
      status,
      code: 'ERR_BAD_RESPONSE',
      data: { message }
    }
  }
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
    columns: { type: Array, default: () => [] },
    pagination: { type: Object, default: () => ({}) }
  },
  emits: ['update:checkedRowKeys'],
  setup(props, { emit }) {
    return () => {
      const actionColumn = props.columns.find((column: any) => column.key === 'actions') as any
      const actions = props.data[0] && actionColumn ? actionColumn.render(props.data[0]) : null
      const configColumn = props.columns.find((column: any) => column.key === 'create_at') as any
      const config = props.data[0] && configColumn ? configColumn.render(props.data[0]) : null

      return h('div', { class: 'data-table', 'data-loading': String(props.loading) }, [
        h('pre', { class: 'table-rows' }, JSON.stringify(props.data)),
        actions,
        config,
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
    Object.values(pluginApi).forEach((mock) => mock.mockReset())
    Object.values(deviceApi).forEach((mock) => mock.mockReset())
    messageDestroy.mockReset()
    window.$message = {
      destroyAll: vi.fn(),
      error: vi.fn(() => ({ destroy: messageDestroy })),
      success: vi.fn(),
      warning: vi.fn()
    } as any
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(({ app }) => app.unmount())
    vi.useRealTimers()
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

    first.resolve(requestFailure('stale plugin request'))
    await flushUI()
    expect(mounted.root.querySelector('.table-rows')!.textContent).toContain('new-plugin')
    expect(window.$message?.error).not.toHaveBeenCalled()
  })

  it('handles a current plugin-list rejection without an unhandled promise', async () => {
    const error = requestFailure('plugin list unavailable', 503)
    pluginApi.getServices.mockResolvedValue(error)

    const mounted = mount(PluginIndex)
    await flushUI()

    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('plugin list unavailable')
    expect(mounted.root.querySelector('.data-table')!.getAttribute('data-loading')).toBe('false')
    mounted.app.unmount()
    expect(messageDestroy).toHaveBeenCalledOnce()
  })

  it('handles a plugin-list rejection after unmount without showing a stale error', async () => {
    const request = deferred<any>()
    pluginApi.getServices.mockImplementation(() => request.promise)

    const mounted = mount(PluginIndex)
    mounted.app.unmount()
    request.resolve(requestFailure('request completed after unmount'))
    await flushUI()

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
    const error = requestFailure('Access points unavailable', 503)
    pluginApi.getServiceAccess.mockResolvedValue(error)

    const mounted = mount(ServiceDetails)
    await flushUI()

    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('Access points unavailable')
    expect(mounted.root.querySelector('.data-table')!.getAttribute('data-loading')).toBe('false')
    mounted.app.unmount()
    expect(messageDestroy).toHaveBeenCalledOnce()
  })

  it('leaves a plugin-list 401 entirely to the authentication layer', async () => {
    pluginApi.getServices.mockResolvedValue(requestFailure('Session expired', 401))

    const mounted = mount(PluginIndex)
    mountedApps.push(mounted)
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
  })

  it('leaves an access-point 401 entirely to the authentication layer', async () => {
    pluginApi.getServiceAccess.mockResolvedValue(requestFailure('Session expired', 401))

    const mounted = mount(ServiceDetails)
    mountedApps.push(mounted)
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
  })

  it('does not refresh the plugin list when deletion completes after unmount', async () => {
    const deletion = deferred<any>()
    pluginApi.getServices.mockResolvedValue({ data: { list: [{ id: 'plugin-to-delete' }], total: 1 } })
    pluginApi.delRegisterService.mockImplementation(() => deletion.promise)

    const mounted = mount(PluginIndex)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.confirm-delete')!.click()
    expect(pluginApi.delRegisterService).toHaveBeenCalledWith('plugin-to-delete')

    mounted.app.unmount()
    deletion.resolve({})
    await flushUI()
    expect(pluginApi.getServices).toHaveBeenCalledOnce()
  })

  it('does not refresh access points when deletion completes after unmount', async () => {
    const deletion = deferred<any>()
    pluginApi.getServiceAccess.mockResolvedValue({ data: { list: [{ id: 'access-to-delete' }], total: 1 } })
    pluginApi.delServiceAccess.mockImplementation(() => deletion.promise)

    const mounted = mount(ServiceDetails)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.confirm-delete')!.click()
    expect(pluginApi.delServiceAccess).toHaveBeenCalledWith('access-to-delete')

    mounted.app.unmount()
    deletion.resolve({})
    await flushUI()
    expect(pluginApi.getServiceAccess).toHaveBeenCalledOnce()
  })

  it('invalidates an earlier modal session without clearing the current loading state', async () => {
    const first = deferred<any>()
    const second = deferred<any>()
    pluginApi.getServiceListDrop
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
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

  it('uses the unique access-point id and never falls back to unrelated templates', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({ data: { list: [], total: 0 }, error: null })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [], error: null })
    deviceApi.deviceConfigMenu.mockResolvedValue({ data: [], error: null })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()

    expect(pluginApi.getServiceListDrop).toHaveBeenCalledWith(
      expect.objectContaining({ service_access_id: 'access' }),
      { silentError: true }
    )
    expect(pluginApi.getSelectServiceMenuList).toHaveBeenCalledWith(
      expect.objectContaining({ protocol_type: 'protocol-1' }),
      { silentError: true }
    )
    expect(deviceApi.deviceConfigMenu).not.toHaveBeenCalled()
  })

  it('shows the real modal list failure through its own message handle', async () => {
    const failure = requestFailure('Upstream device list unavailable', 503)
    pluginApi.getServiceListDrop.mockResolvedValue(failure)
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [], error: null })

    const mounted = mount(ServiceConfigModal)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()

    expect(window.$message?.error).toHaveBeenCalledWith('Upstream device list unavailable')
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    mounted.app.unmount()
    expect(messageDestroy).toHaveBeenCalledOnce()
  })

  it('leaves a modal list 401 entirely to the authentication layer', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue(requestFailure('Session expired', 401))
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [], error: null })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
  })

  it('clears rows and every retained selection when the current device list fails', async () => {
    pluginApi.getServiceListDrop
      .mockResolvedValueOnce({
        data: {
          list: [
            { device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }
          ],
          total: 1
        },
        error: null
      })
      .mockResolvedValueOnce(requestFailure('page unavailable', 503))
    pluginApi.getSelectServiceMenuList.mockResolvedValue({
      data: [{ id: 'template-1', name: 'Template' }],
      error: null
    })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('secret-voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.next-page')!.click()
    await flushUI()

    expect(mounted.root.querySelector('.table-rows')!.textContent).toBe('[]')
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()
    expect(pluginApi.batchAddServiceMenuList).not.toHaveBeenCalled()
    expect(window.$message?.success).not.toHaveBeenCalled()
  })

  it('renders the configuration selector read-only for an already bound device', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: {
        list: [{ device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: true }],
        total: 1
      },
      error: null
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({
      data: [{ id: 'template-1', name: 'Template' }],
      error: null
    })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('secret-voucher', { id: 'access' }, false)
    await flushUI()

    expect(mounted.root.querySelector<HTMLSelectElement>('.device-config-select')!.disabled).toBe(true)
  })

  it('blocks every close path during submission, then closes after delivered plugin synchronization', async () => {
    const submit = deferred<any>()
    const getList = vi.fn()
    const goBack = vi.fn()
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: {
        list: [{ device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1' }],
        total: 1
      }
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
    mounted.root.querySelectorAll<HTMLButtonElement>('.footer button:not(.btn)').forEach((closeButton) => {
      expect(closeButton.disabled).toBe(true)
      closeButton.click()
    })
    vm.openModal('second-voucher', { id: 'second-access' }, false)
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(goBack).not.toHaveBeenCalled()

    submit.resolve({
      data: {
        devices: [{ id: 'device-id-1', device_number: 'device-1' }],
        delivery: {
          event_id: '12345678-delivered',
          status: 'delivered',
          attempts: 1,
          next_retry_at: null,
          last_error: null
        }
      },
      error: null
    })
    await flushUI()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')
    expect(window.$message?.success).toHaveBeenCalledWith('common.operationSuccess')
    expect(getList).toHaveBeenCalledOnce()
    expect(goBack).not.toHaveBeenCalled()
    expect(pluginApi.batchAddServiceMenuList).toHaveBeenCalledWith(expect.any(Object), { silentError: true })
  })

  it('requires a device configuration for every selected device before submitting', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: 'Device 1', is_bind: false }], total: 1 },
      error: null
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({
      data: [{ id: 'template-1', name: 'Template' }],
      error: null
    })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.batchAddServiceMenuList).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('请选择设备配置模板后再提交（device-1）')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
  })

  it('requires a non-empty device name before submitting', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: '   ', device_config_id: 'template-1' }], total: 1 },
      error: null
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.batchAddServiceMenuList).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith('请输入设备名称后再提交（device-1）')
  })

  it('sends only fields defined by the batch-create contract', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: {
        list: [{
          device_number: 'device-1', device_name: ' Device 1 ', device_config_id: 'template-1',
          description: 'description', protocol_config: '{"ignored":true}', additional_info: '{"ignored":true}'
        }],
        total: 1
      }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue({
      data: {
        devices: [{ id: 'device-id-1', device_number: 'device-1' }],
        delivery: { event_id: 'delivered-event', status: 'delivered', attempts: 1 }
      },
      error: null
    })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    const requestBody = pluginApi.batchAddServiceMenuList.mock.calls[0][0]
    expect(requestBody.device_list[0]).toEqual({
      device_number: 'device-1',
      device_name: 'Device 1',
      description: 'description',
      device_config_id: 'template-1'
    })
  })

  it('shows a deterministic 4xx rejection without reconciliation or locking the modal', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1' }], total: 1 }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue(requestFailure('Template does not match protocol', 400))

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.getServiceListDrop).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith('Template does not match protocol')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-closable')).toBe('true')
  })

  it.each([100005, 204004, 204006])(
    'uses backend business code %s to reject an HTTP 200 response without reconciliation or locking',
    async backendCode => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: { list: [{ device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1' }], total: 1 }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue({
      data: null,
      error: {
        message: '设备参数错误',
        status: 200,
        code: 'BACKEND_ERROR',
        data: { code: backendCode, message: '设备参数错误' }
      }
    })

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.getServiceListDrop).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith('设备参数错误')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-closable')).toBe('true')
    }
  )

  it.each(['pending', 'processing'])(
    'reports %s plugin delivery without claiming full synchronization',
    async (status) => {
      const getList = vi.fn()
      pluginApi.getServiceListDrop.mockResolvedValue({
        data: {
          list: [
            { device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }
          ],
          total: 1
        }
      })
      pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
      const delivery = {
        event_id: 'abcdef12-3456-7890',
        status,
        attempts: status === 'pending' ? 0 : 1,
        next_retry_at: '2026-08-28T05:00:00Z',
        last_error: null
      }
      pluginApi.batchAddServiceMenuList.mockResolvedValue({
        data: { devices: [{ id: 'device-id-1', device_number: 'device-1' }], delivery },
        error: null
      })

      const mounted = mount(ServiceConfigModal, { onGetList: getList })
      mountedApps.push(mounted)
      const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
      vm.openModal('voucher', { id: 'access' }, false)
      await flushUI()
      mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
      await flushUI()
      mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
      await flushUI()

      expect(window.$message?.warning).toHaveBeenCalledWith('设备已创建，插件同步中（事件 abcdef12）')
      expect(window.$message?.success).not.toHaveBeenCalled()
      expect(getList).toHaveBeenCalledOnce()
      expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')
    }
  )

  it('treats an unknown delivery status as invalid and reconciles the persisted devices', async () => {
    const getList = vi.fn()
    pluginApi.getServiceListDrop
      .mockResolvedValueOnce({
        data: {
          list: [
            { device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }
          ],
          total: 1
        }
      })
      .mockResolvedValueOnce({
        data: { list: [{ device_number: 'device-1', device_name: 'Device 1', is_bind: true }], total: 1 }
      })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    const invalidResponse = {
      data: {
        devices: [{ id: 'device-id-1', device_number: 'device-1' }],
        delivery: { event_id: 'unknown-event', status: 'unknown', attempts: 1 }
      },
      error: null
    }
    pluginApi.batchAddServiceMenuList.mockResolvedValue(invalidResponse)

    const mounted = mount(ServiceConfigModal, { onGetList: getList })
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.getServiceListDrop).toHaveBeenCalledTimes(2)
    expect(window.$message?.warning).toHaveBeenCalledWith('设备已创建，插件同步状态未知，请稍后刷新检查。')
    expect(window.$message?.success).not.toHaveBeenCalled()
    expect(getList).toHaveBeenCalledOnce()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')
  })

  it('stays locked when repeated reconciliation cannot prove that submission was not persisted', async () => {
    vi.useFakeTimers()
    const getList = vi.fn()
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: {
        list: [{ device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }],
        total: 1
      }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    const failure = requestFailure('Backend rejected this device', 503)
    pluginApi.batchAddServiceMenuList.mockResolvedValue(failure)

    const mounted = mount(ServiceConfigModal, { onGetList: getList })
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()
    await vi.runAllTimersAsync()
    await flushUI()

    expect(pluginApi.getServiceListDrop).toHaveBeenCalledTimes(4)
    expect(getList).toHaveBeenCalledOnce()
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(window.$message?.error).toHaveBeenCalledWith(
      '无法确认提交是否落库，请刷新页面检查。为避免重复创建设备，当前已禁止再次提交。'
    )
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-closable')).toBe('false')
  })

  it('treats an uncertain submission as successful when reconciliation finds the binding', async () => {
    const getList = vi.fn()
    pluginApi.getServiceListDrop
      .mockResolvedValueOnce({
        data: {
          list: [
            { device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }
          ],
          total: 1
        }
      })
      .mockResolvedValueOnce({
        data: { list: [{ device_number: 'device-1', device_name: 'Device 1', is_bind: true }], total: 1 }
      })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue(requestFailure('Response lost', 504))

    const mounted = mount(ServiceConfigModal, { onGetList: getList })
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(pluginApi.getServiceListDrop).toHaveBeenCalledTimes(2)
    expect(getList).toHaveBeenCalledOnce()
    expect(window.$message?.warning).toHaveBeenCalledWith('设备已创建，插件同步状态未知，请稍后刷新检查。')
    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('false')
  })

  it('stays locked when reconciliation itself fails and forbids a blind retry', async () => {
    const getList = vi.fn()
    pluginApi.getServiceListDrop
      .mockResolvedValueOnce({
        data: {
          list: [
            { device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }
          ],
          total: 1
        }
      })
      .mockResolvedValueOnce(requestFailure('Reconciliation unavailable', 503))
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue(requestFailure('Response lost', 504))

    const mounted = mount(ServiceConfigModal, { onGetList: getList })
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(getList).toHaveBeenCalledOnce()
    expect(window.$message?.error).toHaveBeenCalledWith(
      '无法确认提交结果：Reconciliation unavailable。请刷新页面后检查，当前已禁止再次提交。'
    )
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-closable')).toBe('false')
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()
    expect(pluginApi.batchAddServiceMenuList).toHaveBeenCalledOnce()
  })

  it('leaves a submission 401 to the authentication layer without discarding the modal draft', async () => {
    pluginApi.getServiceListDrop.mockResolvedValue({
      data: {
        list: [{ device_number: 'device-1', device_name: 'Device 1', device_config_id: 'template-1', is_bind: false }],
        total: 1
      }
    })
    pluginApi.getSelectServiceMenuList.mockResolvedValue({ data: [{ id: 'template-1', name: 'Template' }] })
    pluginApi.batchAddServiceMenuList.mockResolvedValue(requestFailure('Session expired', 401))

    const mounted = mount(ServiceConfigModal)
    mountedApps.push(mounted)
    const vm = mounted.vm as unknown as { openModal: (voucher: string, row: any, edit: boolean) => void }
    vm.openModal('voucher', { id: 'access' }, false)
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.select-device')!.click()
    await flushUI()
    mounted.root.querySelector<HTMLButtonElement>('.btn')!.click()
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(pluginApi.getServiceListDrop).toHaveBeenCalledOnce()
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-show')).toBe('true')
    expect(mounted.root.querySelector('.modal')!.getAttribute('data-closable')).toBe('true')
  })
})
