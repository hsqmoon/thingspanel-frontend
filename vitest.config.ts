import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue(), vueJsx()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    onConsoleLog(log, type) {
      if (type === 'stderr') throw new Error(`Unexpected console warning or error: ${log}`)
    }
  }
})
