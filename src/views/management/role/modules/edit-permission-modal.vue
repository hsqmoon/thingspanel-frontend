<script setup lang="ts">
import { isFlatRequestFailure } from '@sa/axios'
import { computed, getCurrentInstance, ref } from 'vue'
import { delRolePermissions, fetchUIElementList, getRolePermissions, modifyRolePermissions } from '@/service/api'
import { $t } from '@/locales'
const { proxy }: any = getCurrentInstance()
export interface Props {
  /** 弹窗可见性 */
  visible: boolean
  /** 编辑的表格行数据 */
  editData?: any | null
}

interface Element {
  id: string
  parent_id: string
  element_code: string
  element_type: number
  description: string
  children: Element[]
}

interface TreeNode {
  label: string
  key: string
  children: TreeNode[]
}

function convertToTreeNodes(elements: Element[]): TreeNode[] {
  return elements.map(item => ({
    label: item.description,
    key: item.id,
    disabled: item.element_code === 'home', // 禁止选中首页
    children: item.children.length > 0 ? convertToTreeNodes(item.children) : []
  }))
}

defineOptions({ name: 'EditPermissionModal' })

const props = withDefaults(defineProps<Props>(), {
  editData: null
})

interface Emits {
  (e: 'update:visible', visible: boolean): void

  /** 点击协议 */
  (e: 'success'): void
}

const emit = defineEmits<Emits>()

const modalVisible = computed({
  get() {
    return props.visible
  },
  set(visible) {
    emit('update:visible', visible)
  }
})
const closeModal = () => {
  modalVisible.value = false
}

const title = computed(() => {
  return `${$t('page.manage.role.editPermission')} - ${props.editData?.name}`
})

const selectedPermissions = ref<string[]>([])
const treeOptions = ref<any>([])
const initializing = ref(false)
const permissionsReady = ref(false)
const submitting = ref(false)
let initializationEpoch = 0

const initRolePermissions = async (epoch: number) => {
  // 首页默认选中
  const home = treeOptions.value.find(item => item.label === '首页')
  if (!home || !props.editData) return false

  const response = await getRolePermissions(props.editData.id)
  if (epoch !== initializationEpoch || isFlatRequestFailure(response)) return false

  selectedPermissions.value = [...new Set([home.key, ...(response.data || [])])]
  return true
}

const initUIElementList = async () => {
  const epoch = ++initializationEpoch
  initializing.value = true
  permissionsReady.value = false
  treeOptions.value = []
  selectedPermissions.value = []

  try {
    const response = await fetchUIElementList()
    if (epoch !== initializationEpoch || isFlatRequestFailure(response)) return

    treeOptions.value = convertToTreeNodes(response.data.list || [])
    permissionsReady.value = await initRolePermissions(epoch)
  } finally {
    if (epoch === initializationEpoch) {
      initializing.value = false
    }
  }
}

async function handleSubmit() {
  if (!permissionsReady.value || !props.editData || submitting.value) return

  const tree = proxy?.$refs?.treeRef
  if (!tree) return

  const epoch = initializationEpoch
  submitting.value = true
  try {
    const indeterminateData = tree.getIndeterminateData().keys
    const currentPermissions = [...selectedPermissions.value, ...indeterminateData]
    const response =
      currentPermissions.length === 0
        ? await delRolePermissions(props.editData.id)
        : await modifyRolePermissions(props.editData.id, currentPermissions)
    if (epoch !== initializationEpoch || isFlatRequestFailure(response)) return

    selectedPermissions.value = []
    closeModal()
    emit('success')
  } finally {
    if (epoch === initializationEpoch) {
      submitting.value = false
    }
  }
}
</script>

<template>
  <n-modal
    v-model:show="modalVisible"
    preset="card"
    :title="title"
    :on-after-enter="
      () => {
        initUIElementList()
      }
    "
  >
    <n-form label-placement="left" :label-width="80">
      <div class="h-300px overflow-y-auto">
        <n-tree
          ref="treeRef"
          v-model:checked-keys="selectedPermissions"
          :data="treeOptions"
          :cascade="false"
          checkable
          block-line
        />
      </div>
      <n-space class="w-full pt-16px" :size="24" justify="end">
        <n-button class="w-72px" @click="closeModal">{{ $t('generate.cancel') }}</n-button>
        <n-button
          class="w-72px"
          type="primary"
          :disabled="!permissionsReady"
          :loading="initializing || submitting"
          @click="handleSubmit"
        >
          {{ $t('page.login.common.confirm') }}
        </n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<style scoped></style>
