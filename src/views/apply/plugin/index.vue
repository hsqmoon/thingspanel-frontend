<script setup lang="tsx">
import { onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NPopconfirm, NSpace, NTag } from 'naive-ui'
import { delRegisterService, getServices } from '@/service/api/plugin'
import { $t } from '@/locales'
import { componentLogger } from '@/utils/logger'
import serviceConfigModal from './components/serviceConfigModal.vue'
import serviceModal from './components/serviceModal.vue'
const serviceModalRef = ref<any>(null)
const serviceConfigModalRef = ref<any>(null)
let listRequestId = 0

const pageData = ref<any>({
  loading: false,
  tableData: [],
  options: [
    {
      label: $t('generate.all'),
      value: ''
    },
    {
      label: $t('card.accessProtocol'),
      value: 1
    },
    {
      label: $t('card.accessService'),
      value: 2
    }
  ]
})

const queryInfo = ref<any>({
  page: 1,
  page_size: 10,
  service_type: '',
  total: 0,
  showSizePicker: true,
  pageSizes: [10, 15, 20, 25, 30],
  itemCount: 0,
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
  const requestId = ++listRequestId
  const params = {
    page: queryInfo.value.page,
    page_size: queryInfo.value.page_size,
    service_type: queryInfo.value.service_type
  }
  pageData.value.loading = true

  try {
    const { data }: { data: any } = await getServices(params)
    if (requestId !== listRequestId) return

    pageData.value.tableData = Array.isArray(data?.list) ? data.list : []
    queryInfo.value.itemCount = Number(data?.total || 0)
  } catch (error: any) {
    if (requestId !== listRequestId) return

    componentLogger.error('Failed to load plugin services', error)
    window.$message?.destroyAll()
    window.$message?.error(error?.response?.data?.message || error?.message || $t('common.operationFailed'))
  } finally {
    if (requestId === listRequestId) {
      pageData.value.loading = false
    }
  }
}

const edit: (row: any) => void = row => {
  serviceModalRef.value.openModal(row)
}
const del: (row: any) => void = async row => {
  await delRegisterService(row)
  await getList()
}
const config: (row: any) => void = row => {
  serviceConfigModalRef.value.openModal(row)
}
const columns: any = ref([
  {
    title: $t('card.pluginName'),
    key: 'name',
    minWidth: '200px'
  },
  {
    title: $t('card.type'),
    key: 'service_type',
    minWidth: '140px',
    align: 'center',
    render: row => {
      if (row.service_type) {
        return <span>{row.service_type === 1 ? $t('card.accessProtocol') : $t('card.accessService')}</span>
      }
      return <span></span>
    }
  },
  {
    title: $t('card.description'),
    key: 'description'
  },
  {
    title: $t('card.version'),
    key: 'version'
  },
  {
    title: $t('generate.status'),
    key: 'service_heartbeat',
    minWidth: '140px',
    align: 'center',
    render: row => {
      if (row.service_heartbeat) {
        return (
          <NTag type={row.service_heartbeat === 1 ? 'success' : 'error'}>
            {row.service_heartbeat === 1 ? $t('card.running') : $t('card.stopped')}
          </NTag>
        )
      }
      return <span></span>
    }
  },
  {
    key: 'actions',
    title: () => $t('common.actions'),
    align: 'left',
    minWidth: '220px',
    render: row => {
      return (
        <NSpace justify={'start'}>
          {
            <NButton size={'small'} type="primary" onClick={() => edit(row)}>
              {$t('common.edit')}
            </NButton>
          }
          {
            <NButton size={'small'} type="primary" onClick={() => config(row)}>
              {$t('common.pluginConfig')}
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
  serviceModalRef.value.openModal()
}

watch(
  () => queryInfo.value.service_type,
  () => {
    void getList()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  listRequestId += 1
})

void getList()
</script>

<template>
  <div>
    <NCard :title="$t('route.apply_in')" :bordered="false" class="h-full rounded-8px shadow-sm">
      <div class="header">
        <n-select
          v-model:value="queryInfo.service_type"
          class="selectType"
          :placeholder="$t('card.selectSong')"
          :options="pageData.options"
        />
        <NButton type="primary" @click="addData">{{ $t('card.addNewPlugin') }}</NButton>
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
    <serviceModal ref="serviceModalRef" @get-list="getList"></serviceModal>
    <serviceConfigModal ref="serviceConfigModalRef" @get-list="getList"></serviceConfigModal>
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
