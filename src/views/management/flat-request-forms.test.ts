import type { Component } from 'vue'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  addKey: vi.fn(),
  editPushNotificationServices: vi.fn(),
  fetchPushNotificationServices: vi.fn(),
  editFunction: vi.fn(),
  getFunction: vi.fn(),
  editRoleUser: vi.fn(),
  editTenantUser: vi.fn(),
  updateKey: vi.fn()
}))

vi.mock('@/service/api', () => ({
  addKey: api.addKey,
  editPushNotificationServices: api.editPushNotificationServices,
  fetchPushNotificationServices: api.fetchPushNotificationServices,
  editUser: api.editRoleUser,
  updateKey: api.updateKey
}))
vi.mock('@/service/api/auth', () => ({ editUser: api.editTenantUser }))
vi.mock('@/service/api/setting', () => ({ editFunction: api.editFunction, getFunction: api.getFunction }))

import PushNotification from './notification/components/push-notification.vue'
import ApiKeyModal from './api/modules/table-action-modal.vue'
import RoleEditPasswordModal from './role/modules/edit-password-modal.vue'
import FunctionSetting from './setting/components/function-setting.vue'
import UserEditPasswordModal from './user/components/edit-password-modal.vue'

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
  props: {
    disabled: Boolean,
    loading: Boolean
  },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          disabled: props.disabled,
          'data-loading': String(props.loading)
        },
        slots.default?.()
      )
  }
})

const SwitchStub = defineComponent({
  props: {
    disabled: Boolean,
    loading: Boolean,
    value: Boolean
  },
  emits: ['update:value'],
  setup(props, { emit }) {
    return () =>
      h('button', {
        class: 'function-switch',
        disabled: props.disabled,
        'data-loading': String(props.loading),
        'data-value': String(props.value),
        onClick: () => emit('update:value', !props.value)
      })
  }
})

function mount(component: Component, props: Record<string, unknown> = {}) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(component, props)
  app.use(createPinia())
  app.component('NForm', FormStub)
  app.component('NButton', ButtonStub)
  app.component('NSwitch', SwitchStub)
  ;[
    'NFlex',
    'NFormItem',
    'NFormItemGridItem',
    'NGrid',
    'NInput',
    'NModal',
    'NSpace',
    'NSpin'
  ].forEach(name => app.component(name, PassthroughStub))
  app.mount(root)
  return {
    app,
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

const requestFailure = {
  data: null,
  error: { message: 'Unavailable', status: 503 }
}

describe('management form request failures', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    validation.validate.mockReset().mockResolvedValue(undefined)
    localStorage.clear()
    window.$message = {
      success: vi.fn(),
      warning: vi.fn()
    } as unknown as typeof window.$message
  })

  it('keeps push settings unchanged and permits retry after save failure', async () => {
    api.fetchPushNotificationServices.mockResolvedValue({
      data: { url: 'https://push.example.test' },
      error: null
    })
    api.editPushNotificationServices.mockResolvedValue(requestFailure)
    const mounted = mount(PushNotification)

    await vi.waitFor(() => expect(api.fetchPushNotificationServices).toHaveBeenCalledOnce())
    await flushUI()
    const saveButton = mounted.root.querySelector<HTMLButtonElement>('button')!
    saveButton.click()
    await vi.waitFor(() => expect(api.editPushNotificationServices).toHaveBeenCalledOnce())
    await flushUI()

    expect(window.$message?.success).not.toHaveBeenCalled()
    expect(api.fetchPushNotificationServices).toHaveBeenCalledOnce()

    saveButton.click()
    await vi.waitFor(() => expect(api.editPushNotificationServices).toHaveBeenCalledTimes(2))
    mounted.unmount()
  })

  it('keeps the API key modal open and does not emit success when creation fails', async () => {
    api.addKey.mockResolvedValue(requestFailure)
    const onSuccess = vi.fn()
    const onVisibleUpdate = vi.fn()
    const mounted = mount(ApiKeyModal, {
      visible: true,
      type: 'add',
      onSuccess,
      'onUpdate:visible': onVisibleUpdate
    })
    const buttons = mounted.root.querySelectorAll<HTMLButtonElement>('button')
    const confirmButton = buttons[buttons.length - 1]

    confirmButton.click()
    await vi.waitFor(() => expect(api.addKey).toHaveBeenCalledOnce())
    await flushUI()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onVisibleUpdate).not.toHaveBeenCalled()

    confirmButton.click()
    await vi.waitFor(() => expect(api.addKey).toHaveBeenCalledTimes(2))
    mounted.unmount()
  })

  it('does not optimistically change a function switch when its update fails', async () => {
    const initialFunctions = [
      { id: 'registration', description: '允许注册', enable_flag: 'enable' }
    ]
    api.getFunction.mockResolvedValue({ data: initialFunctions, error: null })
    api.editFunction.mockResolvedValue(requestFailure)
    const mounted = mount(FunctionSetting)

    await vi.waitFor(() => expect(api.getFunction).toHaveBeenCalledOnce())
    await flushUI()
    const toggle = mounted.root.querySelector<HTMLButtonElement>('.function-switch')!
    expect(toggle.dataset.value).toBe('true')

    toggle.click()
    await vi.waitFor(() => expect(api.editFunction).toHaveBeenCalledOnce())
    await flushUI()

    expect(toggle.dataset.value).toBe('true')
    expect(api.getFunction).toHaveBeenCalledOnce()
    expect(localStorage.getItem('enableZcAndYzm')).toBe(JSON.stringify(initialFunctions))

    toggle.click()
    await vi.waitFor(() => expect(api.editFunction).toHaveBeenCalledTimes(2))
    mounted.unmount()
  })

  it.each([
    ['tenant user', UserEditPasswordModal, api.editTenantUser],
    ['role user', RoleEditPasswordModal, api.editRoleUser]
  ])('keeps the %s password modal open when its request fails', async (_, component, editUser) => {
    editUser.mockResolvedValue({
      data: null,
      error: { message: 'Authentication expired', status: 401 }
    })
    const onSuccess = vi.fn()
    const onVisibleUpdate = vi.fn()
    const mounted = mount(component, {
      visible: true,
      editData: { email: 'operator@example.test' },
      onSuccess,
      'onUpdate:visible': onVisibleUpdate
    })
    const buttons = mounted.root.querySelectorAll<HTMLButtonElement>('button')
    buttons[buttons.length - 1].click()
    await vi.waitFor(() => expect(editUser).toHaveBeenCalledOnce())
    await flushUI()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onVisibleUpdate).not.toHaveBeenCalled()
    expect(window.$message?.success).not.toHaveBeenCalled()

    buttons[buttons.length - 1].click()
    await vi.waitFor(() => expect(editUser).toHaveBeenCalledTimes(2))
    mounted.unmount()
  })
})
