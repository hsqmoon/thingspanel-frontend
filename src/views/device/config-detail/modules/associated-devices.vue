<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, getCurrentInstance, h, onMounted, ref } from 'vue'
import { isFlatRequestFailure } from '@sa/axios'
import type { DataTableColumns, FormInst } from 'naive-ui'
import { NButton, NDataTable, NFlex, NForm, NFormItem, NModal, NPagination, NPopconfirm, useMessage } from 'naive-ui'
import moment from 'moment'
import { deviceConfigBatch, deviceDelete, deviceList } from '@/service/api'
import { getDeviceListForSelect } from '@/service/api/device-template-model'
import { useRouterPush } from '@/hooks/common/router'
import { $t } from '@/locales'
import DeviceSelectWithScroll from './DeviceSelectWithScroll.vue'

const message = useMessage()

interface Props {
  deviceConfigId?: string
}

const props = withDefaults(defineProps<Props>(), {
  deviceConfigId: ''
})
const visible = ref(false)
const associatedFormRef = ref<HTMLElement & FormInst>()

interface AssociatedFormType {
  device_ids: string[] | null
  device_config_id: string
}
const associatedForm = ref<AssociatedFormType>(defaultAssociatedForm())
const deviceOptions = ref<Api.Device.DeviceSelectItem[]>([])
const hasMoreDevices = ref(true)
const loadingMore = ref(false)
const submitting = ref(false)
let optionsRequestEpoch = 0
let listRequestEpoch = 0

const queryDevice = ref({
  page: 1,
  page_size: 30
})

function initQueryDevice() {
  queryDevice.value = {
    page: 1,
    page_size: 30
  }
  deviceOptions.value = []
  hasMoreDevices.value = true
  loadingMore.value = false
}

function defaultAssociatedForm() {
  return {
    device_ids: null,
    device_config_id: ''
  }
}

const queryData = ref({
  device_config_id: props.deviceConfigId,
  page: 1,
  page_size: 10
})

const associatedFormRules = ref({
  // device_ids: {
  //   required: true,
  //   message: '请选择设备',
  //   trigger: 'change'
  // },
})

const addDevice = () => {
  visible.value = true
}
const modalClose = () => {
  optionsRequestEpoch += 1
  initQueryDevice()
  associatedForm.value = defaultAssociatedForm()
}
const handleSubmit = async () => {
  if (submitting.value) return

  if (!associatedForm.value.device_ids || associatedForm.value.device_ids.length === 0) {
    message.warning($t('custom.associatedDevices.selectDeviceFirst'))
    return
  }

  submitting.value = true
  try {
    await associatedFormRef?.value?.validate()
  } catch {
    submitting.value = false
    return
  }

  try {
    const response = await deviceConfigBatch({ ...associatedForm.value, device_config_id: props.deviceConfigId })
    if (isFlatRequestFailure(response)) return

    message.success($t('common.addSuccess') || 'Added successfully')
    handleClose()
  } finally {
    submitting.value = false
  }
}
const handleClose = () => {
  associatedFormRef.value?.restoreValidation()
  associatedForm.value = defaultAssociatedForm()
  visible.value = false
  queryData.value.page = 1
  getDeviceList()
}

const getDeviceOptions = async (isInitialLoad = false) => {
  if (loadingMore.value) {
    return false
  }
  if (!isInitialLoad && !hasMoreDevices.value) return false

  if (isInitialLoad) {
    queryDevice.value.page = 1
  }

  const requestEpoch = ++optionsRequestEpoch
  loadingMore.value = true

  const params: Api.Device.DeviceSelectorParams = {
    page: String(queryDevice.value.page),
    page_size: String(queryDevice.value.page_size),
    has_device_config: false
  }

  try {
    const response = await getDeviceListForSelect(params)
    if (isFlatRequestFailure(response) || requestEpoch !== optionsRequestEpoch) return false

    const list = Array.isArray(response.data?.list) ? response.data.list : []
    deviceOptions.value = isInitialLoad ? list : [...deviceOptions.value, ...list]
    hasMoreDevices.value = list.length >= queryDevice.value.page_size
    return true
  } finally {
    if (requestEpoch === optionsRequestEpoch) loadingMore.value = false
  }
}

const handleLoadMoreDevices = () => {
  const previousPage = queryDevice.value.page
  queryDevice.value.page = previousPage + 1
  void getDeviceOptions().then(success => {
    if (!success && queryDevice.value.page === previousPage + 1) queryDevice.value.page = previousPage
  })
}

const handleInitialLoadDevices = () => {
  getDeviceOptions(true)
}

const configDevice = ref([])
const configDeviceTotal = ref(0)
const getDeviceList = async () => {
  const requestEpoch = ++listRequestEpoch
  queryData.value.device_config_id = props.deviceConfigId
  const response = await deviceList({ ...queryData.value })
  if (isFlatRequestFailure(response) || requestEpoch !== listRequestEpoch) return

  const data = response.data
  if (Array.isArray(data?.list)) {
    data.list.forEach(sitem => {
      sitem.activate_flag = sitem.is_online === 0 ? $t('custom.devicePage.offline') : $t('custom.devicePage.online')
    })
    configDevice.value = data.list || []
    configDeviceTotal.value = data.total || 0
  }
}

const handleDelete = async row => {
  const response = await deviceDelete({
    device_id: row.id,
    device_config_id: ''
  })
  if (isFlatRequestFailure(response)) return

  message.success($t('card.removeSuccess') || 'Removed successfully')
  await getDeviceList()
}

const columnsData: Ref<DataTableColumns<any>> = ref([
  {
    key: 'name',
    minWidth: '140px',
    title: $t('custom.devicePage.deviceName')
  },
  {
    key: 'device_number',
    minWidth: '140px',
    title: $t('page.irrigation.group.deviceCode')
  },
  {
    key: 'activate_flag',
    minWidth: '140px',
    title: $t('custom.devicePage.onlineStatus')
  },
  {
    key: 'ts',
    minWidth: '140px',
    title: $t('custom.devicePage.pushTime'),
    render: row => {
      if (row.ts) {
        return moment(row.ts).format('YYYY-MM-DD HH:mm:ss')
      }
      return ''
    }
  },
  {
    key: 'actions',
    title: () => $t('common.actions'),
    align: 'center',
    width: '250px',
    render: row => {
      return h(
        NPopconfirm,
        {
          onPositiveClick: () => handleDelete(row)
        },
        {
          default: () => $t('common.confirmDelete'),
          trigger: () => {
            return h(
              NButton,
              {
                type: 'error',
                size: 'small',
                onClick: e => {
                  e.stopPropagation()
                }
              },
              { default: () => $t('common.remove') }
            )
          }
        }
      )
    }
  }
])

const { routerPushByKey } = useRouterPush()
const rowProps = (row: any) => {
  return {
    style: 'cursor: pointer;',
    onClick: () => {
      routerPushByKey('device_details', {
        query: {
          d_id: row.id
        }
      })
    }
  }
}
const getPlatform = computed(() => {
  const { proxy }: any = getCurrentInstance()
  return proxy.getPlatform()
})
onMounted(async () => {
  await getDeviceList()
})
</script>

<template>
  <div class="associated-box">
    <NButton type="primary" @click="addDevice()">{{ $t('generate.+add-device') }}</NButton>
    <n-data-table
      :columns="columnsData"
      :data="configDevice"
      size="small"
      :row-key="item => item.id"
      class="table-class"
      :row-props="rowProps"
    />

    <div class="pagination-box">
      <NPagination
        v-model:page="queryData.page"
        :page-size="queryData.page_size"
        :item-count="configDeviceTotal"
        @update:page="getDeviceList"
      />
    </div>
    <NModal
      v-model:show="visible"
      :mask-closable="false"
      :title="$t('generate.add-device')"
      :class="getPlatform ? 'w-90%' : 'w-600px'"
      preset="card"
      @after-leave="modalClose"
    >
      <NForm
        ref="associatedFormRef"
        :model="associatedForm"
        :rules="associatedFormRules"
        label-placement="left"
        label-width="auto"
      >
        <NFormItem :label="$t('page.irrigation.rotation.chooseDevice')" path="device_ids">
          <NFlex align="center" :wrap="false" class="device-select-row">
            <DeviceSelectWithScroll
              v-model:modelValue="associatedForm.device_ids"
              :options="deviceOptions"
              :loading="loadingMore"
              :has-more="hasMoreDevices"
              :placeholder="$t('page.irrigation.rotation.chooseDevice') || '请选择设备'"
              @load-more="handleLoadMoreDevices"
              @initial-load="handleInitialLoadDevices"
            />
            <NButton
              quaternary
              type="primary"
              class="create-device-button"
              @click="routerPushByKey('device_manage', { query: { deviceConfigId: props.deviceConfigId } })"
            >
              + 创建设备
            </NButton>
          </NFlex>
        </NFormItem>
        <NFlex justify="flex-end">
          <NButton @click="handleClose">{{ $t('generate.cancel') }}</NButton>
          <NButton
            type="primary"
            :disabled="!associatedForm.device_ids || associatedForm.device_ids.length === 0"
            :loading="submitting"
            @click="handleSubmit"
          >
            {{ $t('generate.add') }}
          </NButton>
        </NFlex>
      </NForm>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.associated-box {
  height: 100%;
}

.pagination-box {
  display: flex;
  justify-content: flex-end;
}

.table-class {
  margin: 10px;
  height: 50%;
}

.device-select-row {
  width: 100%;
}

.device-select-row :deep(.n-select),
.device-select-row :deep(.n-base-selection) {
  flex: 1;
  min-width: 0;
}

.create-device-button {
  flex: none;
  padding: 0 4px;
}
</style>
