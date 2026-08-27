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
import { initAuthRoute, resetAuthRoute } from '@/router/auth-route-manager'

export const useAuthStore = defineStore(SetupStoreId.Auth, () => {
  const routeStore = useRouteStore()
  const { route, toLogin, redirectFromLogin, routerPushByKey } = useRouterPush(false)
  const { loading: loginLoading, startLoading, endLoading } = useLoading()

  const token = ref(getToken())

  /** Is login */
  const isLogin = computed(() => Boolean(token.value))

  const userInfo: Api.Auth.UserInfo = reactive(getUserInfo())
  /** Reset auth store */
  async function resetStore(navigateToLogin = true) {
    await resetAuthRoute()

    clearAuthStorage()
    clearThingsVisToken()

    token.value = ''
    Object.keys(userInfo).forEach(key => {
      delete (userInfo as unknown as Record<string, unknown>)[key]
    })
    Object.assign(userInfo, {
      authority: '',
      id: '',
      userId: '',
      userName: '',
      roles: []
    })

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
    let identityLoaded = false
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
      if (loop && info) {
        identityLoaded = true
        const initialized = await initAuthRoute()
        if (!initialized) {
          await resetStore()
          return
        }
        if (!routeStore.hasAuthRoutes) {
          await routerPushByKey('403')
          return
        }
        await redirectFromLogin()
      }
    } catch {
      if (!identityLoaded || !localStg.get('token')) {
        await resetStore()
      }
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
    startLoading()
    let replacingIdentity = false
    let identityLoaded = false
    try {
      const { data: loginToken, error } = await transformUser({
        become_user_id: userId
      })

      if (error || !loginToken) {
        await resetStore()
        return
      }

      replacingIdentity = true
      await resetAuthRoute()
      const { info, loop } = await loginByToken(loginToken)
      if (!loop) {
        await resetStore()
        return
      }
      identityLoaded = true

      const initialized = await initAuthRoute()
      if (!initialized) {
        await resetStore()
        return
      }

      await redirectFromLogin()
      if (routeStore.isInitAuthRoute) {
        window.$notification?.success({
          title: $t('page.login.common.loginSuccess'),
          content: $t('page.login.common.welcomeBack', {
            userName: info?.name
          }),
          duration: 4500
        })
      }
    } catch {
      if (replacingIdentity && (!identityLoaded || !localStg.get('token'))) {
        await resetStore()
      }
    } finally {
      endLoading()
    }
  }

  async function loginByToken(loginToken: Api.Auth.LoginToken) {
    // 1. stored in the localStorage, the later requests need it in headers
    localStg.set('token', loginToken.token)
    localStg.set('refreshToken', loginToken.refreshToken)
    const expires_in = Date.now() + loginToken.expires_in * 1000
    localStg.set('token_expires_in', expires_in.toString())

    const { data: info, error } = await fetchGetUserInfo()

    if (!error) {
      // 2. store user info
      info.roles = [info.authority]
      localStg.set('userInfo', info)
      // 3. update auth route
      token.value = loginToken.token
      Object.assign(userInfo, info)

      // 4. 清除 ThingsVis token 缓存，确保使用新用户身份重新交换 SSO token
      clearThingsVisToken()

      return { loop: true, info }
    }

    return { loop: false, info }
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
    resetStore,
    login,
    enter,
    requestLogout,
    loginByToken
  }
})
