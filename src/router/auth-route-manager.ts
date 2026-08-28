import type { RouteRecordRaw } from 'vue-router'
import { isFlatRequestFailure } from '@sa/axios'
import type { CustomRoute, ElegantConstRoute, LastLevelRouteKey, RouteKey, RouteMap } from '@elegant-router/types'
import { isThingsVisEnabled } from '@/config/runtime-features'
import { fetchGetUserRoutes, fetchIsRouteExist } from '@/service/api/route'
import { getUserInfo } from '@/store/modules/auth/shared'
import { localStg } from '@/utils/storage'
import { useRouteStore } from '@/store/modules/route'
import {
  filterAuthRoutesByRoles,
  isRouteExistByRouteName,
  sortRoutesByOrder
} from '@/store/modules/route/shared'
import { useTabStore } from '@/store/modules/tab'
import { getRouteName, getRoutePath } from './elegant/transform'
import { router } from './instance'
import { getRouteRuntime } from './routes/runtime'

let authRouteInitEpoch = 0
let routeTransitionBarrier: Promise<void> | null = null

export type AuthRouteInitResult = 'success' | 'failed' | 'stale'

export async function initAuthRoute(): Promise<AuthRouteInitResult> {
  while (routeTransitionBarrier) {
    await routeTransitionBarrier
  }

  const epoch = ++authRouteInitEpoch
  return initializeAuthRoute(epoch)
}

async function initializeAuthRoute(epoch: number): Promise<AuthRouteInitResult> {
  const identityToken = localStg.get('token')
  if (!identityToken) return 'failed'

  const routeStore = useRouteStore()
  const success =
    routeStore.authRouteMode === 'static'
      ? await initStaticAuthRoute(epoch, identityToken)
      : await initDynamicAuthRoute(epoch, identityToken)

  if (epoch !== authRouteInitEpoch) return 'stale'

  if (success && routeStore.hasAuthRoutes) {
    useTabStore().initHomeTab()
  }

  return success ? 'success' : 'failed'
}

/** Clear routes and tabs owned by the current identity before replacing its session. */
export async function resetAuthRoute() {
  await replaceAuthRoutes(false)
}

/** Invalidate pending initialization and rebuild routes without closing the current identity's tabs. */
export async function resetAuthRouteStore() {
  const release = await acquireRouteTransition()
  authRouteInitEpoch += 1
  try {
    await useRouteStore().resetStore()
  } finally {
    release()
  }
}

/** Replace one identity's routes atomically so guards cannot initialize inside the reset window. */
export async function resetAndInitAuthRoute() {
  return replaceAuthRoutes(true)
}

async function replaceAuthRoutes(initialize: boolean): Promise<AuthRouteInitResult> {
  const release = await acquireRouteTransition()
  const epoch = ++authRouteInitEpoch
  try {
    await useTabStore().clearTabs()
    await useRouteStore().resetStore()
    return initialize ? await initializeAuthRoute(epoch) : 'success'
  } finally {
    release()
  }
}

async function acquireRouteTransition() {
  while (routeTransitionBarrier) {
    await routeTransitionBarrier
  }

  let releaseBarrier!: () => void
  routeTransitionBarrier = new Promise<void>(resolve => {
    releaseBarrier = resolve
  })
  return () => {
    routeTransitionBarrier = null
    releaseBarrier()
  }
}

async function initStaticAuthRoute(epoch: number, identityToken: string): Promise<boolean> {
  const routeStore = useRouteStore()
  const { createRoutes } = getRouteRuntime()
  const { authRoutes } = createRoutes()
  const filteredAuthRoutes = filterAuthRoutesByRoles(authRoutes, getUserInfo().roles as string[])

  if (epoch !== authRouteInitEpoch || localStg.get('token') !== identityToken) return false

  routeStore.hasAuthRoutes = filteredAuthRoutes.length > 0
  if (routeStore.hasAuthRoutes) {
    handleAuthRoutes(filteredAuthRoutes)
  }

  routeStore.setIsInitAuthRoute(true)
  return true
}

async function initDynamicAuthRoute(epoch: number, identityToken: string): Promise<boolean> {
  const routeStore = useRouteStore()

  try {
    const response = await fetchGetUserRoutes()

    if (epoch !== authRouteInitEpoch || localStg.get('token') !== identityToken) return false

    if (isFlatRequestFailure(response)) {
      routeStore.hasAuthRoutes = false
      if (!localStg.get('token') || response.error.status === 401) return false
      throw response
    }

    const { data } = response
    const routes = data?.list || []
    routeStore.hasAuthRoutes = routes.length > 0

    if (routeStore.hasAuthRoutes) {
      handleAuthRoutes(routes)
      routeStore.setRouteHome('home')
      updateRootRouteRedirect('home')
    }

    routeStore.setIsInitAuthRoute(true)
    return true
  } catch (error: unknown) {
    if (epoch !== authRouteInitEpoch || localStg.get('token') !== identityToken) return false

    routeStore.hasAuthRoutes = false
    if (!localStg.get('token') || (isFlatRequestFailure(error) && error.error.status === 401)) return false
    if (error instanceof Error) {
      window.$message?.error(error.message)
    }
    throw error
  }
}

function handleAuthRoutes(routes: ElegantConstRoute[]) {
  const { createRoutes, getAuthVueRoutes } = getRouteRuntime()
  const runtimeRoutes = isThingsVisEnabled()
    ? routes
    : routes.flatMap(function removeThingsVisRoutes(route): ElegantConstRoute[] {
        const name = String(route.name || '')
        const path = String(route.path || '')
        const component = String(route.component || '')
        if (
          name.startsWith('visualization') ||
          name.startsWith('home_dashboard_') ||
          path.startsWith('/visualization') ||
          path.startsWith('/home/dashboard/') ||
          component.toLowerCase().includes('thingsvis')
        ) {
          return []
        }

        return [
          {
            ...route,
            ...(route.children ? { children: route.children.flatMap(removeThingsVisRoutes) } : {})
          } as ElegantConstRoute
        ]
      })
  const sortedRoutes = sortRoutesByOrder(runtimeRoutes)
  const vueRoutes = getAuthVueRoutes(sortedRoutes)
  const routeStore = useRouteStore()

  addRoutesToVueRouter(vueRoutes)
  routeStore.getGlobalMenus(sortedRoutes)
  routeStore.getCacheRoutes(vueRoutes, createRoutes().constantVueRoutes)
}

function addRoutesToVueRouter(routes: RouteRecordRaw[]) {
  const routeStore = useRouteStore()

  routes.forEach(route => {
    routeStore.addRemoveRouteFn(router.addRoute(route))
  })
}

function updateRootRouteRedirect(redirectKey: LastLevelRouteKey) {
  const { getAuthVueRoutes, rootRoute: baseRootRoute } = getRouteRuntime()
  const redirect = getRoutePath(redirectKey)
  if (!redirect) return

  const rootRoute: CustomRoute = { ...baseRootRoute, redirect }

  router.removeRoute(rootRoute.name)
  const [rootVueRoute] = getAuthVueRoutes([rootRoute])
  router.addRoute(rootVueRoute)
}

export async function getIsAuthRouteExist(routePath: RouteMap[RouteKey]) {
  const routeName = getRouteName(routePath)
  if (!routeName) return false

  const routeStore = useRouteStore()
  if (routeStore.authRouteMode === 'static') {
    return isRouteExistByRouteName(routeName, getRouteRuntime().createRoutes().authRoutes)
  }

  return fetchIsRouteExist(routeName)
}
