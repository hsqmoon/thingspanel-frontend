import type { AxiosHeaderValue, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { FlatRequestFailure } from './type'

export function isFlatRequestFailure(value: unknown): value is FlatRequestFailure {
  if (typeof value !== 'object' || value === null) return false

  const failure = value as { data?: unknown; error?: unknown }
  if (failure.data !== null || typeof failure.error !== 'object' || failure.error === null) return false

  const error = failure.error as { message?: unknown; status?: unknown; code?: unknown }
  return (
    typeof error.message === 'string' &&
    (error.status === undefined || typeof error.status === 'number') &&
    (error.code === undefined || typeof error.code === 'string')
  )
}

export function getContentType(config: InternalAxiosRequestConfig) {
  const contentType: AxiosHeaderValue = config.headers?.['Content-Type'] || 'application/json'

  return contentType
}

/**
 * check if http status is success
 *
 * @param status
 */
export function isHttpSuccess(status: number) {
  const isSuccessCode = status >= 200 && status < 300
  return isSuccessCode || status === 304
}

/**
 * is response json
 *
 * @param response axios response
 */
export function isResponseJson(response: AxiosResponse) {
  const { responseType } = response.config

  return responseType === 'json' || responseType === undefined
}
