import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const personalApi = vi.hoisted(() => ({
  changeInformation: vi.fn(),
  fetchUserInfo: vi.fn(),
  passwordModification: vi.fn()
}))
const validate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/service/api/personal-center', () => personalApi)
vi.mock('@/hooks/common/form', () => ({ useNaiveForm: () => ({ validate }) }))
vi.mock('@/utils/form/rule', () => ({ getConfirmPwdRule: () => [] }))
vi.mock('@/utils/storage', () => ({ localStg: { get: () => 'token' } }))
vi.mock('@/utils/common/tool', () => ({
  encryptDataByRsa: (value: string) => value,
  generateRandomHexString: () => 'salt',
  getDemoServerUrl: () => 'https://iot.example.test/api/v1',
  validName: () => true,
  validPasswordByExp: () => true
}))
vi.mock('~/env.config', () => ({ createProxyPattern: () => '/proxy-default' }))
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('@/components/common/ProvinceCityDistrictSelector.vue', () => ({ default: { render: () => null } }))
vi.mock('naive-ui', async () => {
  const { defineComponent: define, h: render } = await import('vue')
  return {
    NButton: define({
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => render('button', attrs, slots.default?.())
      }
    })
  }
})

import PersonalCenter from '@/views/personal-center/index.vue'

const requestFailure = (messageText = 'service unavailable', status = 503) => ({
  data: null,
  error: { message: messageText, status, code: 'ERR_BAD_RESPONSE' }
})
const success = <T>(data: T) => ({ data, error: null })
const profile = {
  additional_info: '{}',
  name: 'Existing User',
  email: 'existing@example.test',
  phone_number: '+8613800000000',
  authority: 'TENANT_ADMIN',
  organization: 'NSNR',
  timezone: 'Asia/Shanghai',
  default_language: 'zh-CN',
  avatar_url: './avatar/old.png',
  address: { province: 'Fujian', city: 'Fuzhou', district: 'Jinan', detailed_address: 'Old address' }
}

const passthrough = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, Object.values(slots).flatMap(slot => slot?.() || []))
  }
})
const mountedApps: ReturnType<typeof createApp>[] = []

function mountPersonalCenter() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(PersonalCenter)
  ;['NAvatar', 'NCard', 'NDivider', 'NForm', 'NFormItem', 'NInput', 'NSelect', 'NUpload'].forEach(name =>
    app.component(name, passthrough)
  )
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
  Object.values(personalApi).forEach(mock => mock.mockReset())
  validate.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
  window.$message = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    destroyAll: vi.fn()
  } as any
})

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

describe('personal center FlatResponse failure handling', () => {
  it('keeps profile editing open and does not report a 401 write failure as success', async () => {
    personalApi.fetchUserInfo.mockResolvedValue(success(profile))
    personalApi.changeInformation.mockResolvedValue(requestFailure('expired', 401))
    const vm = mountPersonalCenter()
    await vi.waitFor(() => expect(vm.userInfoData.name).toBe('Existing User'))

    vm.editName()
    vm.userInfoData.name = 'Unsaved Name'
    await vm.updataUserInfo()

    expect(vm.editType).toBe(true)
    expect(vm.userInfoData.name).toBe('Unsaved Name')
    expect(window.$message?.success).not.toHaveBeenCalled()
    expect(window.$message?.error).not.toHaveBeenCalled()
  })

  it('accepts a successful void update without confusing its null data with failure', async () => {
    personalApi.fetchUserInfo.mockResolvedValue(success(profile))
    personalApi.changeInformation.mockResolvedValue(success(null))
    const vm = mountPersonalCenter()
    await vi.waitFor(() => expect(vm.userInfoData.name).toBe('Existing User'))

    vm.editName()
    await vm.updataUserInfo()

    expect(vm.editType).toBe(false)
    expect(window.$message?.success).toHaveBeenCalledOnce()
  })

  it('does not report password failure or replace an existing avatar after profile persistence fails', async () => {
    personalApi.fetchUserInfo.mockResolvedValue(success(profile))
    personalApi.passwordModification.mockResolvedValue(requestFailure('password failed'))
    personalApi.changeInformation.mockResolvedValue(requestFailure('avatar persistence failed'))
    const vm = mountPersonalCenter()
    await vi.waitFor(() => expect(vm.userInfoData.avatar_url).toBe('./avatar/old.png'))
    const oldHeadUrl = vm.headUrl

    vm.formData.old_password = 'old-password'
    vm.formData.password = 'new-password'
    vm.formData.passwords = 'new-password'
    await vm.submitPass()
    await vm.handleFinish({
      event: { target: { response: JSON.stringify({ code: 200, data: { path: './avatar/new.png' } }) } }
    })
    await flushUI()

    expect(vm.userInfoData.avatar_url).toBe('./avatar/old.png')
    expect(vm.headUrl).toBe(oldHeadUrl)
    expect(window.$message?.success).not.toHaveBeenCalled()
  })

  it('keeps the default profile when the initial read resolves as a failure', async () => {
    personalApi.fetchUserInfo.mockResolvedValue(requestFailure('profile unavailable'))
    const vm = mountPersonalCenter()
    await vi.waitFor(() => expect(personalApi.fetchUserInfo).toHaveBeenCalledOnce())
    await flushUI()

    expect(vm.userInfoData.name).toBe('')
    expect(vm.userInfoData.address).toEqual({ province: '', city: '', district: '', detailed_address: '' })
  })
})
