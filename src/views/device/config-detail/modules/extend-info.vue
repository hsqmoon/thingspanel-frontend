<script setup lang="tsx">
import type { Ref } from 'vue'
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { isFlatRequestFailure } from '@sa/axios'
import type { DataTableColumns, FormInst } from 'naive-ui'
import { NButton, NPopconfirm, NSpace, NSwitch, useMessage } from 'naive-ui'
import { deviceConfigEdit } from '@/service/api/device'
import { $t } from '@/locales'

const visible = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)
const extendFormRef = ref<HTMLElement & FormInst>()
const extendForm = ref(defaultExtendForm())
const message = useMessage()
const saving = ref(false)
const validating = ref(false)

interface Emits {
  (e: 'upDateConfig'): void
}

const emit = defineEmits<Emits>()

interface Props {
  configInfo?: object | any
}

const props = withDefaults(defineProps<Props>(), {
  configInfo: null
})

function defaultExtendForm() {
  return {
    name: null,
    type: null,
    default_value: null,
    desc: null,
    enable: false
  }
}

const extendFormRules = ref({
  name: {
    required: true,
    message: $t('common.enterName'),
    trigger: 'blur'
  },
  type: {
    required: true,
    message: $t('generate.select-type'),
    trigger: 'change'
  }
})
const extendInfoList = ref([] as any[])
const typeOptions = ref([
  {
    label: 'String',
    value: 'String'
  },
  {
    label: 'Number',
    value: 'Number'
  },
  {
    label: 'Boolean',
    value: 'Boolean'
  }
])
const addDevice = () => {
  visible.value = true
}
const modalClose = () => {}
const handleClose = () => {
  extendFormRef.value?.restoreValidation()
  extendForm.value = defaultExtendForm()
  visible.value = false
  isEdit.value = false
  editIndex.value = -1
}

const handleSave = async (nextList: any[]) => {
  if (saving.value) return false

  saving.value = true
  try {
    const res = await deviceConfigEdit({
      ...props.configInfo,
      additional_info: JSON.stringify(nextList)
    })
    if (isFlatRequestFailure(res)) return false

    extendInfoList.value = nextList
    message.success($t('common.modifySuccess'))
    emit('upDateConfig')
    return true
  } finally {
    saving.value = false
  }
}

const handleSubmit = async () => {
  if (saving.value || validating.value) return

  validating.value = true
  try {
    await extendFormRef?.value?.validate()
  } catch {
    return
  } finally {
    validating.value = false
  }

  const nextList = extendInfoList.value.map(item => ({ ...item }))
  if (editIndex.value >= 0) {
    nextList[editIndex.value] = { ...extendForm.value }
  } else {
    nextList.push({ ...extendForm.value, enable: false })
  }
  if (await handleSave(nextList)) handleClose()
}

const handleSwitchChange = async (row, enable: boolean) => {
  const index = (extendInfoList.value || []).findIndex(item => {
    return (
      item.name === row.name &&
      item.type === row.type &&
      item.default_value === row.default_value &&
      item.desc === row.desc
    )
  })
  if (index >= 0) {
    const nextList = extendInfoList.value.map(item => ({ ...item }))
    nextList[index].enable = enable
    await handleSave(nextList)
  }
}

const handleDeleteTable = async row => {
  const index = (extendInfoList.value || []).findIndex(item => {
    return (
      item.name === row.name &&
      item.type === row.type &&
      item.default_value === row.default_value &&
      item.desc === row.desc
    )
  })
  if (index >= 0) {
    const nextList = extendInfoList.value.filter((_, itemIndex) => itemIndex !== index)
    if (await handleSave(nextList)) window.$message?.info($t('common.extensionInfoDeleted'))
  }
}
const handleEditTable = async row => {
  editIndex.value = (extendInfoList.value || []).findIndex(item => {
    return (
      item.name === row.name &&
      item.type === row.type &&
      item.default_value === row.default_value &&
      item.desc === row.desc
    )
  })

  extendForm.value = { ...row }
  isEdit.value = true
  visible.value = true
}

const columns: Ref<DataTableColumns<ServiceManagement.Service>> = ref([
  {
    key: 'name',
    title: $t('page.manage.menu.form.name'),
    minWidth: '140px',
    align: 'left'
  },
  {
    key: 'type',
    minWidth: '140px',
    title: $t('page.manage.menu.form.type'),
    align: 'left'
  },
  {
    key: 'default_value',
    title: $t('generate.default-value'),
    minWidth: '140px',
    align: 'left'
  },
  {
    key: 'desc',
    title: $t('custom.groupPage.description'),
    minWidth: '140px',
    align: 'left'
  },
  {
    key: 'enable',
    minWidth: '140px',
    title: $t('page.manage.common.status.enable'),
    align: 'left',
    render: (row: any) => {
      return (
        <NSwitch
          value={Boolean(row.enable)}
          loading={saving.value}
          onUpdateValue={(value: boolean) => handleSwitchChange(row, value)}
        />
      )
    }
  },
  {
    key: 'operate',
    minWidth: '140px',
    title: $t('common.actions'),
    align: 'left',
    render: (row: any) => {
      return (
        <NSpace>
          <NButton size={'small'} type="primary" onClick={() => handleEditTable(row)}>
            {$t('common.edit')}
          </NButton>
          <NPopconfirm onPositiveClick={() => handleDeleteTable(row)}>
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
const getPlatform = computed(() => {
  const { proxy }: any = getCurrentInstance()
  return proxy.getPlatform()
})
onMounted(() => {
  if (!props.configInfo.additional_info || props.configInfo.additional_info === '{}') {
    extendInfoList.value = []
  } else {
    try {
      const additionalInfo = JSON.parse(props.configInfo.additional_info)
      extendInfoList.value = Array.isArray(additionalInfo) ? additionalInfo : []
    } catch {
      extendInfoList.value = []
    }
  }
})
</script>

<template>
  <div class="extend-box">
    <NButton type="primary" @click="addDevice()">{{ $t('generate.add-extension-info') }}</NButton>
    <NDataTable :columns="columns" :data="extendInfoList" size="small" class="m-tb-10" />
    <!--    <div class="pagination-box">-->
    <!--      &lt;!&ndash; Data table to display device groups &ndash;&gt;-->
    <!--      &lt;!&ndash; Pagination component &ndash;&gt;-->
    <!--      <NPagination v-model:page="associatedQuery.page" :item-count="associatedTotal" @update:page="getTableData"  />-->
    <!--    </div>-->
    <NModal
      v-model:show="visible"
      :mask-closable="false"
      :title="isEdit ? $t('common.editExtendedInfo') : $t('common.addExtendedInfo')"
      :class="getPlatform ? 'w-90%' : 'w-400px'"
      preset="card"
      @after-leave="modalClose"
    >
      <NForm ref="extendFormRef" :model="extendForm" :rules="extendFormRules" label-placement="left" label-width="auto">
        <NFormItem :label="$t('page.manage.menu.form.name')" path="name">
          <NInput v-model:value="extendForm.name" :placeholder="$t('generate.enter-device-name')" />
        </NFormItem>
        <NFormItem :label="$t('generate.type')" path="type">
          <NSelect
            v-model:value="extendForm.type"
            :options="typeOptions"
            :placeholder="$t('generate.select-type')"
          ></NSelect>
        </NFormItem>
        <NFormItem :label="$t('generate.default-value')" path="default_value">
          <NInput v-model:value="extendForm.default_value" :placeholder="$t('generate.enter-default-value')" />
        </NFormItem>
        <NFormItem :label="$t('device_template.table_header.description')" path="device_ids">
          <NInput v-model:value="extendForm.desc" :placeholder="$t('generate.enter-description')" type="textarea" />
        </NFormItem>
        <NFlex justify="flex-end">
          <NButton @click="handleClose">{{ $t('generate.cancel') }}</NButton>
          <NButton type="primary" :loading="saving || validating" @click="handleSubmit">
            {{ $t('page.login.common.confirm') }}
          </NButton>
        </NFlex>
      </NForm>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
.extend-box {
  .pagination-box {
    display: flex;
    justify-content: flex-end;
  }

  .m-tb-10 {
    margin: 10px;
  }
}
</style>
