import { createApp, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  attributeDataPub: vi.fn(),
  commandDataPub: vi.fn(),
  deviceAlarmStatus: vi.fn(),
  getAttributeDataSet: vi.fn(),
  telemetryDataCurrent: vi.fn(),
  telemetryDataHistoryList: vi.fn(),
  telemetryDataPub: vi.fn()
}))

vi.mock('@/service/api/device', () => api)
vi.mock('@/config/runtime-features', () => ({ isThingsVisEnabled: () => true }))
vi.mock('@/utils/thingsvis', () => ({ getThingsVisToken: vi.fn().mockResolvedValue('thingsvis-token') }))
vi.mock('@/utils/thingsvis/constants', () => ({
  getPlatformApiBase: () => 'https://iot.example.test/api/v1',
  getThingsVisApiBase: () => 'https://iot.example.test/thingsvis/api'
}))
vi.mock('@/utils/storage', () => ({ localStg: { get: vi.fn() } }))
vi.mock('@/utils/thingsvis/sdk/client', () => ({
  ThingsVisClient: class {
    ready = false
    destroy() {}
    loadWidgetConfig() {}
    on() {}
    pushPlatformFieldData() {}
    pushPlatformFieldHistory() {}
    requestSave() {}
    updateSchema() {}
  }
}))

import ThingsVisWidget from './ThingsVisWidget.vue'
import ThingsVisViewer from './ThingsVisViewer.vue'
import { useAlarmPush } from '@/hooks/thingsvis/useAlarmPush'

const requestFailure = {
  data: null,
  error: {
    message: 'platform unavailable',
    status: 503,
    code: 'ERR_BAD_RESPONSE'
  }
}

function mountWidget() {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(ThingsVisWidget, {
    config: {},
    deviceId: 'device-1',
    mode: 'viewer'
  })
  app.mount(root)
  return { app, root }
}

function mountViewer() {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(ThingsVisViewer, {
    config: {},
    height: '400px'
  })
  app.mount(root)
  return { app, root }
}

function createMessageSource() {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const source = iframe.contentWindow!
  const postMessage = vi.spyOn(source, 'postMessage').mockImplementation(() => {})
  return { postMessage, source }
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('ThingsVis FlatRequest failures', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.values(api).forEach(mock => mock.mockReset())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns a failed control response without a success echo', async () => {
    api.telemetryDataPub.mockResolvedValue(requestFailure)
    const { app } = mountWidget()
    const { postMessage, source } = createMessageSource()
    await flushUI()

    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: {
          type: 'tv:platform-write',
          requestId: 'write-1',
          payload: { dataSourceId: 'source-1', deviceId: 'device-1', data: { power: true } }
        }
      })
    )

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce())
    expect(postMessage.mock.calls[0]?.[0]).toEqual({
      type: 'tv:platform-write-result',
      requestId: 'write-1',
      success: false,
      error: 'platform unavailable'
    })
    expect(postMessage.mock.calls[0]?.[0]).not.toHaveProperty('echo')
    app.unmount()
  })

  it('returns an explicit alarm error instead of publishing cleared alarm fields', async () => {
    api.deviceAlarmStatus.mockResolvedValue(requestFailure)
    const { app } = mountWidget()
    const { postMessage, source } = createMessageSource()
    await flushUI()

    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: {
          type: 'thingsvis:requestFieldData',
          requestId: 'fields-1',
          payload: {
            dataSourceId: 'source-1',
            deviceId: 'device-1',
            fieldIds: ['device_alarm_active', 'device_alarm_count']
          }
        }
      })
    )

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce())
    expect(postMessage.mock.calls[0]?.[0]).toEqual({
      type: 'tv:platform-data',
      requestId: 'fields-1',
      payload: {
        dataSourceId: 'source-1',
        deviceId: 'device-1',
        success: false,
        error: 'platform unavailable'
      }
    })
    expect(postMessage.mock.calls[0]?.[0]).not.toHaveProperty('payload.fields')
    app.unmount()
  })

  it('returns an explicit viewer error when one fulfilled FlatRequest result failed', async () => {
    api.telemetryDataCurrent.mockResolvedValue(requestFailure)
    api.getAttributeDataSet.mockResolvedValue({ data: [], error: null })
    const { app, root } = mountViewer()
    await vi.waitFor(() => expect(root.querySelector('iframe')).not.toBeNull())
    const postMessage = vi
      .spyOn(root.querySelector('iframe')!.contentWindow!, 'postMessage')
      .mockImplementation(() => {})

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'thingsvis:requestFieldData',
          requestId: 'viewer-fields-1',
          payload: {
            dataSourceId: 'source-1',
            deviceId: 'device-1',
            fieldIds: ['temperature']
          }
        }
      })
    )

    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.some(call => {
          const response = call[0] as any
          return (
            response?.type === 'tv:platform-data' &&
            response.requestId === 'viewer-fields-1' &&
            response.payload?.success === false &&
            response.payload?.error === 'platform unavailable' &&
            response.payload?.fields === undefined
          )
        })
      ).toBe(true)
    )
    app.unmount()
  })

  it('does not clear pushed alarms when polling resolves with a failure', async () => {
    api.deviceAlarmStatus.mockResolvedValue(requestFailure)
    const pushData = vi.fn()
    const alarmPush = useAlarmPush(
      ref('device-1'),
      ref([{ id: 'overload', name: 'Overload', type: 'boolean', dataType: 'event' }]),
      pushData
    )

    alarmPush.start()
    await vi.waitFor(() => expect(api.deviceAlarmStatus).toHaveBeenCalledOnce())
    expect(pushData).not.toHaveBeenCalled()
    alarmPush.stop()
  })
})
