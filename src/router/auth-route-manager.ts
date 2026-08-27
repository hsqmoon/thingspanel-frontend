import type { RouteRecordRaw } from 'vue-router'
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

export async function initAuthRoute(): Promise<boolean> {
  const routeStore = useRouteStore()
  const success =
    routeStore.authRouteMode === 'static' ? await initStaticAuthRoute() : await initDynamicAuthRoute()

  if (success && routeStore.hasAuthRoutes) {
    useTabStore().initHomeTab()
  }

  return success
}

/** Clear routes and tabs owned by the current identity before replacing its session. */
export async function resetAuthRoute() {
  await useTabStore().clearTabs()
  await useRouteStore().resetStore()
}

async function initStaticAuthRoute(): Promise<boolean> {
  const routeStore = useRouteStore()
  const { createRoutes } = getRouteRuntime()
  const { authRoutes } = createRoutes()
  const filteredAuthRoutes = filterAuthRoutesByRoles(authRoutes, getUserInfo().roles as string[])

  routeStore.hasAuthRoutes = filteredAuthRoutes.length > 0
  if (routeStore.hasAuthRoutes) {
    handleAuthRoutes(filteredAuthRoutes)
  }

  routeStore.setIsInitAuthRoute(true)
  return true
}

async function initDynamicAuthRoute(): Promise<boolean> {
  const routeStore = useRouteStore()

  try {
    const { data, error } = await fetchGetUserRoutes()

    if (error) {
      routeStore.hasAuthRoutes = false
      if (!localStg.get('token') || error.response?.status === 401) return false
      throw error
    }

    const routes = data?.list || []
    routeStore.hasAuthRoutes = routes.length > 0

    if (routeStore.hasAuthRoutes) {
      handleAuthRoutes(routes)
      routeStore.setRouteHome('home')
      updateRootRouteRedirect('home')
    }

    routeStore.setIsInitAuthRoute(true)
    return true
  } catch (error) {
    routeStore.hasAuthRoutes = false
    if (!localStg.get('token')) return false
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
