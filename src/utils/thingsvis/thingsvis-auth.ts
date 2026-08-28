/**
 * ThingsVis SSO Authentication Service
 * 实现 ThingsPanel Token 与 ThingsVis JWT Token 的交换
 */

import { localStg } from '@/utils/storage'
import type { SSOExchangeRequest, SSOExchangeResponse } from './types'
import { THINGSVIS_API_PROXY_PATH } from './constants'
import { resolveThingsVisSpaceId } from './space'

/**
 * ThingsVis SSO 认证服务类
 */
export class ThingsVisAuthService {
  private cachedToken: string | null = null
  private tokenExpiry: number = 0
  private cachedIdentityKey: string | null = null
  private exchangePromise: { epoch: number; identityKey: string | null; promise: Promise<string> } | null = null
  private identityEpoch = 0
  private thingsvisApiUrl: string
  private readonly thingsvisApiTarget: string
  private readonly networkFailureCooldownMs = 30_000
  private lastNetworkFailureAt: number = 0
  private lastNetworkFailureReason: string | null = null

  constructor() {
    // SSO API 地址
    // 前端固定请求代理路径 /thingsvis-api 以避免 CORS。
    // Vite 会将其重写为 `${VITE_THINGSVIS_API_URL}/api/v1/*`。
    this.thingsvisApiUrl = THINGSVIS_API_PROXY_PATH
    this.thingsvisApiTarget = import.meta.env.VITE_THINGSVIS_API_URL || 'http://localhost:8000'
  }

  private getFailureCooldownRemaining(): number {
    if (!this.lastNetworkFailureAt) return 0

    return Math.max(0, this.networkFailureCooldownMs - (Date.now() - this.lastNetworkFailureAt))
  }

  private markNetworkFailure(reason: string): Error {
    this.lastNetworkFailureAt = Date.now()
    this.lastNetworkFailureReason = reason

    return new Error(`ThingsVis SSO backend unavailable: ${this.thingsvisApiTarget} (${reason})`)
  }

  private clearNetworkFailure(): void {
    this.lastNetworkFailureAt = 0
    this.lastNetworkFailureReason = null
  }

  private isNetworkError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '')
    const normalized = message.toLowerCase()

    return (
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('load failed') ||
      normalized.includes('econnrefused')
    )
  }

  private getIdentityKey(userInfo: Api.Auth.UserInfo | null, platformToken = localStg.get('token')): string | null {
    if (!userInfo) return null
    return `${userInfo.userId || userInfo.id || ''}::${resolveThingsVisSpaceId(userInfo)}::${platformToken || ''}`
  }

  private shouldTreatResponseAsUnavailable(status: number, errorText: string): boolean {
    if ([502, 503, 504].includes(status)) return true

    return errorText.toLowerCase().includes('econnrefused')
  }

  /**
   * 等待 userInfo 就绪（处理首次登录时的竞态条件）
   * 当 loginByToken 还未完成 localStg.set('userInfo') 时，首页组件可能已挂载
   */
  private async waitForUserInfo(
    maxRetries: number = 5,
    intervalMs: number = 200
  ): Promise<Api.Auth.UserInfo | null> {
    let userInfo = localStg.get('userInfo')
    let retries = 0

    while (!userInfo && retries < maxRetries) {
      retries++
      await new Promise(resolve => setTimeout(resolve, intervalMs))
      userInfo = localStg.get('userInfo')
    }

    return userInfo
  }

  /**
   * 交换 ThingsPanel Token -> ThingsVis Token
   */
  async exchangeToken(epoch: number = this.identityEpoch): Promise<string> {
    try {
      const cooldownRemaining = this.getFailureCooldownRemaining()
      if (cooldownRemaining > 0) {
        const retryAfterSeconds = Math.ceil(cooldownRemaining / 1000)
        const reason = this.lastNetworkFailureReason || 'recent network failure'
        throw new Error(
          `ThingsVis SSO backend unavailable: ${this.thingsvisApiTarget} (${reason}; retry in ${retryAfterSeconds}s)`
        )
      }

      // 1. 获取当前 ThingsPanel 用户信息
      // 注意：首次登录时，userInfo 可能尚未写入 localStorage（竞态条件）
      // 需要等待 userInfo 就绪
      const userInfo = await this.waitForUserInfo()
      const tpToken = localStg.get('token')

      if (!tpToken) {
        throw new Error('ThingsPanel token not found')
      }

      if (!userInfo) {
        throw new Error('User info not found')
      }

      const resolvedSpaceId = resolveThingsVisSpaceId(userInfo)
      const identityKey = this.getIdentityKey(userInfo, tpToken)

      // 2. 构建 SSO 请求
      const request: SSOExchangeRequest = {
        platform: 'thingspanel',
        platformToken: tpToken,
        userInfo: {
          id: userInfo.userId || userInfo.id || '',
          email: userInfo.email || `${userInfo.userName}@thingspanel.local`,
          name: userInfo.userName || 'ThingsPanel User',
          tenantId: resolvedSpaceId
        }
      }

      // 3. 映射 ThingsPanel authority → ThingsVis role，用于注册时初始化默认看板
      const authority = userInfo.authority
      let role: SSOExchangeRequest['role']

      if (authority === 'SYS_ADMIN') {
        role = 'SUPER_ADMIN'
      } else if (authority === 'TENANT_ADMIN') {
        role = 'TENANT_ADMIN'
      } else {
        role = 'EDITOR'
      }

      request.role = role

      // 3. 调用 ThingsVis SSO API (通过代理)
      // /thingsvis-api/auth/sso -> ${VITE_THINGSVIS_API_URL}/api/v1/auth/sso
      const ssoUrl = `${this.thingsvisApiUrl}/auth/sso`

      const response = await fetch(ssoUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (this.shouldTreatResponseAsUnavailable(response.status, errorText)) {
          throw this.markNetworkFailure(`HTTP ${response.status}: ${errorText || 'proxy unavailable'}`)
        }
        throw new Error(`Token exchange failed: ${response.status} - ${errorText}`)
      }

      const data: SSOExchangeResponse = await response.json()
      if (!data.accessToken) throw new Error('ThingsVis SSO response did not include an access token')
      if (
        epoch !== this.identityEpoch ||
        localStg.get('token') !== tpToken ||
        this.getIdentityKey(localStg.get('userInfo')) !== identityKey
      ) {
        throw new Error('ThingsVis identity changed during token exchange')
      }
      this.clearNetworkFailure()

      // 4. 缓存 Token
      this.cachedToken = data.accessToken
      this.tokenExpiry = Date.now() + (data.expiresIn || 7200) * 1000 // 默认 2 小时
      this.cachedIdentityKey = identityKey

      return data.accessToken
    } catch (error) {
      if (epoch !== this.identityEpoch) {
        throw new Error('ThingsVis token exchange was invalidated by an identity change', { cause: error })
      }

      // 清除缓存的 token
      this.cachedToken = null
      this.tokenExpiry = 0
      this.cachedIdentityKey = null

      if (this.isNetworkError(error)) {
        const unavailableError = this.markNetworkFailure(error instanceof Error ? error.message : String(error))
        throw unavailableError
      }

      throw error
    }
  }

  /**
   * 获取有效的 ThingsVis Token (自动刷新)
   */
  async getValidToken(): Promise<string> {
    // 注意：首次登录时，userInfo 可能尚未写入 localStorage
    // identityKey 检查需要等待 userInfo 就绪
    const userInfo = await this.waitForUserInfo(3, 100)
    const identityKey = this.getIdentityKey(userInfo)

    if (this.cachedIdentityKey && identityKey && this.cachedIdentityKey !== identityKey) {
      this.clearToken()
    }
    if (this.exchangePromise && this.exchangePromise.identityKey !== identityKey) {
      this.clearToken()
    }

    // Token 未过期，直接返回
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken
    }

    const epoch = this.identityEpoch
    if (this.exchangePromise?.epoch === epoch) {
      return this.exchangePromise.promise
    }

    // Token 过期或不存在，重新交换
    const exchangePromise = this.exchangeToken(epoch)
    const trackedPromise = exchangePromise.finally(() => {
      if (this.exchangePromise?.promise === trackedPromise) {
        this.exchangePromise = null
      }
    })
    this.exchangePromise = { epoch, identityKey, promise: trackedPromise }
    return await trackedPromise
  }

  /**
   * 清除缓存的 Token
   */
  clearToken(expectedToken?: string): boolean {
    if (expectedToken && this.cachedToken !== expectedToken) return false

    if (expectedToken && this.exchangePromise) {
      this.cachedToken = null
      this.tokenExpiry = 0
      this.cachedIdentityKey = null
      return true
    }

    this.identityEpoch += 1
    this.cachedToken = null
    this.tokenExpiry = 0
    this.cachedIdentityKey = null
    this.exchangePromise = null
    this.clearNetworkFailure()
    return true
  }

  /**
   * 检查 Token 是否有效
   */
  isTokenValid(): boolean {
    return Boolean(this.cachedToken && Date.now() < this.tokenExpiry)
  }

  /**
   * 获取 Token 过期时间
   */
  getTokenExpiry(): Date | null {
    if (!this.tokenExpiry) return null
    return new Date(this.tokenExpiry)
  }
}

/**
 * 单例实例
 */
export const thingsvisAuthService = new ThingsVisAuthService()

/**
 * 便捷方法：获取有效的 ThingsVis Token
 */
export async function getThingsVisToken(): Promise<string> {
  return thingsvisAuthService.getValidToken()
}

/**
 * 便捷方法：清除 ThingsVis Token
 */
export function clearThingsVisToken(expectedToken?: string): boolean {
  return thingsvisAuthService.clearToken(expectedToken)
}
