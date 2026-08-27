import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import { localStg } from '@/utils/storage'
import messages from './locale'

export const i18n = createI18n({
  locale: localStg.get('lang') || 'zh-CN',
  fallbackLocale: 'en',
  messages,
  legacy: false
})

/**
 * Setup plugin i18n
 *
 * @param app
 */
export function setupI18n(app: App) {
  app.use(i18n)
}

const globalI18n = i18n.global as unknown as { t: App.I18n.$T }
export const $t = globalI18n.t
export function setLocale(locale: App.I18n.LangType) {
  i18n.global.locale.value = locale
}
