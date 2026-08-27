import { createApp, defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeviceDiagnosis from './device-diagnosis.vue'

const api = vi.hoisted(() => ({
  deviceDiagnostics: vi.fn(),
  getDeviceDebugStatus: vi.fn(),
  setDeviceDebugStatus: vi.fn(),
  getDeviceDebugLogs: vi.fn()
}))

vi.mock('@/service/api', () => api)

const StubComponent = defineComponent({
  setup(_, { slots }) {
    return () => h('div', Object.values(slots).flatMap(slot => slot?.() || []))
  }
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  }
})

const NumberAnimationStub = defineComponent({
  props: {
    to: {
      type: Number,
      required: true
    }
  },
  setup(props) {
    return () => h('span', { class: 'number-animation' }, String(props.to))
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountDiagnosis() {
  const root = document.createElement('div')
  const app = createApp(DeviceDiagnosis, { id: 'device-1' })
  app.component('NButton', ButtonStub)
  app.component('NNumberAnimation', NumberAnimationStub)
  ;['NIcon', 'NFlex', 'NCard', 'NText', 'NDataTable', 'NTooltip', 'NSwitch'].forEach(name =>
    app.component(name, StubComponent)
  )
  app.mount(root)
  return { app, root }
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('device diagnosis errors', () => {
  const messageHandle = { destroy: vi.fn() }

  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    messageHandle.destroy.mockReset()
    api.deviceDiagnostics.mockRejectedValue(new Error('diagnostics unavailable'))
    api.getDeviceDebugStatus.mockResolvedValue({ data: { enabled: false } })
    api.getDeviceDebugLogs.mockResolvedValue({ data: { list: [] } })
    window.$message = {
      destroyAll: vi.fn(),
      error: vi.fn(() => messageHandle)
    } as unknown as typeof window.$message
  })

  it('records the current failure and owns only its own user message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = mountDiagnosis()

    await vi.waitFor(() => {
      expect(window.$message?.error).toHaveBeenCalledWith('获取设备诊断信息失败，请稍后重试')
    })
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(consoleError.mock.calls.some(call => call.includes('Failed to fetch device diagnostics'))).toBe(true)

    app.unmount()
    expect(messageHandle.destroy).toHaveBeenCalledOnce()
  })

  it('ignores an older failure after a newer refresh succeeds', async () => {
    const olderRequest = deferred<unknown>()
    api.deviceDiagnostics
      .mockReset()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce({
        data: {
          stats: {
            uplink: { success: 8, total: 10, success_rate: 80 }
          }
        }
      })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app, root } = mountDiagnosis()

    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledOnce())
    root.querySelector<HTMLButtonElement>('button')!.click()
    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(root.textContent).toContain('80'))

    olderRequest.reject(new Error('stale diagnostics failure'))
    await flushUI()

    expect(root.textContent).toContain('80')
    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    app.unmount()
  })

  it('does not report a request that fails after unmount', async () => {
    const pendingRequest = deferred<unknown>()
    api.deviceDiagnostics.mockReset().mockImplementationOnce(() => pendingRequest.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = mountDiagnosis()

    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledOnce())
    app.unmount()
    pendingRequest.reject(new Error('unmounted diagnostics failure'))
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })
})
