import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  dataScriptAdd: vi.fn(),
  dataScriptDel: vi.fn(),
  dataScriptEdit: vi.fn(),
  dataScriptQuiz: vi.fn(),
  getDataScriptList: vi.fn(),
  setDeviceScriptEnable: vi.fn()
}))
const dialog = vi.hoisted(() => ({ warning: vi.fn() }))
const message = vi.hoisted(() => ({ error: vi.fn() }))
const form = vi.hoisted(() => ({ restoreValidation: vi.fn(), validate: vi.fn() }))
const routerHooks = vi.hoisted(() => ({ onBeforeRouteLeave: vi.fn() }))

vi.mock('@/service/api/device', () => api)
vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  onBeforeRouteLeave: routerHooks.onBeforeRouteLeave
}))
vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    NButton: defineComponent({
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.())
      }
    }),
    useDialog: () => dialog,
    useMessage: () => message
  }
})
vi.mock('@/components/dev-card-item/index.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { title: String },
      setup(props, { slots }) {
        return () =>
          h('article', { 'data-title': props.title }, [
            h('strong', props.title),
            ...(slots.default?.() || []),
            ...(slots['top-right-icon']?.() || []),
            ...(slots.footer?.() || [])
          ])
      }
    })
  }
})
vi.mock('./components/lua-editor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    __esModule: true,
    default: defineComponent({
      props: { options: Object },
      setup(props) {
        return () =>
          h('div', {
            class: 'lua-editor',
            'data-read-only': String(Boolean((props.options as { readOnly?: boolean } | undefined)?.readOnly))
          })
      }
    })
  }
})

import DataHandle from './data-handle.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const SlotStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', Object.values(slots).flatMap(slot => slot?.() || []))
  }
})
const FormStub = defineComponent({
  props: { disabled: Boolean },
  setup(props, { slots, expose }) {
    expose(form)
    return () => h('form', { 'data-disabled': String(props.disabled) }, slots.default?.())
  }
})
const ModalStub = defineComponent({
  props: { show: Boolean, maskClosable: Boolean, closeOnEsc: Boolean },
  emits: ['update:show'],
  setup(props, { emit, slots }) {
    return () =>
      props.show
        ? h(
            'section',
            {
              class: 'modal',
              'data-mask-closable': String(props.maskClosable),
              'data-close-on-esc': String(props.closeOnEsc)
            },
            [
              h('button', { class: 'modal-close-request', onClick: () => emit('update:show', false) }, 'close'),
              ...Object.values(slots).flatMap(slot => slot?.() || [])
            ]
          )
        : null
  }
})
const SelectStub = defineComponent({
  emits: ['update:value'],
  setup(_, { emit }) {
    return () => h('button', { class: 'script-select', onClick: () => emit('update:value', 'A') }, 'select A')
  }
})
const InputStub = defineComponent({
  props: { value: [String, Number] },
  setup(props) {
    return () => h('textarea', { class: 'input-value', value: String(props.value ?? '') }, String(props.value ?? ''))
  }
})
const SwitchStub = defineComponent({
  props: { value: [String, Boolean] },
  emits: ['update:value'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        { class: 'script-switch', onClick: () => emit('update:value', props.value === 'Y' ? 'N' : 'Y') },
        String(props.value)
      )
  }
})

function mountDataHandle() {
  const root = document.createElement('div')
  const configInfo = reactive({ id: 'config-1' })
  const host = defineComponent({
    setup: () => () => h(DataHandle, { configInfo })
  })
  const app = createApp(host)
  app.config.globalProperties.getPlatform = () => false
  app.component('NForm', FormStub)
  app.component('NModal', ModalStub)
  app.component('NSelect', SelectStub)
  app.component('NInput', InputStub)
  app.component('NSwitch', SwitchStub)
  ;['NEmpty', 'NGrid', 'NGridItem', 'NFormItem', 'NFlex', 'NIcon'].forEach(name => app.component(name, SlotStub))
  app.mount(root)
  return { app, configInfo, root }
}

function script(id: string, name: string) {
  return {
    id,
    name,
    content: 'return msg',
    description: `${name} description`,
    device_config_id: 'config-1',
    enable_flag: 'Y',
    script_type: 'A'
  }
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('data processing request ownership', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    dialog.warning.mockReset()
    message.error.mockReset()
    form.restoreValidation.mockReset()
    form.validate.mockReset()
    form.validate.mockResolvedValue(undefined)
    routerHooks.onBeforeRouteLeave.mockClear()
    api.dataScriptAdd.mockResolvedValue({ data: {}, error: null })
    api.dataScriptDel.mockResolvedValue({ data: {}, error: null })
    api.dataScriptEdit.mockResolvedValue({ data: {}, error: null })
    api.dataScriptQuiz.mockResolvedValue({ data: { code: 200, data: 'ok' }, error: null })
    api.setDeviceScriptEnable.mockResolvedValue({ data: {}, error: null })
  })

  it('ignores an older list response after the filter starts a newer request', async () => {
    const older = deferred<any>()
    const newer = deferred<any>()
    api.getDataScriptList.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const { app, root } = mountDataHandle()

    await vi.waitFor(() => expect(api.getDataScriptList).toHaveBeenCalledOnce())
    root.querySelector<HTMLButtonElement>('.script-select')!.click()
    await vi.waitFor(() => expect(api.getDataScriptList).toHaveBeenCalledTimes(2))

    newer.resolve({ data: { list: [script('new', 'new script')], total: 1 }, error: null })
    await vi.waitFor(() => expect(root.textContent).toContain('new script'))
    older.resolve({ data: { list: [script('old', 'old script')], total: 1 }, error: null })
    await flushUI()

    expect(root.textContent).toContain('new script')
    expect(root.textContent).not.toContain('old script')
    app.unmount()
  })

  it('keeps a newer Lua modal result and prevents a debug double click', async () => {
    const firstQuiz = deferred<any>()
    const secondQuiz = deferred<any>()
    api.getDataScriptList.mockResolvedValue({
      data: { list: [script('a', 'script A'), script('b', 'script B')], total: 2 },
      error: null
    })
    api.dataScriptQuiz.mockReturnValueOnce(firstQuiz.promise).mockReturnValueOnce(secondQuiz.promise)
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(2))

    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await nextTick()
    const debugButton = root.querySelector<HTMLButtonElement>('.modal form button[type="primary"]')!
    debugButton.click()
    debugButton.click()
    await vi.waitFor(() => expect(api.dataScriptQuiz).toHaveBeenCalledOnce())

    const cancelButton = root.querySelector<HTMLButtonElement>('.modal [justify="end"] button')!
    cancelButton.click()
    await nextTick()
    root.querySelectorAll<HTMLElement>('article[data-title="script B"] button')[1].click()
    await nextTick()
    root.querySelector<HTMLButtonElement>('.modal form button[type="primary"]')!.click()
    await vi.waitFor(() => expect(api.dataScriptQuiz).toHaveBeenCalledTimes(2))

    secondQuiz.resolve({ data: { code: 200, data: 'result B' }, error: null })
    await vi.waitFor(() => expect(root.textContent).toContain('result B'))
    firstQuiz.resolve({ data: { code: 200, data: 'stale result A' }, error: null })
    await flushUI()

    expect(root.textContent).toContain('result B')
    expect(root.textContent).not.toContain('stale result A')
    app.unmount()
  })

  it('does not start an old debug request after its modal closes during validation', async () => {
    const validation = deferred<void>()
    form.validate.mockReturnValueOnce(validation.promise)
    api.getDataScriptList.mockResolvedValue({
      data: { list: [script('a', 'script A'), script('b', 'script B')], total: 2 },
      error: null
    })
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(2))
    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeTruthy())

    root.querySelector<HTMLButtonElement>('.modal form button[type="primary"]')!.click()
    await vi.waitFor(() => expect(form.validate).toHaveBeenCalledOnce())
    root.querySelector<HTMLButtonElement>('.modal [justify="end"] button')!.click()
    root.querySelectorAll<HTMLElement>('article[data-title="script B"] button')[1].click()
    validation.resolve()
    await flushUI()

    expect(api.dataScriptQuiz).not.toHaveBeenCalled()
    expect(root.querySelector('.modal')).toBeTruthy()
    app.unmount()
  })

  it('clears stale scripts and disables writes when a switched query fails', async () => {
    const failedQuery = deferred<any>()
    api.getDataScriptList
      .mockResolvedValueOnce({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
      .mockReturnValueOnce(failedQuery.promise)
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))

    root.querySelector<HTMLButtonElement>('.script-select')!.click()
    await vi.waitFor(() => expect(api.getDataScriptList).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(0))

    failedQuery.resolve({ data: null, error: { message: 'Unavailable', status: 503 } })
    await flushUI()

    const addButton = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button =>
      button.textContent?.includes('新增数据处理')
    )!
    expect(addButton.disabled).toBe(true)
    app.unmount()
  })

  it('blocks an old switch immediately when the filter changes', async () => {
    api.getDataScriptList
      .mockResolvedValueOnce({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    const oldSwitch = root.querySelector<HTMLButtonElement>('.script-switch')!

    root.querySelector<HTMLButtonElement>('.script-select')!.click()
    oldSwitch.click()

    expect(api.setDeviceScriptEnable).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(0))
    app.unmount()
  })

  it('applies an enable change only after one successful request', async () => {
    const enableRequest = deferred<any>()
    api.getDataScriptList.mockResolvedValue({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
    api.setDeviceScriptEnable.mockReturnValue(enableRequest.promise)
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    const scriptSwitch = root.querySelector<HTMLButtonElement>('.script-switch')!

    scriptSwitch.click()
    scriptSwitch.click()
    await vi.waitFor(() => expect(api.setDeviceScriptEnable).toHaveBeenCalledOnce())
    expect(api.setDeviceScriptEnable).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', enable_flag: 'N' }))
    expect(scriptSwitch.textContent).toBe('Y')

    enableRequest.resolve({ data: {}, error: null })
    await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('.script-switch')?.textContent).toBe('N'))
    app.unmount()
  })

  it('prevents closing the Lua modal while a save is in flight', async () => {
    const saveRequest = deferred<any>()
    api.getDataScriptList.mockResolvedValue({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
    api.dataScriptEdit.mockReturnValue(saveRequest.promise)
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await nextTick()

    const actionButtons = root.querySelectorAll<HTMLButtonElement>('.modal [justify="end"] button')
    actionButtons[1].click()
    await vi.waitFor(() => expect(api.dataScriptEdit).toHaveBeenCalledOnce())
    expect(actionButtons[0].disabled).toBe(true)
    expect(root.querySelector('form')?.getAttribute('data-disabled')).toBe('true')
    expect(root.querySelector('.lua-editor')?.getAttribute('data-read-only')).toBe('true')
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>('.editor-toolbar button')).every(button => button.disabled)).toBe(
      true
    )
    expect(root.querySelector('.modal')?.getAttribute('data-mask-closable')).toBe('false')
    expect(root.querySelector('.modal')?.getAttribute('data-close-on-esc')).toBe('false')
    const leaveGuard = routerHooks.onBeforeRouteLeave.mock.calls.at(-1)?.[0] as () => boolean
    expect(leaveGuard()).toBe(false)
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
    actionButtons[0].click()
    expect(root.querySelector('.modal')).toBeTruthy()
    root.querySelector<HTMLButtonElement>('.modal-close-request')!.click()
    await nextTick()
    expect(root.querySelector('.modal')).toBeTruthy()

    saveRequest.resolve({ data: {}, error: null })
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeNull())
    expect(leaveGuard()).toBe(true)
    app.unmount()
  })

  it('closes an old script editor when its device configuration changes', async () => {
    api.getDataScriptList
      .mockResolvedValueOnce({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const { app, configInfo, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeTruthy())

    configInfo.id = 'config-2'
    await vi.waitFor(() => expect(api.getDataScriptList).toHaveBeenCalledTimes(2))

    expect(root.querySelector('.modal')).toBeNull()
    expect(root.querySelectorAll('article')).toHaveLength(0)
    expect(api.dataScriptEdit).not.toHaveBeenCalled()
    app.unmount()
  })

  it('does not execute an old delete confirmation after the query changes', async () => {
    api.getDataScriptList
      .mockResolvedValueOnce({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const { app, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[2].click()
    expect(dialog.warning).toHaveBeenCalledOnce()

    root.querySelector<HTMLButtonElement>('.script-select')!.click()
    await vi.waitFor(() => expect(api.getDataScriptList).toHaveBeenCalledTimes(2))
    await dialog.warning.mock.calls[0][0].onPositiveClick()

    expect(api.dataScriptDel).not.toHaveBeenCalled()
    app.unmount()
  })

  it('closes an invalidated editor after an in-flight save fails', async () => {
    const saveRequest = deferred<any>()
    api.getDataScriptList
      .mockResolvedValueOnce({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    api.dataScriptEdit.mockReturnValue(saveRequest.promise)
    const { app, configInfo, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeTruthy())

    root.querySelectorAll<HTMLButtonElement>('.modal [justify="end"] button')[1].click()
    await vi.waitFor(() => expect(api.dataScriptEdit).toHaveBeenCalledOnce())
    configInfo.id = 'config-2'
    await vi.waitFor(() => expect(api.getDataScriptList).toHaveBeenCalledTimes(2))
    expect(root.querySelector('.modal')).toBeTruthy()

    saveRequest.resolve({ data: null, error: { message: 'Save failed', status: 503 } })
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeNull())
    app.unmount()
  })

  it('does not submit an old editor when its configuration changes during validation', async () => {
    const validation = deferred<void>()
    form.validate.mockReturnValue(validation.promise)
    api.getDataScriptList
      .mockResolvedValueOnce({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const { app, configInfo, root } = mountDataHandle()
    await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1))
    root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeTruthy())

    root.querySelectorAll<HTMLButtonElement>('.modal [justify="end"] button')[1].click()
    await vi.waitFor(() => expect(form.validate).toHaveBeenCalledOnce())
    configInfo.id = 'config-2'
    validation.resolve()
    await vi.waitFor(() => expect(root.querySelector('.modal')).toBeNull())

    expect(api.dataScriptEdit).not.toHaveBeenCalled()
    app.unmount()
  })

  it('handles rejected list and save promises without leaving an unhandled UI state', async () => {
    api.getDataScriptList.mockRejectedValueOnce(new TypeError('list invariant failed'))
    const firstMount = mountDataHandle()
    await vi.waitFor(() => expect(message.error).toHaveBeenCalledOnce())
    expect(firstMount.root.querySelectorAll('article')).toHaveLength(0)
    firstMount.app.unmount()

    message.error.mockReset()
    api.getDataScriptList.mockResolvedValue({ data: { list: [script('a', 'script A')], total: 1 }, error: null })
    api.dataScriptEdit.mockRejectedValueOnce(new TypeError('save invariant failed'))
    const secondMount = mountDataHandle()
    await vi.waitFor(() => expect(secondMount.root.querySelectorAll('article')).toHaveLength(1))
    secondMount.root.querySelectorAll<HTMLElement>('article[data-title="script A"] button')[1].click()
    await vi.waitFor(() => expect(secondMount.root.querySelector('.modal')).toBeTruthy())

    secondMount.root.querySelectorAll<HTMLButtonElement>('.modal [justify="end"] button')[1].click()
    await vi.waitFor(() => expect(message.error).toHaveBeenCalledOnce())

    expect(secondMount.root.querySelector('.modal')).toBeTruthy()
    await vi.waitFor(() => expect(secondMount.root.querySelector('form')?.getAttribute('data-disabled')).toBe('false'))
    secondMount.app.unmount()
  })
})
