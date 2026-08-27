<script setup lang="tsx">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert, NInput, NSelect } from 'naive-ui'
import { batchAddServiceMenuList, getSelectServiceMenuList, getServiceListDrop } from '@/service/api/plugin'
import { deviceConfigMenu } from '@/service/api/device'
import { $t } from '@/locales'
import { componentLogger } from '@/utils/logger'

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
const accessPointContext = ref<{
  voucher: string
  row: any
  edit: boolean
} | null>(null)

const pageData = ref<any>({
  loading: false,
  tableData: []
})

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
    queryInfo.value.page = page

    void getLists()
  },
  onUpdatePageSize: (pageSize: number) => {
    queryInfo.value.pageSize = pageSize
    queryInfo.value.page = 1

    void getLists()
  }
})

async function getLists() {
  const requestId = ++listRequestId
  const sessionId = modalSessionId
  const requestParams = {
    voucher: queryInfo.value.voucher,
    service_type: queryInfo.value.service_type,
    page: queryInfo.value.page,
    page_size: queryInfo.value.pageSize,
    protocol_type: service_identifier.value
  }
  pageData.value.loading = true

  try {
    // Fetch device list and config templates in parallel so tableData is
    // only written once — with options already populated. This prevents
    // NSelect from rendering with undefined options between the two awaits,
    // which caused `createValOptMap` null-pointer crashes on page change.
    const [{ data }, { data: res }] = await Promise.all([
      getServiceListDrop({
        voucher: requestParams.voucher,
        service_type: requestParams.service_type,
        page: requestParams.page,
        page_size: requestParams.page_size
      }),
      (async () => {
        const protocolScoped = await getSelectServiceMenuList({
          device_type: '',
          device_config_name: '',
          protocol_type: requestParams.protocol_type
        })
        const protocolScopedOptions = normalizeTemplateOptions(protocolScoped?.data)
        if (protocolScopedOptions.length > 0) {
          return { data: protocolScopedOptions }
        }
        const fallback = await deviceConfigMenu({
          name: ''
        })
        return { data: normalizeTemplateOptions(fallback?.data) }
      })()
    ])

    if (requestId !== listRequestId || sessionId !== modalSessionId || !serviceModal.value) return

    const options = normalizeTemplateOptions(res)
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
  } catch (error: any) {
    if (requestId !== listRequestId || sessionId !== modalSessionId || !serviceModal.value) return

    pageData.value.tableData = []
    queryInfo.value.itemCount = 0
    queryInfo.value.total = 0
    const message =
      error?.response?.data?.message || error?.message || '获取三方设备列表失败，请检查接入点配置或上游连接'
    window.$message?.error(message)
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
    render: row => {
      return (
        <NSelect
          v-model:value={row.device_config_id}
          label-field={'name'}
          value-field={'id'}
          placeholder={$t('card.chooseDeviceType')}
          options={normalizeTemplateOptions(row.options)}
          clearable
          onUpdateValue={value => {
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
const submitSevice: () => void = async () => {
  // 0. Check service_access_id
  if (!device_config_id.value) {
    window.$message?.error($t('card.serviceAccessIdNotSet') || '服务访问ID未设置，无法提交')
    return
  }

  // 1. Get all selected device numbers
  const selectedDeviceNumbers = checkedRowKeys.value.map(String).filter(key => key && !boundDeviceKeys.value.has(key))

  if (!selectedDeviceNumbers || selectedDeviceNumbers.length === 0) {
    window.$message?.success('接入点配置已保存')
    close()
    emit('getList')
    return
  }

  const checkedDevicesOnCurrentPageMap = new Map() // Use Map for faster lookup

  pageData.value.tableData.forEach(item => {
    // Store current page data for lookup
    checkedDevicesOnCurrentPageMap.set(item.device_number, item)
  })

  // 3. Build device_list payload, attempting to include name and config_id if available on current page
  const deviceListPayload = selectedDeviceNumbers.map(deviceNumber => {
    const rowData = checkedDevicesOnCurrentPageMap.get(deviceNumber) || selectedDeviceDrafts.value.get(deviceNumber)
    if (rowData) {
      // Device is on the current page, include all details
      return {
        device_number: rowData.device_number,
        device_name: rowData.device_name,
        description: rowData.description,
        device_config_id: rowData.device_config_id || undefined,
        protocol_config: safeParseJSON(rowData.protocol_config),
        additional_info: safeParseJSON(rowData.additional_info)
      }
    } else {
      // Device was selected on another page, only send number
      // Backend MUST handle this case (missing name/config_id)
      return {
        device_number: deviceNumber
        // device_name: null, // Or omit entirely
        // device_config_id: null // Or omit entirely
      }
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
  try {
    const result: any = await batchAddServiceMenuList(params)
    if (sessionId !== modalSessionId || !serviceModal.value) return

    if (result && result.data) {
      window.$message?.success($t('common.operationSuccess'))
      close()
      emit('getList')
    } else {
      componentLogger.error('Service configuration submission failed', result)
      window.$message?.destroyAll()
      window.$message?.error(result?.message || $t('common.operationFailed'))
    }
  } catch (error: any) {
    componentLogger.error('Failed to submit service configuration', error)
    if (sessionId !== modalSessionId || !serviceModal.value) return

    const errorMessage = error?.response?.data?.message || error?.message || $t('common.operationFailed')
    window.$message?.destroyAll()
    window.$message?.error(errorMessage)
  } finally {
    if (sessionId === modalSessionId) {
      submitting.value = false
    }
  }
}
function openModal(val: any, row: any, edit: any) {
  if (submitting.value) return

  modalSessionId += 1
  listRequestId += 1
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
})

defineExpose({ openModal })

function safeParseJSON(value: any) {
  if (!value || typeof value !== 'string') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
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
        设备模板现在是可选的。不选模板也可以绑定设备并查看原始遥测数据；选择模板后会带出中文名称、单位、图表和自定义面板。
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
          :row-key="row => row.device_number"
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
