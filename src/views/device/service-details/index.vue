<script setup lang="tsx">
import { onBeforeUnmount, ref, watch } from 'vue'
import { isFlatRequestFailure } from '@sa/axios'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NPopconfirm, NSpace, type MessageReactive } from 'naive-ui'
import dayjs from 'dayjs'
import { delServiceAccess, getServiceAccess } from '@/service/api/plugin'
import { $t } from '@/locales'
import serviceModal from './components/serviceModal.vue'
import serviceConfigModal from './components/serviceConfigModal.vue'

const route: any = useRoute()
const router: any = useRouter()
const serviceModalRef = ref<any>(null)
const serviceConfigModalRef = ref<any>(null)
const service_plugin_id = ref<any>(route.query.id)
let listRequestId = 0
let isActive = true
let listErrorMessage: MessageReactive | null = null
const pageData = ref<any>({
  loading: false,
  tableData: []
})

const queryInfo = ref<any>({
  service_plugin_id: service_plugin_id.value,
  page: 1,
  page_size: 10,
  total: 0,
  pageSizes: [10, 15, 20, 25, 30],
  onChange: (page: number) => {
    queryInfo.value.page = page
    void getList()
  },
  onUpdatePageSize: (pageSize: number) => {
    queryInfo.value.page_size = pageSize
    queryInfo.value.page = 1
    void getList()
  }
})

async function getList() {
  if (!isActive) return

  const requestId = ++listRequestId
  const params = {
    service_plugin_id: queryInfo.value.service_plugin_id,
    page: queryInfo.value.page,
    page_size: queryInfo.value.page_size
  }
  pageData.value.loading = true

  try {
    const response = await getServiceAccess(params)
    if (!isActive || requestId !== listRequestId) return

    if (isFlatRequestFailure(response)) {
      if (response.error.status === 401) return

      listErrorMessage?.destroy()
      listErrorMessage = window.$message?.error(response.error.message || $t('common.operationFailed')) || null
      return
    }

    const { data } = response
    pageData.value.tableData = Array.isArray(data?.list) ? data.list : []
    queryInfo.value.itemCount = Number(data?.total || 0)
  } catch {
    if (!isActive || requestId !== listRequestId) return

    listErrorMessage?.destroy()
    listErrorMessage = window.$message?.error($t('common.operationFailed')) || null
  } finally {
    if (isActive && requestId === listRequestId) {
      pageData.value.loading = false
    }
  }
}

const see: (row: any) => void = (row) => {
  router.push(
    `/device/manage?service_identifier=${route.query.service_identifier}&device_name=${row.name}&service_access_id=${row.id}`
  )
}
const del: (row: any) => void = async (row) => {
  const result = await delServiceAccess(row)
  if (!isActive || isFlatRequestFailure(result)) return

  await getList()
}
const config: (row: any) => void = (row) => {
  serviceModalRef.value.openModal(service_plugin_id.value, row)
}
const columns: any = ref([
  {
    title: $t('card.accessPointName'),
    key: 'name',
    minWidth: '200px'
  },
  {
    title: $t('common.creationTime'),
    key: 'create_at',
    minWidth: '200px',
    render: (row) => {
      if (row.create_at) {
        return <span>{dayjs(row.create_at).format('YYYY-MM-DD HH:mm:ss')}</span>
      }
      return <span></span>
    }
  },
  {
    key: 'actions',
    title: () => $t('common.actions'),
    align: 'left',
    width: '420px',
    ellipsis: {
      tooltip: {
        width: 420
      }
    },
    render: (row) => {
      return (
        <NSpace justify="start">
          {
            <NButton size={'small'} type="primary" onClick={() => see(row)}>
              {$t('card.viewDevice')}
            </NButton>
          }
          {
            <NButton size={'small'} type="primary" onClick={() => config(row)}>
              {$t('card.modifyConfig')}
            </NButton>
          }
          <NPopconfirm
            negative-text={$t('common.cancel')}
            positive-text={$t('common.confirm')}
            onPositiveClick={() => del(row.id)}
          >
            {{
              default: () => $t('common.confirmDelete'),
              trigger: () => (
                <NButton type="error" size={'small'}>
                  {$t('common.delete')}
                </NButton>
              )
            }}
          </NPopconfirm>
        </NSpace>
      )
    }
  }
])

const addData: () => void = () => {
  serviceModalRef.value.openModal(service_plugin_id.value)
}

const goBackToAccessPoint = (row: any) => {
  serviceModalRef.value.openModal(service_plugin_id.value, row)
}

const isEdit: (val: any, row: any, edit: any) => void = (val, row, edit) => {
  if (edit) {
    if (row && row.auth_type === 'auto') {
      const adaptedRow = {
        ...row,
        mode: 'automatic'
      }
      serviceConfigModalRef.value.openModal(val, adaptedRow, edit)
    } else {
      serviceConfigModalRef.value.openModal(val, row, edit)
    }
    void getList()
  } else {
    serviceConfigModalRef.value.openModal(val, row)
    void getList()
  }
}
watch(
  () => queryInfo.value.service_type,
  () => {
    void getList()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  isActive = false
  listRequestId += 1
  listErrorMessage?.destroy()
  listErrorMessage = null
})

void getList()
</script>

<template>
  <div>
    <NCard :bordered="false" class="h-full rounded-8px shadow-sm" :title="route.query.service_name || '--'">
      <div class="header">
        <NButton type="primary" @click="addData">{{ $t('card.newAccess') }}</NButton>
      </div>
      <div class="h">
        <NDataTable
          :remote="true"
          :columns="columns"
          :data="pageData.tableData"
          :loading="pageData.loading"
          :pagination="queryInfo"
          class="flex-1-hidden"
        />
      </div>
    </NCard>
    <serviceConfigModal
      ref="serviceConfigModalRef"
      @get-list="getList"
      @go-back="goBackToAccessPoint"
    ></serviceConfigModal>
    <serviceModal ref="serviceModalRef" @is-edit="isEdit"></serviceModal>
  </div>
</template>

<style lang="scss" scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  .selectType {
    width: 100px;
  }
}
:deep(.n-data-table__pagination) {
  height: 80px;
}
.h {
  height: max-content;
}
</style>
