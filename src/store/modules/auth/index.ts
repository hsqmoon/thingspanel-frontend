import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { SetupStoreId } from '@/enum'
import { useLoading } from '@sa/hooks'
import { useRouterPush } from '@/hooks/common/router'
import { fetchGetUserInfo, fetchLogin, logout } from '@/service/api'
import { transformUser } from '@/service/api/auth'
import { localStg } from '@/utils/storage'
import { $t } from '@/locales'
import { encryptDataByRsa, generateRandomHexString } from '@/utils/common/tool'
import { useRouteStore } from '../route'
import { clearAuthStorage, getToken, getUserInfo } from './shared'
import { clearThingsVisToken } from '@/utils/thingsvis'
import { initAuthRoute, resetAndInitAuthRoute, resetAuthRoute } from '@/router/auth-route-manager'

export const useAuthStore = defineStore(SetupStoreId.Auth, () => {
  const routeStore = useRouteStore()
  const { route, toLogin, redirectFromLogin, routerPushByKey } = useRouterPush(false)
  const { loading: loginLoading, startLoading, endLoading } = useLoading()

  const token = ref(getToken())
  const switchingUserId = ref<string | null>(null)
  let identityGeneration = 0

  /** Is login */
  const isLogin = computed(() => Boolean(token.value))

  const userInfo: Api.Auth.UserInfo = reactive(getUserInfo())

  interface IdentitySnapshot {
    token: string
    refreshToken?: string
    tokenExpiresIn?: string
    tenantScopeId?: string
    userInfo: Api.Auth.UserInfo
  }

  function replaceUserInfo(info: Api.Auth.UserInfo) {
    Object.keys(userInfo).forEach(key => {
      delete (userInfo as unknown as Record<string, unknown>)[key]
    })
    Object.assign(userInfo, info)
  }

  function captureIdentity(): IdentitySnapshot {
    return {
      token: localStg.get('token') || token.value,
      refreshToken: localStg.get('refreshToken') || undefined,
      tokenExpiresIn: localStg.get('token_expires_in') || undefined,
      tenantScopeId: localStg.get('tenantScopeId') || undefined,
      userInfo: JSON.parse(JSON.stringify(userInfo)) as Api.Auth.UserInfo
    }
  }

  function restoreIdentity(snapshot: IdentitySnapshot) {
    localStg.set('token', snapshot.token)
    if (snapshot.refreshToken) localStg.set('refreshToken', snapshot.refreshToken)
    else localStg.remove('refreshToken')
    if (snapshot.tokenExpiresIn) localStg.set('token_expires_in', snapshot.tokenExpiresIn)
    else localStg.remove('token_expires_in')
    if (snapshot.tenantScopeId) localStg.set('tenantScopeId', snapshot.tenantScopeId)
    else localStg.remove('tenantScopeId')
    localStg.set('userInfo', snapshot.userInfo)
    token.value = snapshot.token
    replaceUserInfo(snapshot.userInfo)
  }

  function commitIdentity(loginToken: Api.Auth.LoginToken, info: Api.Auth.UserInfo) {
    const nextInfo = { ...info, roles: [info.authority] }
    localStg.set('token', loginToken.token)
    localStg.set('refreshToken', loginToken.refreshToken)
    localStg.set('token_expires_in', String(Date.now() + loginToken.expires_in * 1000))
    localStg.set('userInfo', nextInfo)
    localStg.remove('tenantScopeId')
    token.value = loginToken.token
    replaceUserInfo(nextInfo)
    clearThingsVisToken()
    return nextInfo
  }

  async function rollbackIdentity(snapshot: IdentitySnapshot, generation: number) {
    if (generation !== identityGeneration) return

    restoreIdentity(snapshot)
    clearThingsVisToken()
    try {
      const restored = await resetAndInitAuthRoute()
      if (generation !== identityGeneration || restored === 'success') return
    } catch {
      // The old identity cannot be used safely without its routes; fall through to explicit logout recovery.
    }

    if (generation === identityGeneration) {
      await resetStore()
    }
  }

  /** Reset auth store */
  async function resetStore(navigateToLogin = true) {
    identityGeneration += 1
    switchingUserId.value = null
    clearAuthStorage()
    clearThingsVisToken()

    token.value = ''
    replaceUserInfo({
      authority: '',
      id: '',
      userId: '',
      userName: '',
      roles: []
    })

    await resetAuthRoute()

    if (navigateToLogin && !route.value.meta.constant) {
      await toLogin()
    }
  }

  /**
   * Login
   *
   * @param userName User name
   * @param password Password
   */
  async function login(userName: string, password: string) {
    startLoading()
    try {
      let newP = password
      const data = localStorage.getItem('enableZcAndYzm') ? JSON.parse(localStorage.getItem('enableZcAndYzm')!) : []
      let salt: string | null = null
      if (data.find(v => v.name === 'frontend_res')?.enable_flag === 'enable') {
        salt = generateRandomHexString(16)
        newP = encryptDataByRsa(password + salt)
      }

      const { data: loginToken } = await fetchLogin(userName, newP, salt ?? null)
      if (!loginToken) {
        await resetStore()
        return
      }

      const { loop, info } = await loginByToken(loginToken)
      if (!loop || !info) {
        await resetStore()
        return
      }

      const initialized = await initAuthRoute()
      if (initialized === 'stale') return
      if (initialized === 'failed') {
        await resetStore()
        return
      }
      if (!routeStore.hasAuthRoutes) {
        await routerPushByKey('403')
        return
      }
      await redirectFromLogin()
    } catch {
      await resetStore()
    } finally {
      endLoading()
    }
  }

  /**
   * enter
   *
   * @param userId userId
   */
  async function enter(userId: string) {
    if (switchingUserId.value) return false

    const generation = ++identityGeneration
    const previousIdentity = captureIdentity()
    switchingUserId.value = userId
    startLoading()
    let identityCommitted = false
    try {
      const { data: loginToken, error } = await transformUser({
        become_user_id: userId
      })

      if (generation !== identityGeneration) return false
      if (error || !loginToken) {
        window.$message?.error(error?.message || '无法切换到该用户，请稍后重试。')
        return false
      }

      const userResponse = await fetchGetUserInfo(loginToken.token)
      if (generation !== identityGeneration) return false
      if (userResponse.error || !userResponse.data) {
        window.$message?.error(userResponse.error?.message || '无法读取目标用户信息，请稍后重试。')
        return false
      }

      const info = commitIdentity(loginToken, userResponse.data)
      identityCommitted = true
      const initialized = await resetAndInitAuthRoute()
      if (generation !== identityGeneration) return false
      if (initialized !== 'success') {
        await rollbackIdentity(previousIdentity, generation)
        return false
      }

      await redirectFromLogin()
      if (routeStore.isInitAuthRoute) {
        window.$notification?.success({
          title: $t('page.login.common.loginSuccess'),
          content: $t('page.login.common.welcomeBack', {
            userName: info.userName
          }),
          duration: 4500
        })
      }
      return true
    } catch {
      if (identityCommitted && generation === identityGeneration) {
        await rollbackIdentity(previousIdentity, generation)
      }
      return false
    } finally {
      if (generation === identityGeneration) {
        switchingUserId.value = null
      }
      endLoading()
    }
  }

  async function loginByToken(loginToken: Api.Auth.LoginToken) {
    const { data: info, error } = await fetchGetUserInfo(loginToken.token)
    if (error || !info) return { loop: false, info }

    return { loop: true, info: commitIdentity(loginToken, info) }
  }
  async function requestLogout() {
    try {
      await logout()
    } catch {
      // The remote session is best-effort; local credentials must always be removed.
    } finally {
      await resetStore()
    }
  }

  return {
    token,
    userInfo,
    isLogin,
    loginLoading,
    switchingUserId,
    resetStore,
    login,
    enter,
    requestLogout,
    loginByToken
  }
})
