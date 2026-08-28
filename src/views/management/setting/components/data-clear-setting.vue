<script setup lang="tsx">
import { reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { NButton, NSpace, NTag } from 'naive-ui'
import type { DataTableColumns, FormInst } from 'naive-ui'
import dayjs from 'dayjs'
import { isFlatRequestFailure } from '@sa/axios'
import { useBoolean, useLoading } from '@sa/hooks'
import { dataClearSettingEnabledTypeOptions } from '@/constants/business'
import { editDataClear, fetchDataClearList } from '@/service/api/setting'
import { deepClone } from '@/utils/common/tool'
import { $t } from '@/locales'

const { loading, startLoading, endLoading } = useLoading(false)
const { bool: visible, setTrue: openModal, setFalse: closeModal } = useBoolean()

const tableData = ref<GeneralSetting.DataClearSetting[]>([])
let tableRequestEpoch = 0

function setTableData(data: GeneralSetting.DataClearSetting[]) {
  tableData.value = data
}

type QueryFormModel = {
  page: number
  page_size: number
}

const queryParams = reactive<QueryFormModel>({
  page: 1,
  page_size: 10
})

async function getTableData() {
  const epoch = ++tableRequestEpoch
  startLoading()
  try {
    const response = await fetchDataClearList(queryParams)
    if (epoch !== tableRequestEpoch || isFlatRequestFailure(response) || !response.data) return

    setTableData(response.data.list)
  } finally {
    if (epoch === tableRequestEpoch) {
      endLoading()
    }
  }
}

const columns: Ref<DataTableColumns<GeneralSetting.DataClearSetting>> = ref([
  {
    key: 'id',
    title: 'ID',
    align: 'center',
    width: '100px'
  },
  {
    key: 'data_type',
    title: () => $t('page.manage.setting.dataClearSetting.form.cleanupType'),
    align: 'left',
    render: row => {
      if (row.data_type) {
        const tagTypes: Record<GeneralSetting.CleanupTypeKey, NaiveUI.ThemeColor> = {
          '1': 'success',
          '2': 'warning'
        }
        const key =
          row.data_type === '1'
            ? 'page.manage.setting.dataClearSetting.type.equipmentData'
            : 'page.manage.setting.dataClearSetting.type.operationLog'
        return <NTag type={tagTypes[row.data_type]}>{$t(key)}</NTag>
      }
      return <span></span>
    }
  },
  {
    key: 'retention_days',
    title: () => $t('page.manage.setting.dataClearSetting.form.retentionDays'),
    align: 'left'
  },
  {
    key: 'last_cleanup_time',
    title: () => $t('page.manage.setting.dataClearSetting.form.lastCleanupTime'),
    align: 'left',
    render: row => {
      return <span>{dayjs(row.last_cleanup_time).format('YYYY-MM-DD HH:mm:ss')}</span>
    }
  },
  {
    key: 'last_cleanup_data_time',
    title: () => $t('page.manage.setting.dataClearSetting.form.lastCleanupDataTime'),
    align: 'left',
    render: row => {
      return <span>{dayjs(row.last_cleanup_data_time).format('YYYY-MM-DD HH:mm:ss')}</span>
    }
  },
  {
    key: 'remark',
    title: () => $t('common.remark'),
    align: 'left'
  },
  {
    key: 'actions',
    title: () => $t('common.actions'),
    align: 'center',
    width: '100px',
    render: row => {
      return (
        <NSpace justify={'center'}>
          <NButton size={'small'} type="primary" onClick={() => handleEditTable(row)}>
            {$t('common.edit')}
          </NButton>
        </NSpace>
      )
    }
  }
]) as Ref<DataTableColumns<GeneralSetting.DataClearSetting>>

const formRef = ref<HTMLElement & FormInst>()
const submitting = ref(false)
let modalSession = 0

type FormModel = Pick<GeneralSetting.DataClearSetting, 'retention_days' | 'enabled' | 'remark'>

const editData = reactive<FormModel>(createDefaultFormModel())

function createDefaultFormModel(): FormModel {
  return {
    retention_days: 0,
    enabled: '1',
    remark: null
  }
}

function setEditData(data: GeneralSetting.DataClearSetting | null) {
  Object.assign(editData, data)
}

function handleEditTable(row: any) {
  setEditData(row)
  openModal()
}

async function handleSubmit() {
  if (submitting.value) return
  const session = modalSession
  submitting.value = true
  try {
    try {
      await formRef.value?.validate()
    } catch (error) {
      if (error === undefined || Array.isArray(error)) return
      throw error
    }
    if (session !== modalSession) return

    const formData = deepClone(editData)
    const response = await editDataClear(formData)
    if (session !== modalSession || isFlatRequestFailure(response)) return

    window.$message?.success($t('common.editSuccess'))
    closeModal()
    await getTableData()
  } finally {
    if (session === modalSession) {
      submitting.value = false
    }
  }
}

watch(visible, () => {
  modalSession += 1
  submitting.value = false
})

function init() {
  getTableData()
}

init()
</script>

<template>
  <div class="h-full flex-col">
    <NDataTable :columns="columns" :data="tableData" :loading="loading" flex-height min-height="150px" />

    <NModal v-model:show="visible" preset="card" :title="$t('common.edit')" class="w-700px">
      <NForm ref="formRef" label-placement="left" :label-width="120" :model="editData">
        <NGrid :cols="24" :x-gap="18">
          <NFormItemGridItem :span="24" :label="$t('page.manage.setting.dataClearSetting.form.retentionDays')">
            <NInputNumber v-model:value="editData.retention_days" class="flex-1" />
          </NFormItemGridItem>
          <NFormItemGridItem :span="24" :label="$t('page.manage.setting.dataClearSetting.form.enabled')" path="enabled">
            <NRadioGroup v-model:value="editData.enabled">
              <NRadio v-for="item in dataClearSettingEnabledTypeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </NRadio>
            </NRadioGroup>
          </NFormItemGridItem>
          <NFormItemGridItem :span="24" :label="$t('common.remark')">
            <NInput v-model:value="editData.remark" type="textarea" placeholder="" />
          </NFormItemGridItem>
        </NGrid>
        <NSpace class="w-full pt-16px" :size="24" justify="center">
          <NButton class="w-72px" type="primary" :loading="submitting" @click="handleSubmit">
            {{ $t('common.edit') }}
          </NButton>
        </NSpace>
      </NForm>
    </NModal>
  </div>
</template>

<style lang="scss"></style>
