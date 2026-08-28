<script setup lang="ts">
// import { defineComponent } from 'vue'
// import { TreeSelectOption } from 'naive-ui'
import { computed, reactive, ref, watch } from 'vue'
import type { FormInst, FormItemRule } from 'naive-ui'
// import { genderOptions } from '@/constants'
import { isFlatRequestFailure } from '@sa/axios'
import { createRequiredFormRule } from '@/utils/form/rule'
import { addrles, editrles } from '@/service/api'
import { $t } from '@/locales'

// dom树形结构数据

export interface Props {
  /** 弹窗可见性 */
  visible: boolean
  /** 弹窗类型 add: 新增 edit: 编辑 */
  type?: 'add' | 'edit'
  /** 编辑的表格行数据 */
  editData?: UserManagement.User | null
}

export type ModalType = NonNullable<Props['type']>

defineOptions({ name: 'TableActionModal' })

const props = withDefaults(defineProps<Props>(), {
  type: 'add',
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
  const titles: Record<ModalType, string> = {
    add: $t('page.manage.role.title'),
    edit: $t('page.manage.role.editRole')
  }
  return titles[props.type]
})

const formRef = ref<HTMLElement & FormInst>()
const submitting = ref(false)
let modalSession = 0

type FormModel = Pick<UserManagement.User, 'name' | 'description' | 'email'>

const formModel = reactive<FormModel>(createDefaultFormModel())

const rules: Record<keyof FormModel, FormItemRule | FormItemRule[]> = {
  name: createRequiredFormRule('请输入用户名'),
  description: createRequiredFormRule('请输入角色备注'),
  email: {}
}

function createDefaultFormModel(): FormModel {
  return {
    name: '',
    email: '',
    description: ''
  }
}

function handleUpdateFormModel(model: Partial<FormModel>) {
  Object.assign(formModel, model)
}

function handleUpdateFormModelByModalType() {
  const handlers: Record<ModalType, () => void> = {
    add: () => {
      const defaultFormModel = createDefaultFormModel()
      handleUpdateFormModel(defaultFormModel)
    },
    edit: () => {
      if (props.editData) {
        handleUpdateFormModel(props.editData)
      }
    }
  }

  handlers[props.type]()
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

    const response = props.type === 'add' ? await addrles(formModel) : await editrles(formModel)
    if (session !== modalSession || isFlatRequestFailure(response)) return

    emit('success')
    closeModal()
  } finally {
    if (session === modalSession) {
      submitting.value = false
    }
  }
}

watch(
  () => props.visible,
  newValue => {
    modalSession += 1
    submitting.value = false
    if (newValue) {
      handleUpdateFormModelByModalType()
    }
  }
)
</script>

<template>
  <n-modal v-model:show="modalVisible" preset="card" :title="title">
    <n-form ref="formRef" label-placement="left" :label-width="80" :model="formModel" :rules="rules">
      <n-form-item :label="$t('page.manage.role.roleName')" path="name">
        <n-input v-model:value="formModel.name" />
      </n-form-item>
      <n-form-item :label="$t('generate.role-description')">
        <n-input v-model:value="formModel.description" type="textarea" />
      </n-form-item>
      <n-space class="w-full pt-16px" :size="24" justify="end">
        <n-button class="w-72px" @click="closeModal">{{ $t('generate.cancel') }}</n-button>
        <n-button class="w-72px" type="primary" :loading="submitting" @click="handleSubmit">
          {{ $t('page.login.common.confirm') }}
        </n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<style scoped></style>
