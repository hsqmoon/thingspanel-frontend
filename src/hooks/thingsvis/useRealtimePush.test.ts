import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/storage', () => ({ localStg: { get: () => 'token' } }))
vi.mock('@/utils/common/tool', () => ({ getWebsocketServerUrl: () => 'wss://example.test/api/v1' }))

import { useRealtimePush } from './useRealtimePush'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: string[] = []
  closed = false

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(value: string) {
    this.sent.push(value)
  }

  close() {
    this.closed = true
  }

  emitClose(code: number) {
    this.onclose?.({ code, reason: '' } as CloseEvent)
  }
}

describe('useRealtimePush websocket ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reconnects telemetry and status sockets independently', async () => {
    const push = useRealtimePush(ref('device-1'), ref([]), vi.fn(), vi.fn().mockResolvedValue(undefined))
    push.start()
    const telemetry = FakeWebSocket.instances.find(socket => socket.url.includes('/telemetry/'))!
    const status = FakeWebSocket.instances.find(socket => socket.url.includes('/device/online/'))!

    telemetry.emitClose(1006)
    await vi.advanceTimersByTimeAsync(3000)
    expect(FakeWebSocket.instances.filter(socket => socket.url.includes('/telemetry/'))).toHaveLength(2)
    expect(FakeWebSocket.instances.filter(socket => socket.url.includes('/device/online/'))).toHaveLength(1)
    expect(status.closed).toBe(false)

    status.emitClose(1006)
    await vi.advanceTimersByTimeAsync(3000)
    expect(FakeWebSocket.instances.filter(socket => socket.url.includes('/device/online/'))).toHaveLength(2)
    expect(FakeWebSocket.instances.filter(socket => socket.url.includes('/telemetry/'))).toHaveLength(2)
    push.stop()
  })

  it('does not reconnect or warn after a normal websocket close', async () => {
    const consoleWarn = vi.spyOn(console, 'warn')
    const push = useRealtimePush(ref('device-1'), ref([]), vi.fn(), vi.fn().mockResolvedValue(undefined))
    push.start()
    FakeWebSocket.instances.forEach(socket => socket.emitClose(1000))
    await vi.advanceTimersByTimeAsync(6000)

    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(consoleWarn).not.toHaveBeenCalled()
    push.stop()
  })
})
