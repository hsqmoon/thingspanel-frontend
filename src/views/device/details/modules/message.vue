<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { isFlatRequestFailure } from '@sa/axios'
import type { FormInst } from 'naive-ui'
import { NButton, NSpace, useMessage, NInputNumber, NTooltip, NInput, NSelect, NSwitch } from 'naive-ui'
import { deviceConfigInfo, deviceDetail, deviceLocation } from '@/service/api'
import { $t } from '@/locales'
import TencentMap from './public/tencent-map.vue'
import { getCoordinateStringValidationError } from '@/utils/common/map-validator'

const props = defineProps<{
  id: string
  deviceConfigId: string
}>()

const latitude = ref('')
const longitude = ref('')
const isShow = ref(false)
const additionInfo = ref([] as ExtensionInfo[])
const extensionFormRef = ref<HTMLElement & FormInst>()
const saving = ref(false)
let infoRequestEpoch = 0

interface ExtensionInfoBase {
  name: string
  default_value: string
  desc?: string
  enable: boolean
}

type ExtensionInfo =
  | (ExtensionInfoBase & { type: 'String'; value?: string | null })
  | (ExtensionInfoBase & { type: 'Number'; value?: number | null })
  | (ExtensionInfoBase & { type: 'Boolean'; value?: boolean })
  | (ExtensionInfoBase & {
      type: 'Enum'
      value?: string | null
      options?: Array<{ label: string; value: string }>
    })

const safeParseJSON = <T,>(payload: string | null | undefined, fallback: T): T => {
  if (!payload) return fallback

  try {
    return JSON.parse(payload) as T
  } catch {
    return fallback
  }
}

const normalizeExtendedInfo = (payload: unknown): Array<{ name: string; value: unknown }> => {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is { name: string; value: unknown } =>
        Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string'
    )
  }

  if (payload && typeof payload === 'object') {
    return Object.entries(payload as Record<string, unknown>).map(([name, value]) => ({
      name,
      value
    }))
  }

  return []
}

const resolveExtensionInfo = (item: ExtensionInfo, value: unknown): ExtensionInfo => {
  if (value === null || value === undefined || value === '') {
    return { ...item, value: undefined }
  }

  switch (item.type) {
    case 'Number': {
      const numberValue = Number(value)
      return {
        ...item,
        value: value === null || value === undefined || value === '' || Number.isNaN(numberValue) ? undefined : numberValue
      }
    }
    case 'Boolean': {
      const booleanValue = typeof value === 'boolean' ? value : value === 'true' || (value !== 'false' && Boolean(value))
      return { ...item, value: booleanValue }
    }
    case 'Enum':
    case 'String':
      return {
        ...item,
        value: value === null || value === undefined || value === '' ? undefined : String(value)
      }
  }
}

const { query } = useRoute()
const message = useMessage()

const handleSave = async () => {
  if (saving.value) return

  saving.value = true
  try {
    if (latitude.value && longitude.value) {
      const error = getCoordinateStringValidationError(latitude.value, longitude.value)
      if (error) {
        message.error(`${$t('generate.invalidCoordinates')} ${error}`)
        return
      }
    }

    if (extensionFormRef.value) {
      await extensionFormRef.value.validate()
    }

    const extentedInfoObject = additionInfo.value.reduce<Record<string, string | number | boolean | null | undefined>>(
      (acc, item) => {
        acc[item.name] = item.value
        return acc
      },
      {}
    )

    const res = await deviceLocation({
      id: props.id,
      location: `${longitude.value},${latitude.value}`,
      additional_info: JSON.stringify(extentedInfoObject)
    })

    if (isFlatRequestFailure(res)) return

    message.success($t('common.modifySuccess'))
  } catch {
    message.error($t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

const onPositionSelected = (position: { lat: number; lng: number }) => {
  latitude.value = position.lat.toString()
  longitude.value = position.lng.toString()
  isShow.value = false
}

const openMapAndGetPosition = () => {
  if (latitude.value && longitude.value) {
    const error = getCoordinateStringValidationError(latitude.value, longitude.value)
    if (error) {
      window.$message?.error(`${$t('generate.currentCoordinatesInvalid')} ${error}`)
      return
    }
  }

  isShow.value = true
}

const getConfigInfo = async () => {
  const requestEpoch = ++infoRequestEpoch
  const [result, resultData] = await Promise.all([
    deviceDetail(query.d_id as string),
    props.deviceConfigId ? deviceConfigInfo({ id: props.deviceConfigId }) : Promise.resolve(null)
  ])
  if (
    isFlatRequestFailure(result) ||
    (resultData && isFlatRequestFailure(resultData)) ||
    requestEpoch !== infoRequestEpoch
  ) {
    return
  }

  const location = result.data?.location || ''
  const deviceAdditionalInfo = safeParseJSON<Record<string, unknown>>(result.data?.additional_info, {})
  const locationData = location?.split(',') || []
  latitude.value = locationData[1] || ''
  longitude.value = locationData[0] || ''

  if (resultData) {
    const parsedAdditionalInfo = safeParseJSON<ExtensionInfo[]>(resultData.data?.additional_info, [])
    const extendedInfoCandidates = deviceAdditionalInfo?.extendedInfo ?? deviceAdditionalInfo ?? []
    const extendedInfo = normalizeExtendedInfo(extendedInfoCandidates)
    const extendedInfoMap = new Map(extendedInfo.map(info => [info.name, info.value]))

    additionInfo.value = parsedAdditionalInfo.map(item => {
      const resolvedValue = extendedInfoMap.has(item.name) ? extendedInfoMap.get(item.name) : item.default_value

      return resolveExtensionInfo(item, resolvedValue)
    })
  }
}

const getPlatform = computed(() => {
  const { proxy }: any = getCurrentInstance()
  return proxy.getPlatform()
})

onMounted(getConfigInfo)
</script>

<template>
  <div>
    <NCard :title="$t('generate.device-location')" class="mb-4">
      <NSpace>
        <NInput v-model:value="longitude" :placeholder="$t('generate.longitude')" class="w-140px" />
        <NInput v-model:value="latitude" :placeholder="$t('generate.latitude')" class="w-140px" />

        <NButton type="primary" @click="openMapAndGetPosition">{{ $t('generate.location') }}</NButton>
      </NSpace>
    </NCard>

    <NCard :title="$t('generate.extension-info')" class="mb-4">
      <div v-if="additionInfo.filter(item => item.enable === true).length > 0">
        <NForm ref="extensionFormRef" class="mt-4">
          <div class="space-y-4">
            <div
              v-for="item in additionInfo.filter(item => item.enable === true)"
              :key="item.name"
              class="flex items-center gap-3"
            >
              <div class="w-40 text-sm font-medium text-gray-700 flex-shrink-0 flex items-center gap-1">
                <span class="truncate" :title="item.name">{{ item.name }}</span>
                <NTooltip trigger="hover">
                  <template #trigger>
                    <SvgIcon icon="mdi:help-circle" class="text-14px text-gray-400 cursor-help" />
                  </template>
                  <div class="max-w-xs">
                    <div class="text-sm font-medium mb-1">{{ $t('generate.extensionFieldName') }}: {{ item.name }}</div>

                    <div class="text-sm font-medium mb-1">{{ $t('generate.extensionFieldType') }}: {{ item.type }}</div>

                    <div class="text-sm mb-1">{{ $t('generate.extensionFieldDefault') }}: {{ item.default_value }}</div>

                    <div class="text-sm text-gray-600">{{ item.desc || $t('generate.extensionNoDesc') }}</div>
                  </div>
                </NTooltip>
              </div>

              <div class="flex-1">
                <NInput
                  v-if="item.type === 'String'"
                  v-model:value="item.value"
                  :placeholder="`${$t('generate.extensionPlaceholderDefault')} ${item.default_value || ''}`"
                />
                <NInputNumber
                  v-else-if="item.type === 'Number'"
                  v-model:value="item.value"
                  :placeholder="`${$t('generate.extensionPlaceholderDefault')} ${item.default_value || ''}`"
                  class="w-full"
                />
                <NSwitch
                  v-else-if="item.type === 'Boolean'"
                  v-model:value="item.value"
                  :checked-value="true"
                  :unchecked-value="false"
                />
                <NSelect
                  v-else-if="item.type === 'Enum'"
                  v-model:value="item.value"
                  :options="item.options || []"
                  :placeholder="`${$t('generate.extensionPlaceholderDefault')} ${item.default_value || ''}`"
                />
              </div>
            </div>
          </div>
        </NForm>
      </div>

      <div v-else class="text-center text-gray-400 py-8">
        {{ $t('common.noData') }}
      </div>
    </NCard>

    <NButton type="primary" :loading="saving" @click="handleSave">{{ $t('common.save') }}</NButton>
    <NModal v-model:show="isShow" class="flex-center" :class="getPlatform ? 'max-w-90%' : 'max-w-720px'">
      <NCard class="flex flex-1">
        <TencentMap
          v-show="isShow"
          class="flex-1 h-440px w-680px"
          :longitude="longitude"
          :latitude="latitude"
          @position-selected="onPositionSelected"
        />
      </NCard>
    </NModal>
  </div>
</template>
