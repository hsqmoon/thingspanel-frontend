import type { ProxyOptions } from 'vite'
import { createProxyPattern, createServiceConfig } from '../../env.config'

function parseThingsVisURL(name: string, value: string, allowRootRelative: boolean): URL {
  if (allowRootRelative && value.startsWith('/') && !value.startsWith('//')) {
    return new URL(value, 'http://same-origin.invalid')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`${name} must be a valid absolute HTTP(S) URL: ${value}`, { cause: error })
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTP or HTTPS: ${value}`)
  }

  return url
}

/**
 * Set http proxy
 *
 * @param env - The current env
 */
export function createViteProxy(env: Env.ImportMeta) {
  const isEnableHttpProxy = env.VITE_HTTP_PROXY === 'Y'
  const thingsvisApiUrl = env.VITE_THINGSVIS_API_URL || 'http://localhost:8000'
  const studioHost = parseThingsVisURL(
    'VITE_THINGSVIS_STUDIO_URL',
    env.VITE_THINGSVIS_STUDIO_URL || 'http://localhost:3000',
    !isEnableHttpProxy
  ).origin
  parseThingsVisURL('VITE_THINGSVIS_API_URL', thingsvisApiUrl, !isEnableHttpProxy)

  if (!isEnableHttpProxy) return undefined

  const { baseURL, otherBaseURL } = createServiceConfig(env)

  const defaultProxyPattern = createProxyPattern()

  const proxy: Record<string, ProxyOptions> = {
    [defaultProxyPattern]: {
      target: baseURL,
      changeOrigin: true,
      ws: true,
      rewrite: path => path.replace(new RegExp(`^${defaultProxyPattern}`), '')
    }
  }

  const otherURLEntries = Object.entries(otherBaseURL)

  for (const [key, url] of otherURLEntries) {
    const proxyPattern = createProxyPattern(key as App.Service.OtherBaseURLKey)

    proxy[proxyPattern] = {
      target: url,
      changeOrigin: true,
      rewrite: path => path.replace(new RegExp(`^${proxyPattern}`), '')
    }
  }

  // ThingsVis API 代理 (从环境变量获取，默认8000)
  proxy['/thingsvis-api'] = {
    target: thingsvisApiUrl,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/thingsvis-api/, '/api/v1')
  }

  // ThingsVis uploaded assets (GLB/images) are stored on the ThingsVis server under /uploads.
  proxy['/uploads'] = {
    target: thingsvisApiUrl,
    changeOrigin: true
  }

  // Important: ThingsVis 前端代理 (新增)
  // 将 /thingsvis/* 请求转发到本地开发的 Studio 服务
  // 这解决了 "Iframe 加载 ThingsPanel 自身页面" 的问题
  proxy['/thingsvis'] = {
    target: studioHost,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/thingsvis/, '')
  }

  // account-service 代理 (account-service 运行在 Docker 8080，映射到 18081)
  // 请求: /api/account/* → http://localhost:18081/api/account/*
  const accountServiceUrl = env.VITE_ACCOUNT_SERVICE_URL || 'http://localhost:18081'
  proxy['/api/account'] = {
    target: accountServiceUrl,
    changeOrigin: true,
    rewrite: path => path.replace(/^\/api\/account/, '/api/account')
  }

  return proxy
}
