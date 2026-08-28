import { createApp, defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NSwitch } from 'naive-ui'
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
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function mountDiagnosis() {
  const root = document.createElement('div')
  const app = createApp(DeviceDiagnosis, { id: 'device-1' })
  app.component('NButton', ButtonStub)
  app.component('NNumberAnimation', NumberAnimationStub)
  app.component('NSwitch', NSwitch)
  ;['NIcon', 'NFlex', 'NCard', 'NText', 'NDataTable', 'NTooltip'].forEach(name =>
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
  const diagnosticsFailure = {
    data: null,
    error: {
      message: 'diagnostics unavailable',
      status: 503,
      code: 'ERR_BAD_RESPONSE',
      data: { message: 'diagnostics unavailable' }
    }
  }

  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    messageHandle.destroy.mockReset()
    api.deviceDiagnostics.mockResolvedValue(diagnosticsFailure)
    api.getDeviceDebugStatus.mockResolvedValue({ data: { enabled: false } })
    api.setDeviceDebugStatus.mockResolvedValue({ data: {} })
    api.getDeviceDebugLogs.mockResolvedValue({ data: { list: [] } })
    window.$message = {
      destroyAll: vi.fn(),
      error: vi.fn(() => messageHandle)
    } as unknown as typeof window.$message
  })

  it('records the current failure and owns only its own user message', async () => {
    const { app } = mountDiagnosis()

    await vi.waitFor(() => {
      expect(window.$message?.error).toHaveBeenCalledWith('获取设备诊断信息失败：diagnostics unavailable')
    })
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()

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
    const { app, root } = mountDiagnosis()

    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledOnce())
    root.querySelector<HTMLButtonElement>('button')!.click()
    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(root.textContent).toContain('80'))

    olderRequest.resolve({
      data: null,
      error: { message: 'stale diagnostics failure', status: 503, code: 'ERR_BAD_RESPONSE' }
    })
    await flushUI()

    expect(root.textContent).toContain('80')
    expect(window.$message?.error).not.toHaveBeenCalled()
    app.unmount()
  })

  it('does not report a request that fails after unmount', async () => {
    const pendingRequest = deferred<unknown>()
    api.deviceDiagnostics.mockReset().mockImplementationOnce(() => pendingRequest.promise)
    const { app } = mountDiagnosis()

    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledOnce())
    app.unmount()
    pendingRequest.resolve({
      data: null,
      error: { message: 'unmounted diagnostics failure', status: 503, code: 'ERR_BAD_RESPONSE' }
    })
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
  })

  it('leaves 401 failures to the shared authentication error handler', async () => {
    api.deviceDiagnostics.mockReset().mockResolvedValue({
      data: null,
      error: { message: '登录已过期', status: 401, code: 'ERR_BAD_REQUEST' }
    })
    const { app } = mountDiagnosis()

    await vi.waitFor(() => expect(api.deviceDiagnostics).toHaveBeenCalledOnce())
    await flushUI()

    expect(window.$message?.error).not.toHaveBeenCalled()
    expect(window.$message?.destroyAll).not.toHaveBeenCalled()
    app.unmount()
  })

  it('keeps the real switch unchanged when enabling debug logs fails', async () => {
    api.setDeviceDebugStatus.mockResolvedValue({
      data: null,
      error: { message: 'debug unavailable', status: 503, code: 'ERR_BAD_RESPONSE' }
    })
    const { app, root } = mountDiagnosis()

    await vi.waitFor(() => expect(api.getDeviceDebugStatus).toHaveBeenCalledOnce())
    const switchElement = root.querySelector<HTMLElement>('[role="switch"]')!
    expect(switchElement).toBeTruthy()
    expect(switchElement.getAttribute('aria-checked')).toBe('false')

    switchElement.click()
    await vi.waitFor(() => {
      expect(api.setDeviceDebugStatus).toHaveBeenCalledWith('device-1', { enabled: true })
    })
    await flushUI()

    expect(switchElement.getAttribute('aria-checked')).toBe('false')
    app.unmount()
  })

  it('waits three seconds after a log request completes before polling again', async () => {
    vi.useFakeTimers()
    const firstLogs = deferred<any>()
    api.getDeviceDebugLogs.mockReset().mockReturnValueOnce(firstLogs.promise).mockResolvedValue({ data: { list: [] } })
    const { app } = mountDiagnosis()
    try {
      await flushUI()
      expect(api.getDeviceDebugLogs).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(api.getDeviceDebugLogs).toHaveBeenCalledOnce()

      firstLogs.resolve({ data: { list: [] } })
      await flushUI()
      await vi.advanceTimersByTimeAsync(2999)
      expect(api.getDeviceDebugLogs).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1)
      expect(api.getDeviceDebugLogs).toHaveBeenCalledTimes(2)
    } finally {
      app.unmount()
      vi.useRealTimers()
    }
  })

  it('renders polling failures locally and clears the error after recovery', async () => {
    vi.useFakeTimers()
    api.getDeviceDebugLogs
      .mockReset()
      .mockResolvedValueOnce({
        data: null,
        error: { message: '日志服务暂不可用', status: 503, code: 'ERR_BAD_RESPONSE' }
      })
      .mockResolvedValue({ data: { list: [] } })
    const { app, root } = mountDiagnosis()
    try {
      await flushUI()
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('日志服务暂不可用')
      expect(window.$message?.error).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(3000)
      await flushUI()
      expect(root.querySelector('[role="alert"]')).toBeNull()
    } finally {
      app.unmount()
      vi.useRealTimers()
    }
  })

  it('reports an unexpected exception with the generic diagnostic message', async () => {
    api.deviceDiagnostics.mockReset().mockRejectedValue(new Error('unexpected client failure'))
    const { app } = mountDiagnosis()

    await vi.waitFor(() => {
      expect(window.$message?.error).toHaveBeenCalledWith('获取设备诊断信息失败，请稍后重试')
    })
    app.unmount()
  })
})
