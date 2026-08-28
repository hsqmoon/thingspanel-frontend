import { router } from '@/router'
import { initAuthRoute, resetAuthRouteStore } from '@/router/auth-route-manager'

export async function refreshAuthRoutes(fullPath?: string) {
  const targetPath = fullPath || router.currentRoute.value.fullPath

  await resetAuthRouteStore()
  const result = await initAuthRoute()

  if (result === 'success') {
    await router.replace(targetPath)
  }

  return result
}
