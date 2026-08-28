import { ref } from 'vue'
import type { Ref } from 'vue'
import { createFlatRequest, isFlatRequestFailure } from '@sa/axios'
import type {
  CreateAxiosDefaults,
  CustomAxiosRequestConfig,
  FlatRequestError,
  MappedType,
  RequestOption,
  ResponseType
} from '@sa/axios'
import useLoading from './use-loading'

export type HookRequestInstanceResponseSuccessData<T = any> = {
  data: Ref<T>
  error: Ref<null>
}

export type HookRequestInstanceResponseFailData = {
  data: Ref<null>
  error: Ref<FlatRequestError>
}

export type HookRequestInstanceResponseData<T = any> = {
  loading: Ref<boolean>
} & (HookRequestInstanceResponseSuccessData<T> | HookRequestInstanceResponseFailData)

export interface HookRequestInstance {
  <T = any, R extends ResponseType = 'json'>(
    config: CustomAxiosRequestConfig
  ): HookRequestInstanceResponseData<MappedType<R, T>>
  cancelRequest: (requestId: string) => void
  cancelAllRequest: () => void
}

/**
 * create a hook requestTs instance
 *
 * @param axiosConfig
 * @param options
 */
export default function createHookRequest<ResponseData = any>(
  axiosConfig?: CreateAxiosDefaults,
  options?: Partial<RequestOption<ResponseData>>
) {
  const request = createFlatRequest<ResponseData>(axiosConfig, options)

  const hookRequest: HookRequestInstance = function hookRequest<T = any, R extends ResponseType = 'json'>(
    config: CustomAxiosRequestConfig
  ) {
    const { loading, startLoading, endLoading } = useLoading()

    const data = ref<MappedType<R, T> | null>(null)
    const error = ref<FlatRequestError | null>(null)

    startLoading()

    request(config)
      .then(res => {
        if (isFlatRequestFailure(res)) {
          error.value = res.error
        } else {
          data.value = res.data
        }
      })
      .catch(reason => {
        error.value = isFlatRequestFailure(reason)
          ? reason.error
          : { message: reason instanceof Error ? reason.message : '请求失败' }
      })
      .finally(endLoading)

    return {
      loading,
      data,
      error
    }
  } as HookRequestInstance

  hookRequest.cancelRequest = request.cancelRequest
  hookRequest.cancelAllRequest = request.cancelAllRequest

  return hookRequest
}
