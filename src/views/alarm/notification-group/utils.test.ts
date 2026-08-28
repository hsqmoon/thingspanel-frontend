import { createApp, defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationApi = vi.hoisted(() => ({
  getUserList: vi.fn(),
  postNotificationGroup: vi.fn(),
  putNotificationGroup: vi.fn()
}))

vi.mock('@/service/api/notification', () => notificationApi)

import { getCurrentName, handleSearch, loading, notificationTypeOptions } from './utils'
import TableActionModal from './components/table-action-modal.vue'

const validation = vi.hoisted(() => ({ validate: vi.fn() }))

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  }
})

const FormStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, expose, slots }) {
    expose({ validate: validation.validate })
    return () => h('form', attrs, slots.default?.())
  }
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('button', { ...attrs, 'data-loading': String(props.loading) }, slots.default?.())
  }
})

function mountModal(onRefresh: () => void, onVisibleUpdate: (visible: boolean) => void) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(TableActionModal, {
    visible: true,
    type: 'add',
    onGetTableData: onRefresh,
    'onUpdate:visible': onVisibleUpdate
  })
  app.component('NForm', FormStub)
  app.component('NButton', ButtonStub)
  ;['NFormItem', 'NInput', 'NModal', 'NSelect', 'NSpace'].forEach(name => app.component(name, PassthroughStub))
  app.mount(root)
  return {
    root,
    unmount() {
      app.unmount()
      root.remove()
    }
  }
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('notification group member search failures', () => {
  beforeEach(() => {
    notificationApi.getUserList.mockReset()
    notificationApi.postNotificationGroup.mockReset()
    notificationApi.putNotificationGroup.mockReset()
    validation.validate.mockReset().mockResolvedValue(undefined)
    notificationTypeOptions.value = [{ label: '已有成员', value: 'existing-user' }]
    loading.value = false
  })

  it('preserves existing choices and releases loading when a request fails', async () => {
    notificationApi.getUserList.mockResolvedValue({
      data: null,
      error: { message: 'Unavailable', status: 503 }
    })

    await handleSearch('新搜索')

    expect(notificationTypeOptions.value).toEqual([{ label: '已有成员', value: 'existing-user' }])
    expect(loading.value).toBe(false)
    expect(getCurrentName(999)).toBe('')
  })

  it('keeps the modal open and permits retry after a save failure', async () => {
    notificationApi.postNotificationGroup.mockResolvedValue({
      data: null,
      error: { message: 'Unavailable', status: 503 }
    })
    const onRefresh = vi.fn()
    const onVisibleUpdate = vi.fn()
    const mounted = mountModal(onRefresh, onVisibleUpdate)
    const buttons = mounted.root.querySelectorAll<HTMLButtonElement>('button')
    const saveButton = buttons[buttons.length - 1]

    saveButton.click()
    await vi.waitFor(() => expect(notificationApi.postNotificationGroup).toHaveBeenCalledOnce())
    await flushUI()

    expect(onRefresh).not.toHaveBeenCalled()
    expect(onVisibleUpdate).not.toHaveBeenCalled()

    saveButton.click()
    await vi.waitFor(() => expect(notificationApi.postNotificationGroup).toHaveBeenCalledTimes(2))
    mounted.unmount()
  })

  it('treats form validation rejection as an expected result without sending a request', async () => {
    validation.validate.mockRejectedValue([])
    const mounted = mountModal(vi.fn(), vi.fn())
    const buttons = mounted.root.querySelectorAll<HTMLButtonElement>('button')

    buttons[buttons.length - 1].click()
    await flushUI()

    expect(notificationApi.postNotificationGroup).not.toHaveBeenCalled()
    mounted.unmount()
  })
})
