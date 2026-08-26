import type { Router } from 'vue-router'
import { isThingsVisEnabled } from '@/config/runtime-features'

export function createRuntimeFeatureGuard(router: Router) {
  router.beforeEach(to => {
    if (isThingsVisEnabled()) return true

    if (
      to.path.startsWith('/visualization') ||
      to.path.startsWith('/home/dashboard/') ||
      to.path === '/tv-preview'
    ) {
      return { name: 'feature-unavailable', replace: true }
    }

    return true
  })
}
