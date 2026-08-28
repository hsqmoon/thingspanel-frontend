<script setup lang="ts">
import { ref } from 'vue'
import { isFlatRequestFailure } from '@sa/axios'
import { createServiceDrop, getServiceAccessForm, putServiceDrop } from '@/service/api/plugin'
import { $t } from '@/locales'
import FormInput from './form.vue'

// const message = useMessage();
const isEdit = ref<any>(false)
const emit = defineEmits(['getList', 'isEdit'])
const serviceModals = ref<any>(false)
const formRef = ref<any>(null)
const dynamicFormRef = ref<InstanceType<typeof FormInput> | null>(null)
const currentStep = ref(1)
const submitting = ref(false)
let openSession = 0

const service_plugin_id = ref<any>('')
const formElements = ref<any>([])
const defaultForm = {
  name: '',
  service_plugin_id: '',
  voucher: {},
  vouchers: {},
  auth_type: 'manual' // 添加模式字段，默认为手动
}
const form = ref<any>({ ...defaultForm })
const rules = ref<any>({
  name: {
    required: true,
    trigger: ['blur', 'input'],
    message: '请输入接入点名称'
  },
  auth_type: {
    required: true,
    trigger: ['change'],
    message: '请选择模式'
  }
})
const openModal: (id: any, row?: any) => void = async (id, row) => {
  if (submitting.value) return

  const session = ++openSession
  let voucherData: Record<string, unknown> = {}
  if (row) {
    try {
      voucherData = typeof row.voucher === 'string' ? JSON.parse(row.voucher) : row.voucher || {}
    } catch {
      window.$message?.error('接入点凭据格式无效，无法编辑')
      return
    }
  }

  const draft = {
    ...defaultForm,
    ...(row || {}),
    service_plugin_id: id,
    vouchers: { ...voucherData },
    auth_type: typeof voucherData.auth_type === 'string' ? voucherData.auth_type : row?.auth_type || 'manual'
  }
  const data = await getServiceAccessForm({
    service_plugin_id: id
  })
  if (session !== openSession || isFlatRequestFailure(data) || !data.data) return

  isEdit.value = Boolean(row)
  service_plugin_id.value = id
  form.value = draft
  formElements.value = data.data
  serviceModals.value = true
}
const close = (force = false) => {
  if (submitting.value && !force) return

  openSession += 1
  serviceModals.value = false
  form.value = { ...defaultForm, vouchers: {} }
  formElements.value = []
  currentStep.value = 1
  // 重置编辑状态
  isEdit.value = false
}

const submitSevice: () => void = async () => {
  if (submitting.value) return
  try {
    await formRef.value?.validate()
    await dynamicFormRef.value?.validate()
  } catch {
    return
  }

  const wasEdit = isEdit.value
  const vouchers = { ...form.value.vouchers, auth_type: form.value.auth_type }
  const payload = {
    ...form.value,
    voucher: JSON.stringify(vouchers),
    vouchers,
    ...(wasEdit ? { idempotency_key: crypto.randomUUID() } : {})
  }
  submitting.value = true
  try {
    const data: any = wasEdit ? await putServiceDrop(payload) : await createServiceDrop(payload)
    if (isFlatRequestFailure(data)) return

    const accessPointId = wasEdit ? payload.id : data.data?.id
    if (!accessPointId) {
      window.$message?.error($t('common.operationFailed'))
      return
    }

    const accessPoint = { ...payload, id: accessPointId }
    serviceModals.value = false
    emit('isEdit', payload.voucher, accessPoint, wasEdit)
  } finally {
    submitting.value = false
  }
}

function handleVisibilityChange(show: boolean) {
  if (show) serviceModals.value = true
  else close()
}

defineExpose({ openModal })
</script>

<template>
  <n-modal
    :show="serviceModals"
    preset="dialog"
    :title="$t('card.addNewAccessPoint')"
    class="w"
    :closable="!submitting"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    @update:show="handleVisibilityChange"
    @after-leave="close"
  >
    <n-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-placement="left"
      label-width="auto"
      require-mark-placement="right-hanging"
    >
      <n-form-item :label="$t('card.accessPointName')" path="name">
        <n-input v-model:value="form.name" placeholder="请输入接入点名称" />
      </n-form-item>
      <n-form-item :label="$t('common.selectionMode')" path="auth_type">
        <n-radio-group v-model:value="form.auth_type">
          <n-radio value="manual">{{ $t('common.manual') }}</n-radio>
          <n-radio value="auto">{{ $t('common.automatic') }}</n-radio>
        </n-radio-group>
      </n-form-item>
    </n-form>
    <div class="box">
      <FormInput ref="dynamicFormRef" v-model:protocol-config="form.vouchers" :form-elements="formElements"></FormInput>
    </div>
    <div class="footer">
      <NButton type="primary" class="btn" :loading="submitting" @click="submitSevice">
        {{ $t('card.saveNext') }}
      </NButton>
      <NButton :disabled="submitting" @click="() => close()">{{ $t('common.cancel') }}</NButton>
    </div>
  </n-modal>
</template>

<style lang="scss" scoped>
.selectType {
  width: 100%;
}
.footer {
  display: flex;
  flex-direction: row-reverse;
  .btn {
    margin-left: 10px;
  }
}
.box {
  width: 100%;
  height: 100%;
}
</style>

<style lang="scss">
.w {
  width: 70% !important;
  margin-top: 15vh;
  height: max-content !important;
  max-height: 800px !important;
  overflow: auto;
}
</style>
