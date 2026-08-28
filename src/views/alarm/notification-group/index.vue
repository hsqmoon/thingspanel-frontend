<script setup lang="tsx">
import { computed, getCurrentInstance, reactive, ref } from 'vue'
import type { Ref } from 'vue'
import { NButton, NPopconfirm, NSpace, NSwitch } from 'naive-ui'
import type { DataTableColumns, PaginationProps } from 'naive-ui'
import { isFlatRequestFailure } from '@sa/axios'
import {
  deleteNotificationGroup,
  getNotificationGroupDetail,
  getNotificationGroupList,
  putNotificationGroup
} from '@/service/api/notification'
import { notificationOptions } from '@/constants/business'
import { $t } from '@/locales'
import type { ModalType } from './components/table-action-modal.vue'
import TableActionModal from './components/table-action-modal.vue'
import { useBoolean, useLoading } from '~/packages/hooks'

const { loading, startLoading, endLoading } = useLoading(false)
const { bool: visible, setTrue: openModal } = useBoolean()
const tableData = ref<Api.Alarm.NotificationGroupList[]>([])
const total = ref(0)

function setTableData(data: Api.Alarm.NotificationGroupList[]) {
  tableData.value = data
}

const pagination: PaginationProps = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 15, 20, 25, 30],
  onChange: (page: number) => {
    pagination.page = page
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize
    pagination.page = 1
  }
})

const getTableData = async () => {
  startLoading()
  try {
    const params = {
      page: pagination.page || 1,
      page_size: pagination.pageSize || 10
    }
    const response = await getNotificationGroupList(params)
    if (isFlatRequestFailure(response)) return

    setTableData(response.data.list || [])
    total.value = response.data.total || 0
  } finally {
    endLoading()
  }
}

const handleSwitchChange = async (row, value) => {
  const { id = '', ...params } = row
  const response = await putNotificationGroup({ ...params, status: value ? 'OPEN' : 'CLOSE' }, id)
  if (isFlatRequestFailure(response)) return

  await getTableData()
}
const handleDeleteTable = async (rowId: string) => {
  const response = await deleteNotificationGroup({ id: rowId })
  if (isFlatRequestFailure(response)) return

  window.$message?.info($t('generate.notificationGroup'))
  await getTableData()
}
const editData = ref<Api.Alarm.NotificationGroupList | null>(null)
const handleEditTable = async (rowId: string) => {
  const response = await getNotificationGroupDetail({ id: rowId })
  if (isFlatRequestFailure(response)) return

  editData.value = response.data
  setModalType('edit')
  openModal()
}
const columns = ref([
  {
    key: 'name',
    title: $t('generate.notification-group-name'),
    minWidth: '140px',
    align: 'left'
  },
  {
    key: 'notification_type',
    title: $t('generate.notification-type'),
    align: 'left',
    minWidth: '140px',
    render: (row: any) => {
      const notificationType = notificationOptions.find(option => option.value === row.notification_type)?.label || ''
      return notificationType
    }
  },
  {
    key: 'status',
    title: $t('generate.status'),
    align: 'left',
    minWidth: '140px',
    render: (row: any) => {
      return <NSwitch value={row.status === 'OPEN'} onChange={value => handleSwitchChange(row, value)} />
    }
  },
  {
    key: 'actions',
    title: $t('common.actions'),
    align: 'left',
    width: '200px',
    render: (row: any) => {
      return (
        <NSpace justify={'start'}>
          <NButton size={'small'} type="primary" onClick={() => handleEditTable(row.id)}>
            {$t('common.edit')}
          </NButton>
          <NPopconfirm onPositiveClick={() => handleDeleteTable(row.id)}>
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
]) as Ref<DataTableColumns<DataService.Data>>

const modalType = ref<ModalType>('add')

function setModalType(type: ModalType) {
  modalType.value = type
}

function handleAddTable() {
  openModal()
  setModalType('add')
}

const getPlatform = computed(() => {
  const { proxy }: any = getCurrentInstance()
  return proxy.getPlatform()
})
getTableData()
</script>

<template>
  <div>
    <NCard :title="$t('generate.notification-group')">
      <template #header-extra>
        <NButton type="primary" @click="handleAddTable">+{{ $t('device_template.add') }}</NButton>
      </template>
      <div class="h-full flex-col">
        <NDataTable :columns="columns" :data="tableData" :loading="loading" />
        <div class="pagination-box">
          <NPagination v-model:page="pagination.page" :item-count="total" @update:page="getTableData" />
        </div>
        <TableActionModal
          v-model:visible="visible"
          :class="getPlatform ? 'w-90%' : 'w-600px'"
          :type="modalType"
          :edit-data="editData"
          @get-table-data="getTableData"
        />
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.pagination-box {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
