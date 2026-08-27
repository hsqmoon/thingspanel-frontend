import type { RouteRecordRaw } from 'vue-router'
import type { CustomRoute, ElegantConstRoute } from '@elegant-router/types'

interface RouteRuntime {
  rootRoute: CustomRoute
  createRoutes: () => {
    constantVueRoutes: RouteRecordRaw[]
    authRoutes: ElegantConstRoute[]
  }
  getAuthVueRoutes: (routes: ElegantConstRoute[]) => RouteRecordRaw[]
}

let routeRuntime: RouteRuntime | null = null

export function registerRouteRuntime(runtime: RouteRuntime) {
  routeRuntime = runtime
}

export function getRouteRuntime(): RouteRuntime {
  if (!routeRuntime) {
    throw new Error('Route runtime has not been registered')
  }

  return routeRuntime
}
