<script setup lang="tsx">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { isFlatRequestFailure, type FlatRequestError, type FlatRequestFailure } from '@sa/axios'
import { NAlert, NInput, NSelect, type MessageReactive } from 'naive-ui'
import { batchAddServiceMenuList, getSelectServiceMenuList, getServiceListDrop } from '@/service/api/plugin'
import { $t } from '@/locales'

const emit = defineEmits(['getList', 'go-back'])

const router = useRoute()
const service_identifier = ref<any>(router.query.service_identifier)
const serviceModal = ref<any>(false)
const isEdit = ref<any>(false)
const checkedRowKeys = ref<any>([])
const selectedDeviceDrafts = ref<Map<string, any>>(new Map())
const boundDeviceKeys = ref<Set<string>>(new Set())
const device_config_id = ref<any>('')
const submitting = ref(false)
let modalSessionId = 0
let listRequestId = 0
let serviceErrorMessage: MessageReactive | null = null
const accessPointContext = ref<{
  voucher: string
  row: any
  edit: boolean
} | null>(null)

const pageData = ref<any>({
  loading: false,
  tableData: []
})

interface DeviceBatchDelivery {
  event_id: string
  status: string
  attempts: number
  next_retry_at?: string | null
  last_error?: string | null
}

interface DeviceBatchResponse {
  devices: unknown[]
  delivery: DeviceBatchDelivery
}

function isDeterministicBatchRejection(error: FlatRequestError): boolean {
  if (!error.data || typeof error.data !== 'object') return false
  const code = Number((error.data as { code?: unknown }).code)
  return (
    [100002, 100003, 100005, 100404, 201001, 201002, 201003, 204004, 204006].includes(code) ||
    (code >= 200000 && code < 201000)
  )
}

function readDeviceBatchResponse(value: unknown): DeviceBatchResponse | null {
  if (!value || typeof value !== 'object') return null

  const response = value as { devices?: unknown; delivery?: unknown }
  if (!Array.isArray(response.devices) || !response.delivery || typeof response.delivery !== 'object') return null

  const delivery = response.delivery as Partial<DeviceBatchDelivery>
  if (!delivery.event_id || typeof delivery.event_id !== 'string' || typeof delivery.attempts !== 'number') return null
  if (typeof delivery.status !== 'string') return null

  return { devices: response.devices, delivery: delivery as DeviceBatchDelivery }
}

function clearServiceError() {
  serviceErrorMessage?.destroy()
  serviceErrorMessage = null
}

function showServiceError(message: string) {
  clearServiceError()
  serviceErrorMessage = window.$message?.error(message) || null
}

function showServiceListFailure(failure: FlatRequestFailure) {
  pageData.value.tableData = []
  checkedRowKeys.value = []
  selectedDeviceDrafts.value = new Map()
  boundDeviceKeys.value = new Set()
  queryInfo.value.itemCount = 0
  queryInfo.value.total = 0
  if (failure.error.status === 401) return

  showServiceError(failure.error.message || '获取三方设备列表失败，请检查接入点配置或上游连接')
}

const normalizeTemplateOptions = (options: unknown) => {
  if (!Array.isArray(options)) return []
  return options.filter((option: any) => option && typeof option === 'object' && option.id && option.name)
}

const modalTitle = computed(() => {
  const accessPointName = accessPointContext.value?.row?.name
  if (accessPointName) {
    return `配置 ${accessPointName} 接入点的设备`
  }
  return '配置接入点设备'
})

const queryInfo = ref<any>({
  voucher: '',
  service_type: router.query.service_type,
  page: 1,
  pageSize: 10,
  total: 0,
  itemCount: 0,
  pageSizes: [10, 15, 20, 25, 30],
  showSizePicker: true,
  prefix({ itemCount }) {
    return `${$t('common.total')}: ${itemCount}`
  },
  onUpdatePage: (page: number) => {
    if (submitting.value) return

    queryInfo.value.page = page

    void getLists()
  },
  onUpdatePageSize: (pageSize: number) => {
    if (submitting.value) return

    queryInfo.value.pageSize = pageSize
    queryInfo.value.page = 1

    void getLists()
  }
})

async function getLists() {
  const requestId = ++listRequestId
  const sessionId = modalSessionId
  const requestParams = {
    service_access_id: device_config_id.value,
    service_type: queryInfo.value.service_type,
    page: queryInfo.value.page,
    page_size: queryInfo.value.pageSize,
    protocol_type: service_identifier.value
  }
  clearServiceError()
  pageData.value.loading = true

  try {
    // Fetch device list and config templates in parallel so tableData is
    // only written once — with options already populated. This prevents
    // NSelect from rendering with undefined options between the two awaits,
    // which caused `createValOptMap` null-pointer crashes on page change.
    const [deviceResponse, protocolResponse] = await Promise.all([
      getServiceListDrop(
        {
          service_access_id: requestParams.service_access_id,
          service_type: requestParams.service_type,
          page: requestParams.page,
          page_size: requestParams.page_size
        },
        { silentError: true }
      ),
      getSelectServiceMenuList(
        {
          device_type: '',
          device_config_name: '',
          protocol_type: requestParams.protocol_type
        },
        { silentError: true }
      )
    ])

    if (requestId !== listRequestId || sessionId !== modalSessionId || !serviceModal.value) return
    if (isFlatRequestFailure(deviceResponse)) {
      showServiceListFailure(deviceResponse)
      return
    }
    if (isFlatRequestFailure(protocolResponse)) {
      showServiceListFailure(protocolResponse)
      return
    }

    const data = deviceResponse.data
    const options = normalizeTemplateOptions(protocolResponse.data)

    const nextBoundDeviceKeys = new Set(boundDeviceKeys.value)
    const nextSelectedDeviceDrafts = new Map(selectedDeviceDrafts.value)
    const list: any[] = (Array.isArray(data?.list) ? data.list : []).map((source: any) => ({
      ...source,
      options
    }))

    list.forEach((item: any) => {
      const deviceNumber = String(item.device_number)
      // Auto-fill device_name from device_number when empty so the user always
      // sees a meaningful default and can still edit it inline.
      if (!item.device_name && item.device_number) {
        item.device_name = item.device_number
      }
      if (item.is_bind) {
        nextBoundDeviceKeys.add(deviceNumber)
        nextSelectedDeviceDrafts.set(deviceNumber, { ...item })
      }
      const cached = nextSelectedDeviceDrafts.get(deviceNumber)
      if (cached) {
        if (cached.device_config_id) {
          item.device_config_id = cached.device_config_id
        }
        if (cached.device_name) {
          item.device_name = cached.device_name
        }
        nextSelectedDeviceDrafts.set(deviceNumber, { ...cached, ...item })
      }
    })

    boundDeviceKeys.value = nextBoundDeviceKeys
    selectedDeviceDrafts.value = nextSelectedDeviceDrafts
    pageData.value.tableData = list
    checkedRowKeys.value = Array.from(
      new Set([...nextBoundDeviceKeys, ...checkedRowKeys.value.map(String), ...nextSelectedDeviceDrafts.keys()])
    )
    queryInfo.value.itemCount = Number(data?.total || 0)
    queryInfo.value.total = Number(data?.total || 0)
  } catch {
    if (requestId !== listRequestId || sessionId !== modalSessionId || !serviceModal.value) return

    pageData.value.tableData = []
    queryInfo.value.itemCount = 0
    queryInfo.value.total = 0
    showServiceError('获取三方设备列表失败，请检查接入点配置或上游连接')
  } finally {
    if (requestId === listRequestId && sessionId === modalSessionId) {
      pageData.value.loading = false
    }
  }
}

const columns: any = ref([
  {
    type: 'selection',
    disabled(row: any) {
      return row.is_bind
    }
  },
  {
    title: $t('generate.device-name'),
    key: 'device_name',
    minWidth: '200px',
    render: (row: any) => {
      return (
        <NInput
          value={row.device_name}
          placeholder={row.device_number || $t('generate.device-name')}
          disabled={row.is_bind}
          onUpdateValue={(val: string) => {
            row.device_name = val
            const deviceNumber = String(row.device_number)
            const cached = selectedDeviceDrafts.value.get(deviceNumber)
            if (cached) {
              selectedDeviceDrafts.value.set(deviceNumber, { ...cached, device_name: val })
            } else if (checkedRowKeys.value.map(String).includes(deviceNumber)) {
              selectedDeviceDrafts.value.set(deviceNumber, { ...row, device_name: val })
            }
          }}
        />
      )
    }
  },
  {
    title: $t('generate.device-number'),
    key: 'device_number',
    minWidth: '400px'
  },
  {
    title: $t('card.deviceConfigTemplate'),
    key: 'create_at',
    render: (row) => {
      return (
        <NSelect
          v-model:value={row.device_config_id}
          label-field={'name'}
          value-field={'id'}
          placeholder={$t('card.chooseDeviceType')}
          options={normalizeTemplateOptions(row.options)}
          disabled={row.is_bind}
          clearable
          onUpdateValue={(value) => {
            row.device_config_id = value
            const deviceNumber = String(row.device_number)
            const cached = selectedDeviceDrafts.value.get(deviceNumber)
            if (cached) {
              selectedDeviceDrafts.value.set(deviceNumber, { ...cached, device_config_id: value })
            } else if (row.is_bind || checkedRowKeys.value.map(String).includes(deviceNumber)) {
              selectedDeviceDrafts.value.set(deviceNumber, { ...row, device_config_id: value })
            }
          }}
        />
      )
    }
  }
])

async function reconcileSubmission(
  selectedDeviceNumbers: string[],
  sessionId: number
) {
  const selected = new Set(selectedDeviceNumbers)
  const pageSize = 1000

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const observed = new Map<string, boolean>()
      let page = 1
      let total = Number.POSITIVE_INFINITY

      while ((page - 1) * pageSize < total && observed.size < selected.size) {
        const response = await getServiceListDrop(
          {
            service_access_id: device_config_id.value,
            service_type: queryInfo.value.service_type,
            page,
            page_size: pageSize
          },
          { silentError: true }
        )
        if (sessionId !== modalSessionId || !serviceModal.value) return
        if (isFlatRequestFailure(response)) {
          emit('getList')
          if (response.error.status === 401) {
            close()
            return
          }

          showServiceError(
            response.error.message
              ? `无法确认提交结果：${response.error.message}。请刷新页面后检查，当前已禁止再次提交。`
              : '无法确认提交结果，请刷新页面后检查。为避免重复绑定，当前已禁止再次提交。'
          )
          return
        }

        const rows: any[] = Array.isArray(response.data?.list) ? response.data.list : []
        rows.forEach((row) => {
          const deviceNumber = String(row.device_number)
          if (selected.has(deviceNumber)) {
            observed.set(deviceNumber, row.is_bind === true)
          }
        })

        const reportedTotal = Number(response.data?.total)
        total = Number.isFinite(reportedTotal) ? reportedTotal : (page - 1) * pageSize + rows.length
        if (rows.length === 0) break
        page += 1
      }

      const states = selectedDeviceNumbers.map((deviceNumber) => observed.get(deviceNumber))
      if (states.every((isBound) => isBound === true)) {
        emit('getList')
        window.$message?.warning('设备已创建，插件同步状态未知，请稍后刷新检查。')
        close()
        return
      }

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300))
        if (sessionId !== modalSessionId || !serviceModal.value) return
        continue
      }

      emit('getList')
      if (states.every((isBound) => isBound === false)) {
        showServiceError('无法确认提交是否落库，请刷新页面检查。为避免重复创建设备，当前已禁止再次提交。')
        return
      }

      showServiceError('无法确认提交结果，请刷新页面后检查。为避免重复绑定，当前已禁止再次提交。')
    }
  } catch {
    if (sessionId !== modalSessionId || !serviceModal.value) return

    emit('getList')
    showServiceError('无法确认提交结果，请刷新页面后检查。为避免重复绑定，当前已禁止再次提交。')
  }
}

const submitSevice: () => void = async () => {
  // 0. Check service_access_id
  if (!device_config_id.value) {
    window.$message?.error($t('card.serviceAccessIdNotSet') || '服务访问ID未设置，无法提交')
    return
  }

  // 1. Get all selected device numbers
  const selectedDeviceNumbers = checkedRowKeys.value.map(String).filter((key) => key && !boundDeviceKeys.value.has(key))

  if (!selectedDeviceNumbers || selectedDeviceNumbers.length === 0) {
    close()
    emit('getList')
    return
  }

  const checkedDevicesOnCurrentPageMap = new Map() // Use Map for faster lookup

  pageData.value.tableData.forEach((item) => {
    // Store current page data for lookup
    checkedDevicesOnCurrentPageMap.set(item.device_number, item)
  })

  const selectedRows = selectedDeviceNumbers.map((deviceNumber) => ({
    deviceNumber,
    rowData: checkedDevicesOnCurrentPageMap.get(deviceNumber) || selectedDeviceDrafts.value.get(deviceNumber)
  }))
  const missingConfigRows = selectedRows.filter(({ rowData }) => !rowData?.device_config_id)
  if (missingConfigRows.length > 0) {
    showServiceError(`请选择设备配置模板后再提交（${missingConfigRows[0].deviceNumber}）`)
    return
  }
  const missingNameRows = selectedRows.filter(({ rowData }) => !String(rowData?.device_name || '').trim())
  if (missingNameRows.length > 0) {
    showServiceError(`请输入设备名称后再提交（${missingNameRows[0].deviceNumber}）`)
    return
  }

  // 3. Build device_list payload from the drafts retained across pages.
  const deviceListPayload = selectedRows.map(({ rowData }) => {
    return {
      device_number: rowData.device_number,
      device_name: String(rowData.device_name).trim(),
      description: rowData.description,
      device_config_id: rowData.device_config_id
    }
  })

  const params = {
    service_access_id: device_config_id.value,
    device_list: deviceListPayload
  }

  // 4. Call API and handle result/error
  if (submitting.value) return

  const sessionId = modalSessionId
  submitting.value = true
  clearServiceError()
  try {
    const result = await batchAddServiceMenuList(params, { silentError: true })
    if (sessionId !== modalSessionId || !serviceModal.value) return

    if (isFlatRequestFailure(result)) {
      if (result.error.status === 401) {
        submitting.value = false
        return
      }
      if (
        isDeterministicBatchRejection(result.error) ||
        (result.error.status !== undefined && result.error.status >= 400 && result.error.status < 500)
      ) {
        submitting.value = false
        showServiceError(result.error.message || '设备参数校验失败')
        return
      }

      await reconcileSubmission(selectedDeviceNumbers, sessionId)
      return
    }

    if (result.error === null) {
      const response = readDeviceBatchResponse(result.data)
      if (response?.delivery.status === 'delivered') {
        window.$message?.success($t('common.operationSuccess'))
        close()
        emit('getList')
        return
      }

      if (response && ['pending', 'processing'].includes(response.delivery.status)) {
        const eventLabel = response.delivery.event_id.slice(0, 8)
        window.$message?.warning(`设备已创建，插件同步中（事件 ${eventLabel}）`)
        close()
        emit('getList')
        return
      }

      await reconcileSubmission(selectedDeviceNumbers, sessionId)
      return
    }
  } catch {
    if (sessionId !== modalSessionId || !serviceModal.value) return

    await reconcileSubmission(selectedDeviceNumbers, sessionId)
  }
}
function openModal(val: any, row: any, edit: any) {
  if (submitting.value) return

  modalSessionId += 1
  listRequestId += 1
  clearServiceError()
  selectedDeviceDrafts.value = new Map()
  boundDeviceKeys.value = new Set()
  checkedRowKeys.value = []
  queryInfo.value.page = 1
  accessPointContext.value = {
    voucher: val,
    row,
    edit: !!edit
  }
  isEdit.value = !!edit
  queryInfo.value.voucher = val
  device_config_id.value = row?.id || row
  serviceModal.value = true
  submitting.value = false

  void getLists()
}

function close() {
  modalSessionId += 1
  listRequestId += 1
  serviceModal.value = false
  clearServiceError()
  submitting.value = false
  pageData.value.loading = false
  isEdit.value = false
  checkedRowKeys.value = []
  selectedDeviceDrafts.value = new Map()
  boundDeviceKeys.value = new Set()
  pageData.value.tableData = []
  accessPointContext.value = null
}

function handleModalVisibilityChange(show: boolean) {
  if (show) {
    serviceModal.value = true
  } else if (!submitting.value) {
    close()
  }
}

const backToAccessPointConfig = () => {
  if (submitting.value) return

  const context = accessPointContext.value
  close()
  if (!context) return
  emit('go-back', {
    ...context.row,
    voucher: context.voucher
  })
}

const handleCheck = (rowKeys: any /*, rows: any, meta: any */) => {
  const selected = new Set<string>(Array.isArray(rowKeys) ? rowKeys.map(String) : [])
  pageData.value.tableData.forEach((row: any) => {
    const deviceNumber = String(row.device_number)
    if (row.is_bind) {
      boundDeviceKeys.value.add(deviceNumber)
      selectedDeviceDrafts.value.set(deviceNumber, { ...row })
      return
    }
    if (selected.has(deviceNumber)) {
      selectedDeviceDrafts.value.set(deviceNumber, { ...row })
    } else {
      selectedDeviceDrafts.value.delete(deviceNumber)
    }
  })
  checkedRowKeys.value = Array.from(new Set([...boundDeviceKeys.value, ...selectedDeviceDrafts.value.keys()]))
}

onBeforeUnmount(() => {
  modalSessionId += 1
  listRequestId += 1
  clearServiceError()
})

defineExpose({ openModal })
</script>

<template>
  <n-modal
    :show="serviceModal"
    preset="dialog"
    :title="modalTitle"
    class="device_model"
    :closable="!submitting"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    @update:show="handleModalVisibilityChange"
  >
    <div class="service-config-shell">
      <NAlert type="info" class="mb-12px">
        每台设备都必须选择设备配置模板。模板决定认证方式、物模型、中文名称、单位、图表和自定义面板。
      </NAlert>
      <div class="table-area">
        <NDataTable
          ref="NTableRef"
          v-model:checked-row-keys="checkedRowKeys"
          :remote="true"
          :columns="columns"
          :data="pageData.tableData"
          :loading="pageData.loading"
          :pagination="queryInfo"
          :row-key="(row) => row.device_number"
          class="flex-1-hidden"
          @update:checked-row-keys="handleCheck"
        />
      </div>
      <div class="footer">
        <NButton type="primary" class="btn" :loading="submitting" @click="submitSevice">
          {{ $t('common.confirm') }}
        </NButton>
        <NButton v-if="isEdit" :disabled="submitting" @click="backToAccessPointConfig">上一步</NButton>
        <NButton :disabled="submitting" @click="handleModalVisibilityChange(false)">
          {{ $t('common.cancel') }}
        </NButton>
      </div>
    </div>
  </n-modal>
</template>

<style lang="scss" scoped>
.service-config-shell {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 220px);
  min-height: 0;
}

.table-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.selectType {
  width: 100%;
}
.footer {
  display: flex;
  flex-direction: row-reverse;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--n-border-color);
  background: var(--n-color);
  position: sticky;
  bottom: 0;
  z-index: 1;
  .btn {
    margin-left: 0;
  }
}
</style>

<style>
.device_model {
  width: 70% !important;
}

.device_model .n-dialog {
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
}

.device_model .n-dialog__content {
  overflow: hidden;
}
</style>
