/**
 * useRealtimePush — tp-03
 * 使用 WebSocket 订阅设备遥测实时数据并推送到 ThingsVis。
 * 仅走 WS 通道；连接异常时自动重连。
 *
 * WS 端点：/api/v1/telemetry/datas/current/ws
 * 协议流程：
 *   1. 建立连接
 *   2. 客户端发送认证消息 { device_id, token }
 *   3. 服务端首先返回当前遥测属性
 *   4. 随后设备有推送便自动返回新数据
 *   5. 返回数据格式：{"humidity":5,"systime":"...","temperature":16.27}
 *   6. 客户端需发 ping 保持连接（间隔 < 60s）
 */

import { type Ref, ref } from 'vue'
import type { PlatformField } from '@/utils/thingsvis/types'
import { localStg } from '@/utils/storage'
import { getWebsocketServerUrl } from '@/utils/common/tool'

/** ping 间隔。服务端心跳窗口较短，需与现有稳定模块保持一致（8s）。 */
const PING_INTERVAL_MS = 8_000
const WS_RECONNECT_DELAY_MS = 3000

/**
 * 构建遥测 WebSocket URL
 *
 * 统一复用项目已有的 websocket 基地址，避免与 request/baseURL、代理前缀不一致。
 */
function buildTelemetryWsUrl(): string {
  return `${getWebsocketServerUrl()}/telemetry/datas/current/ws`
}

function buildDeviceStatusWsUrl(): string {
  return `${getWebsocketServerUrl()}/device/online/status/ws`
}

function extractFields(payload: unknown): Record<string, unknown> {
  const normalizeFlatObject = (obj: Record<string, unknown>) => {
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'systime') continue
      fields[k] = v
    }
    return fields
  }

  if (!payload) return {}

  if (Array.isArray(payload)) {
    const fields: Record<string, unknown> = {}
    payload.forEach(item => {
      if (!item || typeof item !== 'object') return
      const key = (item as any).key ?? (item as any).label
      if (!key || key === 'systime') return
      if ((item as any).value !== undefined) fields[key] = (item as any).value
    })
    return fields
  }

  if (typeof payload !== 'object') return {}
  const obj = payload as Record<string, unknown>

  if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) {
    return normalizeFlatObject(obj.fields as Record<string, unknown>)
  }

  if (obj.data !== undefined) {
    return extractFields(obj.data)
  }

  if (obj.payload !== undefined) {
    return extractFields(obj.payload)
  }

  return normalizeFlatObject(obj)
}

export function useRealtimePush(
  deviceId: Ref<string>,
  platformFields: Ref<PlatformField[]>,
  /** 推送单批次字段值到 ThingsVis */
  pushData: (fields: Record<string, unknown>) => void,
  /** 建连后拉一帧当前值，避免等待下一条 WS 才更新 */
  fetchLatest: () => Promise<void>
) {
  let ws: WebSocket | null = null
  let statusWs: WebSocket | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let statusPingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let statusReconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  const usingWebSocket = ref(false)

  const mapToPlatformFieldIds = (
    rawFields: Record<string, unknown>
  ): { fields: Record<string, unknown>; matched: boolean } => {
    const mapped: Record<string, unknown> = {}
    const fields = platformFields.value || []
    if (fields.length === 0) {
      return { fields: rawFields, matched: false }
    }

    fields.forEach(field => {
      const idVal = rawFields[field.id]
      const nameVal = rawFields[field.name]
      if (idVal !== undefined) {
        mapped[field.id] = idVal
      } else if (nameVal !== undefined) {
        mapped[field.id] = nameVal
      }
    })

    // Fallback: if no mapping matched, keep the original payload to avoid dropping data.
    if (Object.keys(mapped).length === 0) {
      return { fields: rawFields, matched: false }
    }
    return { fields: mapped, matched: true }
  }

  const clearTelemetryReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const clearStatusReconnectTimer = () => {
    if (statusReconnectTimer) {
      clearTimeout(statusReconnectTimer)
      statusReconnectTimer = null
    }
  }

  const scheduleTelemetryReconnect = () => {
    clearTelemetryReconnectTimer()
    reconnectTimer = setTimeout(() => {
      if (!destroyed) startWebSocket()
    }, WS_RECONNECT_DELAY_MS)
  }

  const scheduleStatusReconnect = () => {
    clearStatusReconnectTimer()
    statusReconnectTimer = setTimeout(() => {
      if (!destroyed) startStatusWebSocket()
    }, WS_RECONNECT_DELAY_MS)
  }

  const stopTelemetryWebSocket = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
    clearTelemetryReconnectTimer()
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
    usingWebSocket.value = false
  }

  const stopStatusWebSocket = () => {
    if (statusPingTimer) {
      clearInterval(statusPingTimer)
      statusPingTimer = null
    }
    clearStatusReconnectTimer()
    if (statusWs) {
      statusWs.onclose = null
      statusWs.close()
      statusWs = null
    }
  }

  const startWebSocket = () => {
    if (destroyed) return
    stopTelemetryWebSocket()

    const token = localStg.get('token') as string | undefined
    if (!token) {
      scheduleTelemetryReconnect()
      return
    }

    try {
      const wsUrl = buildTelemetryWsUrl()
      ws = new WebSocket(wsUrl)
    } catch {
      scheduleTelemetryReconnect()
      return
    }

    const socket = ws

    ws.onopen = () => {
      if (ws !== socket) return
      usingWebSocket.value = true
      clearTelemetryReconnectTimer()

      // 连接后发送认证消息：device_id + token
      socket.send(
        JSON.stringify({
          device_id: deviceId.value,
          token
        })
      )
      void fetchLatest()

      // 保持连接：ping 间隔 < 60s
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send('ping')
        }
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = event => {
      if (ws !== socket) return
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        const msg = JSON.parse(event.data)
        const rawFields = extractFields(msg)
        if (Object.keys(rawFields).length > 0) {
          const { fields: mappedFields } = mapToPlatformFieldIds(rawFields)
          pushData(mappedFields)
        }
      } catch {
        // 非 JSON 帧，忽略
      }
    }

    ws.onerror = () => undefined

    ws.onclose = event => {
      if (ws !== socket) return
      ws = null
      usingWebSocket.value = false
      if (pingTimer) {
        clearInterval(pingTimer)
        pingTimer = null
      }
      if (!destroyed && event.code !== 1000) scheduleTelemetryReconnect()
    }
  }

  const startStatusWebSocket = () => {
    if (destroyed) return
    stopStatusWebSocket()

    const token = localStg.get('token') as string | undefined
    if (!token) {
      scheduleStatusReconnect()
      return
    }

    try {
      const wsUrl = buildDeviceStatusWsUrl()
      statusWs = new WebSocket(wsUrl)
    } catch {
      scheduleStatusReconnect()
      return
    }

    const socket = statusWs

    statusWs.onopen = () => {
      if (statusWs !== socket) return
      clearStatusReconnectTimer()

      socket.send(
        JSON.stringify({
          device_id: deviceId.value,
          token
        })
      )

      statusPingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send('ping')
        }
      }, PING_INTERVAL_MS)
    }

    statusWs.onmessage = event => {
      if (statusWs !== socket) return
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        const msg = JSON.parse(event.data) as Record<string, unknown>
        if (typeof msg.is_online !== 'number') return

        pushData({
          is_online: msg.is_online,
          online_text: msg.is_online === 1 ? '在线' : '离线',
          online_status_updated_at: Date.now()
        })
      } catch {
        // ignore non-JSON frames
      }
    }

    statusWs.onerror = () => undefined

    statusWs.onclose = event => {
      if (statusWs !== socket) return
      statusWs = null
      if (statusPingTimer) {
        clearInterval(statusPingTimer)
        statusPingTimer = null
      }
      if (!destroyed && event.code !== 1000) scheduleStatusReconnect()
    }
  }

  const start = () => {
    destroyed = false
    clearTelemetryReconnectTimer()
    clearStatusReconnectTimer()
    startWebSocket()
    startStatusWebSocket()
  }

  const stop = () => {
    destroyed = true
    stopTelemetryWebSocket()
    stopStatusWebSocket()
  }

  return { start, stop, usingWebSocket }
}
