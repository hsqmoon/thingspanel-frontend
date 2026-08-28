import axios, { AxiosError } from 'axios'
import type { AxiosResponse, CancelTokenSource, CreateAxiosDefaults, InternalAxiosRequestConfig } from 'axios'
import axiosRetry from 'axios-retry'
import { nanoid } from '@sa/utils'
import { createAxiosConfig, createDefaultOptions, createRetryOptions } from './options'
import { BACKEND_ERROR_CODE, REQUEST_ID_KEY } from './constant'
import type {
  CustomAxiosRequestConfig,
  FlatRequestFailure,
  FlatRequestInstance,
  MappedType,
  RequestInstance,
  RequestOption,
  ResponseType
} from './type'

function createCommonRequest<ResponseData = any>(
  axiosConfig?: CreateAxiosDefaults,
  options?: Partial<RequestOption<ResponseData>>
) {
  const opts = createDefaultOptions<ResponseData>(options)

  const axiosConf = createAxiosConfig(axiosConfig)
  const instance = axios.create(axiosConf)

  const cancelTokenSourceMap = new Map<string, CancelTokenSource>()

  const retryOptions = createRetryOptions(axiosConf)

  instance.interceptors.request.use(async conf => {
    const config: InternalAxiosRequestConfig = { ...conf }

    // set requestTs id
    const requestId = nanoid()
    config.headers.set(REQUEST_ID_KEY, requestId)

    // config cancel token
    const cancelTokenSource = axios.CancelToken.source()
    config.cancelToken = cancelTokenSource.token
    cancelTokenSourceMap.set(requestId, cancelTokenSource)

    try {
      // handle config by hook
      const handledConfig = (await opts.onRequest?.(config)) || config
      handledConfig.headers.set(REQUEST_ID_KEY, requestId)
      const adapter = axios.getAdapter(handledConfig.adapter || instance.defaults.adapter)
      handledConfig.adapter = async adapterConfig => {
        try {
          return await adapter(adapterConfig)
        } finally {
          cancelTokenSourceMap.delete(requestId)
        }
      }
      return handledConfig
    } catch (error) {
      cancelTokenSourceMap.delete(requestId)
      throw error
    }
  })

  function releaseCancelToken(config?: InternalAxiosRequestConfig) {
    const requestId = config?.headers.get(REQUEST_ID_KEY)
    if (typeof requestId === 'string') {
      cancelTokenSourceMap.delete(requestId)
    }
  }

  // Release each transport attempt before axios-retry decides whether to retry it.
  instance.interceptors.response.use(
    response => {
      releaseCancelToken(response.config)
      return response
    },
    error => {
      releaseCancelToken(error?.config)
      return Promise.reject(error)
    }
  )

  axiosRetry(instance, retryOptions)

  instance.interceptors.response.use(
    async response => {
      if (opts.isBackendSuccess(response)) {
        return Promise.resolve(response)
      }

      const fail = await opts.onBackendFail(response, instance)
      if (fail) {
        return fail
      }

      const backendError = new AxiosError<ResponseData>(
        'the backend requestTs error',
        BACKEND_ERROR_CODE,
        response.config,
        response.request,
        response
      )

      await opts.onError(backendError)

      return Promise.reject(backendError)
    },
    async (error: AxiosError<ResponseData>) => {
      await opts.onError(error)

      return Promise.reject(error)
    }
  )

  function cancelRequest(requestId: string) {
    const cancelTokenSource = cancelTokenSourceMap.get(requestId)
    if (cancelTokenSource) {
      cancelTokenSource.cancel()
      cancelTokenSourceMap.delete(requestId)
    }
  }

  function cancelAllRequest() {
    cancelTokenSourceMap.forEach(cancelTokenSource => {
      cancelTokenSource.cancel()
    })
    cancelTokenSourceMap.clear()
  }

  return {
    instance,
    opts,
    cancelRequest,
    cancelAllRequest
  }
}

/**
 * create a requestTs instance
 *
 * @param axiosConfig axios config
 * @param options requestTs options
 */
export function createRequest<ResponseData = any>(
  axiosConfig?: CreateAxiosDefaults,
  options?: Partial<RequestOption<ResponseData>>
) {
  const { instance, opts, cancelRequest, cancelAllRequest } = createCommonRequest<ResponseData>(axiosConfig, options)

  const request: RequestInstance = async function request<T = any, R extends ResponseType = 'json'>(
    config: CustomAxiosRequestConfig
  ) {
    const response: AxiosResponse<ResponseData> = await instance(config)

    const responseType = response.config?.responseType || 'json'

    if (responseType === 'json') {
      return opts.transformBackendResponse(response)
    }

    return response.data as MappedType<R, T>
  } as RequestInstance
  const requestMethods = {
    async get<T = any, R extends ResponseType = 'json'>(url: string, config?: CustomAxiosRequestConfig<R>) {
      const fullConfig = { ...config, url, method: 'get' }
      return request<T, R>(fullConfig)
    },
    async post<T = any, R extends ResponseType = 'json'>(
      url: string,
      data?: any,
      config?: CustomAxiosRequestConfig<R>
    ) {
      const fullConfig = { ...config, url, data, method: 'post' }
      return request<T, R>(fullConfig)
    },
    async put<T = any, R extends ResponseType = 'json'>(url: string, data?: any, config?: CustomAxiosRequestConfig<R>) {
      const fullConfig = { ...config, url, data, method: 'put' }
      return request<T, R>(fullConfig)
    },
    async delete<T = any, R extends ResponseType = 'json'>(url: string, config?: CustomAxiosRequestConfig<R>) {
      const fullConfig = { ...config, url, method: 'delete' }
      return request<T, R>(fullConfig)
    },
    async delete2<T = any, R extends ResponseType = 'json'>(
      url: string,
      data?: any,
      config?: CustomAxiosRequestConfig<R>
    ) {
      const fullConfig = { ...config, url, data, method: 'delete' }

      return request<T, R>(fullConfig)
    }
  }

  Object.assign(request, requestMethods, {
    cancelRequest,
    cancelAllRequest
  })

  return request
}

/**
 * create a flat requestTs instance
 *
 * Calls resolve with either `{ data, error: null }` or a `FlatRequestFailure`.
 *
 * @param axiosConfig axios config
 * @param options requestTs options
 */

export { BACKEND_ERROR_CODE, REQUEST_ID_KEY }
export type * from './type'
export type * from './options'
export type * from './constant'
export type * from './shared'

export function createFlatRequest<ResponseData = any>(
  axiosConfig?: CreateAxiosDefaults,
  options?: Partial<RequestOption<ResponseData>>
) {
  const { instance, opts, cancelRequest, cancelAllRequest } = createCommonRequest<ResponseData>(axiosConfig, options)
  // 确保在请求拦截器中移除所有null值的字段

  instance.interceptors.request.use(config => {
    if (config.params) {
      config.params = Object.entries(config.params).reduce((acc: Record<string, any>, [key, value]) => {
        if (value !== null) {
          acc[key] = value
        }
        return acc
      }, {})
    }
    if (config.data) {
      config.data = Object.entries(config.data).reduce((acc: Record<string, any>, [key, value]) => {
        if (value !== null) {
          acc[key] = value
        }
        return acc
      }, {})
    }
    return config
  })
  const flatRequest: FlatRequestInstance = async function flatRequest<T = any, R extends ResponseType = 'json'>(
    config: CustomAxiosRequestConfig
  ) {
    let response: AxiosResponse<ResponseData>

    try {
      response = await instance(config)
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error

      const responseData = error.response?.data

      const backendError =
        responseData && typeof responseData === 'object'
          ? (responseData as { message?: unknown; msg?: unknown })
          : undefined
      const message =
        (typeof backendError?.message === 'string' && backendError.message) ||
        (typeof backendError?.msg === 'string' && backendError.msg) ||
        error.message ||
        '请求失败'
      const failure: FlatRequestFailure = {
        data: null,
        error: {
          message,
          status: error.response?.status,
          code: error.code,
          ...(backendError ? { data: responseData } : {})
        }
      }

      return failure
    }

    const responseType = response.config?.responseType || 'json'

    if (responseType === 'json') {
      const data = await opts.transformBackendResponse(response)

      return { data, error: null }
    }

    return { data: response.data as MappedType<R, T>, error: null }
  } as FlatRequestInstance
  const requestMethods = {
    async get<T = any, R extends ResponseType = 'json'>(url: string, config?: CustomAxiosRequestConfig<R>) {
      const fullConfig = { ...config, url, method: 'get' }
      return flatRequest<T, R>(fullConfig)
    },
    async post<T = any, R extends ResponseType = 'json'>(
      url: string,
      data?: any,
      config?: CustomAxiosRequestConfig<R>
    ) {
      const fullConfig = { ...config, url, data, method: 'post' }
      return flatRequest<T, R>(fullConfig)
    },
    async put<T = any, R extends ResponseType = 'json'>(url: string, data?: any, config?: CustomAxiosRequestConfig<R>) {
      const fullConfig = { ...config, url, data, method: 'put' }
      return flatRequest<T, R>(fullConfig)
    },
    async delete<T = any, R extends ResponseType = 'json'>(url: string, config?: CustomAxiosRequestConfig<R>) {
      const fullConfig = { ...config, url, method: 'delete' }
      return flatRequest<T, R>(fullConfig)
    },
    async delete2<T = any, R extends ResponseType = 'json'>(
      url: string,
      data?: any,
      config?: CustomAxiosRequestConfig<R>
    ) {
      const fullConfig = { ...config, url, data, method: 'delete' }
      return flatRequest<T, R>(fullConfig)
    }
  }
  Object.assign(flatRequest, requestMethods, {
    cancelRequest,
    cancelAllRequest
  })

  return flatRequest
}

export type { CreateAxiosDefaults, AxiosError }
export { isFlatRequestFailure } from './shared'
