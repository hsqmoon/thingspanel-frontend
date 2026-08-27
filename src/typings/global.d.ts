interface Window {
  /** NProgress instance */
  NProgress?: import('nprogress').NProgress
  /** Loading bar instance */
  $loadingBar?: import('naive-ui').LoadingBarProviderInst
  /** Dialog instance */
  $dialog?: import('naive-ui').DialogProviderInst
  /** Message instance */
  $message?: import('naive-ui').MessageProviderInst
  /** Notification instance */
  $notification?: import('naive-ui').NotificationProviderInst
}

type OptionTypes = {
  label: string
  value: any
}
interface ImportMetaEnv extends Env.ImportMeta {}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace Common2 {
  /** 策略模式 [状态, 为true时执行的回调函数] */
  type StrategyAction = [boolean, () => void]

  /** 选项数据 */
  type OptionWithKey<K> = { value: K; label: string }
}

/** Build time of the project */
declare const BUILD_TIME: string

// eslint-disable-next-line no-redeclare
declare interface Window {
  NMessage: any
}

declare module 'moving-numbers-vue3'
