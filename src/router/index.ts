import type { App } from 'vue'
import { router } from './instance'
import { createRoutes } from './routes'
import { createRouterGuard } from './guard'

const { constantVueRoutes } = createRoutes()
constantVueRoutes.forEach(route => router.addRoute(route))

export { router }

/** Setup Vue Router */
export async function setupRouter(app: App) {
  app.use(router)
  createRouterGuard(router)
  await router.isReady()
}
