<script setup lang="ts">
import { computed, h, nextTick, reactive, ref, watch } from 'vue'
import { useLoading } from '@sa/hooks'
import { isFlatRequestFailure } from '@sa/axios'
import { deviceStatusHistory } from '@/service/api/device'
import { $t } from '@/locales'
import dayjs from 'dayjs'
import type { DataTableColumns, PaginationProps } from 'naive-ui'

/**
 * 设备状态历史记录类型定义
 * @interface StatusHistoryItem
 * @property {number} status - 状态 0: 离线 1: 在线
 * @property {string | number} change_time - 状态改变时间
 */
interface StatusHistoryItem {
  status: 0 | 1
  change_time?: string | number
}

// 请求参数类型定义
interface StatusHistoryParams {
  device_id: string
  page: number
  page_size: number
  start_time?: number
  end_time?: number
  status?: number
}

const props = defineProps<{
  deviceId: string
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { loading, startLoading, endLoading } = useLoading()
const tableData = ref<StatusHistoryItem[]>([])
const total = ref(0)
let requestEpoch = 0

const queryParams = reactive({
  device_id: '',
  page: 1,
  page_size: 20,
  start_time: undefined as number | undefined,
  end_time: undefined as number | undefined,
  status: null as number | null | undefined
})

const dateRangeValue = ref<[number, number] | null>(null)

const statusOptions = [
  { label: $t('custom.device_details.online'), value: 1 },
  { label: $t('custom.device_details.offline'), value: 0 }
]

const pagination = reactive<PaginationProps>({
  page: 1,
  pageSize: 20,
  showSizePicker: true,
  pageSizes: [10, 20, 30, 50, 100],
  itemCount: 0,
  onChange: (page: number) => {
    queryParams.page = page
    pagination.page = page
    fetchData()
  },
  onUpdatePageSize: (pageSize: number) => {
    queryParams.page_size = pageSize
    queryParams.page = 1
    pagination.pageSize = pageSize
    pagination.page = 1
    fetchData()
  }
})

const columns: DataTableColumns<StatusHistoryItem> = [
  {
    title: $t('common.index'),
    key: 'index',
    width: 100,
    render: (_row: StatusHistoryItem, index: number) => {
      return index + 1
    }
  },
  {
    title: $t('common.status'),
    key: 'status',
    width: 120,
    render: (row: StatusHistoryItem) => {
      const isOnline = row.status === 1
      const text = isOnline ? $t('custom.device_details.online') : $t('custom.device_details.offline')
      return h('span', text)
    }
  },
  {
    title: $t('common.time'),
    key: 'change_time',
    width: 200,
    render: (row: StatusHistoryItem) => {
      if (row.change_time) {
        return dayjs(row.change_time).format('YYYY-MM-DD HH:mm:ss')
      }
      return '--'
    }
  }
]

const fetchData = async () => {
  const currentRequestEpoch = ++requestEpoch
  startLoading()
  try {
    const params: StatusHistoryParams = {
      device_id: props.deviceId,
      page: queryParams.page,
      page_size: queryParams.page_size
    }

    if (queryParams.start_time) {
      params.start_time = queryParams.start_time
    }
    if (queryParams.end_time) {
      params.end_time = queryParams.end_time
    }
    if (queryParams.status !== null && queryParams.status !== undefined) {
      params.status = queryParams.status
    }

    const response = await deviceStatusHistory(params)
    if (isFlatRequestFailure(response) || currentRequestEpoch !== requestEpoch) return

    tableData.value = Array.isArray(response.data?.list) ? response.data.list : []
    total.value = Number(response.data?.total) || 0
    pagination.itemCount = total.value
  } finally {
    if (currentRequestEpoch === requestEpoch) endLoading()
  }
}

const handleSearch = () => {
  queryParams.page = 1
  pagination.page = 1
  fetchData()
}

const handleReset = () => {
  dateRangeValue.value = null
  queryParams.start_time = undefined
  queryParams.end_time = undefined
  queryParams.status = null
  queryParams.page = 1
  pagination.page = 1
  nextTick(() => {
    fetchData()
  })
}

const handleDateRangeChange = (value: [number, number] | null) => {
  dateRangeValue.value = value
  if (value && value.length === 2) {
    queryParams.start_time = Math.floor(value[0] / 1000)
    queryParams.end_time = Math.floor(value[1] / 1000)
  } else {
    queryParams.start_time = undefined
    queryParams.end_time = undefined
  }
}

const showModal = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value)
})

watch(
  () => props.visible,
  newVal => {
    if (!newVal) {
      requestEpoch += 1
      endLoading()
    }
    if (newVal && props.deviceId) {
      queryParams.device_id = props.deviceId
      queryParams.page = 1
      pagination.page = 1
      fetchData()
    }
  },
  { immediate: true }
)

watch(
  () => props.deviceId,
  newVal => {
    if (newVal && props.visible) {
      queryParams.device_id = newVal
      queryParams.page = 1
      pagination.page = 1
      fetchData()
    }
  }
)
</script>

<template>
  <NModal
    v-model:show="showModal"
    preset="dialog"
    :showIcon="false"
    :title="$t('common.deviceActiveTime')"
    :style="{ minWidth: '600px', maxHeight: '90vh' }"
  >
    <NCard>
      <NForm :model="queryParams" :show-feedback="false" label-placement="left" label-width="100px" label-align="left">
        <NFlex :vertical="false" :gap="8" class="mb-4">
          <NFormItem :label="$t('common.timeFrame')">
            <NDatePicker
              v-model:value="dateRangeValue"
              type="datetimerange"
              clearable
              :placeholder="$t('common.selectPlaceholder')"
              @update:value="handleDateRangeChange"
            />
          </NFormItem>
          <NFormItem :label="$t('common.status')">
            <NSelect
              v-model:value="queryParams.status"
              :options="statusOptions"
              clearable
              :placeholder="$t('generate.selectStatus')"
              style="width: 200px"
            />
          </NFormItem>
          <NFlex :vertical="false" :gap="8">
            <NButton type="primary" @click="handleSearch">{{ $t('common.search') }}</NButton>
            <NButton @click="handleReset">{{ $t('common.reset') }}</NButton>
          </NFlex>
        </NFlex>
      </NForm>

      <div class="table-container">
        <NDataTable
          :columns="columns"
          :data="tableData"
          :loading="loading"
          :pagination="pagination"
          :bordered="false"
          :max-height="350"
          remote
        />
      </div>
    </NCard>
  </NModal>
</template>

<style scoped lang="scss">
.table-container {
  margin-top: 16px;
  width: 100%;
  overflow: hidden;
}
</style>
