import type { Router } from 'vue-router'
import { createProgressGuard } from './progress'
import { createDocumentTitleGuard } from './title'
import { createPermissionGuard } from './permission'
import { createRuntimeFeatureGuard } from './runtime-features'

/**
 * Router guard
 *
 * @param router - Router instance
 */
export function createRouterGuard(router: Router) {
  createProgressGuard(router)
  createRuntimeFeatureGuard(router)
  createPermissionGuard(router)
  createDocumentTitleGuard(router)
}
