import type { PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import compression from 'vite-plugin-compression'
import { setupElegantRouter } from './router'
import { setupUnocss } from './unocss'
import { setupUnplugin } from './unplugin'

export function setupVitePlugins(viteEnv: Env.ImportMeta) {
  const plugins: PluginOption = [
    vue({
      script: {
        defineModel: true
      }
    }),
    vueJsx(),
    setupElegantRouter(),
    setupUnocss(viteEnv),
    ...setupUnplugin(viteEnv),
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
      deleteOriginFile: false
    })
  ]

  return plugins
}
