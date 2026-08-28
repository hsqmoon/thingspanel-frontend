import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deviceAlarmStatus = vi.hoisted(() => vi.fn())
vi.mock('@/service/api/device', () => ({ deviceAlarmStatus }))

import { useAlarmPush } from './useAlarmPush'

describe('useAlarmPush recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    deviceAlarmStatus.mockReset()
    window.$message = { error: vi.fn() } as unknown as typeof window.$message
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.$message
  })

  it('stops polling and shows a recoverable UI error after an unexpected failure', async () => {
    deviceAlarmStatus.mockRejectedValue(new TypeError('invalid alarm payload'))
    const alarmPush = useAlarmPush(
      ref('device-1'),
      ref([{ id: 'alarm', name: '告警', type: 'json', dataType: 'event' }]),
      vi.fn()
    )

    alarmPush.start()
    await vi.waitFor(() => expect(window.$message?.error).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(60_000)

    expect(deviceAlarmStatus).toHaveBeenCalledOnce()
  })
})
