<script setup lang="tsx">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { isFlatRequestFailure } from '@sa/axios'
import type { TransferRenderSourceList } from 'naive-ui'
import { NTree } from 'naive-ui'
import {
  deleteDeviceGroupRelation,
  deleteDevice,
  deviceDetail,
  deviceGroupRelation,
  deviceGroupTree,
  deviceUpdateConfig,
  getDeviceConfigList,
  getDeviceGroupRelation
} from '@/service/api'
import { useDeviceDataStore } from '@/store/modules/device'
import { useTabStore } from '@/store/modules/tab'
import { getTabIdByRoute } from '@/store/modules/tab/shared'
import { $t } from '@/locales'

const props = defineProps<{
  id: string
  online: string
}>()
const valueRef = ref<Array<string | number>>([])
const device_coding = ref<string>('')
const emit = defineEmits(['change'])
const treeData = ref()
type Option = {
  label: string
  value: string
  children?: Option[]
}
const options = ref<Option[]>()
const sOptions = ref<any[]>([{ label: $t('generate.unbind'), value: '' }])
const groupSaving = ref(false)
const configSaving = ref(false)
let configListRequestEpoch = 0
const route = useRoute()
const { query } = route
const { removeTab } = useTabStore()
const currentTabId = getTabIdByRoute(route)
const deviceConfigList = async name => {
  const requestEpoch = ++configListRequestEpoch
  const response = await getDeviceConfigList({
    page: 1,
    page_size: 99,
    name
  })
  if (isFlatRequestFailure(response) || requestEpoch !== configListRequestEpoch) return

  const list = Array.isArray(response.data?.list) ? response.data.list : []
  sOptions.value = [
    { label: $t('generate.unbind'), value: '' },
    ...list.map(item => ({ label: item.name, value: item.id }))
  ]
}

function transformDataToOptions(data) {
  // 定义转换函数
  const transform = item => {
    // 基本转换
    const option = {
      label: item.group.name,
      value: item.group.id,
      children: undefined
    }

    // 如果存在子项，则递归转换
    if (item.children && item.children.length > 0) {
      option.children = item.children.map(transform)
    }

    return option
  }

  // 对输入的数据应用转换函数
  return data.map(transform)
}

const getTreeData = async () => {
  const response = await deviceGroupTree({})
  if (isFlatRequestFailure(response) || !Array.isArray(response.data)) return

  treeData.value = transformDataToOptions(response.data)
  options.value = flattenTree(treeData.value)
}
const getTreeRelationData = async () => {
  const response = await getDeviceGroupRelation({ device_id: props.id })
  if (isFlatRequestFailure(response) || !Array.isArray(response.data)) return

  valueRef.value = response.data.map(item => item.group_id)
}
const deviceDataStore = useDeviceDataStore()
const selectedValues = ref('')

function flattenTree(list: undefined | Option[]): Option[] {
  const result: Option[] = []

  function flatten(_list: Option[] = []) {
    _list.forEach(item => {
      result.push(item)
      flatten(item.children)
    })
  }

  flatten(list)
  return result
}

const renderSourceList: TransferRenderSourceList = ({ pattern }) => {
  return (
    <NTree
      data={treeData.value}
      style="margin: 0 4px;"
      checkedKeys={valueRef.value}
      keyField="value"
      defaultExpandAll
      checkable
      checkOnClick
      blockLine
      selectable={false}
      disabled={groupSaving.value}
      onUpdateCheckedKeys={async (keys, _option, meta) => {
        if (!meta.node || groupSaving.value) return

        groupSaving.value = true
        try {
          const response =
            meta.action === 'check'
              ? await deviceGroupRelation({ group_id: meta.node.value, device_id_list: [props.id] })
              : await deleteDeviceGroupRelation({ group_id: meta.node.value, device_id: props.id })
          if (isFlatRequestFailure(response)) return

          valueRef.value = keys
        } finally {
          groupSaving.value = false
        }
      }}
      pattern={pattern}
    />
  )
}
const initData = async () => {
  const result = await deviceDetail(query.d_id as string)
  if (isFlatRequestFailure(result)) return

  device_coding.value = result.data?.device_number || ''
  selectedValues.value = result.data?.device_config_id || ''
  await Promise.all([getTreeData(), getTreeRelationData()])
}

onMounted(() => {
  //  is_online.value = String(props.online)
  initData()
  deviceConfigList('')
})

const selectConfig = async v => {
  if (configSaving.value) return

  configSaving.value = true
  try {
    const response = await deviceUpdateConfig({ device_id: props.id, device_config_id: v })
    if (isFlatRequestFailure(response)) return

    selectedValues.value = v
    await deviceDataStore.fetchData(props.id)
    await initData()
    emit('change')
  } finally {
    configSaving.value = false
  }
}

const handleDeleteDevice = () => {
  // 二次确认删除
  window.$dialog?.warning({
    title: $t('common.delete'),
    content: $t('common.confirmDelete'),
    positiveText: $t('common.confirm'),
    negativeText: $t('common.cancel'),
    onPositiveClick: () => {
      deleteD(props.id)
    }
  })
}

const deleteD = async (id: string) => {
  const response = await deleteDevice({ id })
  if (isFlatRequestFailure(response)) return

  window.$message?.success($t('common.deleteSuccess'))
  removeTab(currentTabId)
}
</script>

<template>
  <div class="flex-col gap-16px p-t-10px">
    <div class="flex items-center">
      <div>{{ $t('card.configTemplate') }}：</div>
      <NSelect
        :value="selectedValues"
        :loading="configSaving"
        :disabled="configSaving"
        filterable
        class="w-200px"
        :options="sOptions"
        @update:value="selectConfig"
        @search="deviceConfigList"
      />
    </div>
    <div class="flex items-center gap-13px">
      <span>{{ $t('generate.deviceCode') }}</span>
      <span>{{ device_coding }}</span>
    </div>

    <div class="flex items-center">
      {{ $t('generate.device-firmware') }}
      <span class="ml-4">{{ deviceDataStore?.deviceData?.current_version || '--' }}</span>
    </div>

    <div class="flex items-center">
      <n-button type="error" size="small" @click="handleDeleteDevice">
        {{ $t('common.delete') }}
      </n-button>
    </div>

    <div class="flex-1">
      <div class="mb-4">{{ $t('generate.device-group') }}</div>
      <n-transfer
        v-model:value="valueRef"
        :options="options"
        :render-source-list="renderSourceList"
        source-filterable
      />
    </div>
  </div>
</template>

<style scoped></style>
