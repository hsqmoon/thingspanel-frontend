<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import type { FormInst } from 'naive-ui'
import { isFlatRequestFailure } from '@sa/axios'
import { useBoolean, useLoading } from '@sa/hooks'
import { editNotificationServices, fetchNotificationServicesEmail, sendTestEmail } from '@/service/api'
import { deepClone } from '@/utils/common/tool'
import { createRequiredFormRule } from '@/utils/form/rule'
import { $t } from '~/src/locales'

const { loading, startLoading, endLoading } = useLoading(false)
const { loading: sending, startLoading: startSending, endLoading: endSending } = useLoading(false)
const { bool: visible, setTrue: openModal, setFalse: closeModal } = useBoolean()
let configRequestEpoch = 0
let debugSession = 0

const formModel = reactive<NotificationServices.Email>(createDefaultFormModel())

function setTableData(data: Api.NotificationServices.Email) {
  let emailConfig = {}
  if (data.config && data.config !== 'null') {
    try {
      const parsedConfig: unknown = JSON.parse(data.config)
      if (typeof parsedConfig !== 'object' || parsedConfig === null || Array.isArray(parsedConfig)) {
        window.$message?.error($t('json.validation.invalid'))
        return
      }
      emailConfig = parsedConfig
    } catch {
      window.$message?.error($t('json.validation.invalid'))
      return
    }
  }
  Object.assign(formModel, data, { email_config: emailConfig })
}

async function getNotificationServices() {
  const epoch = ++configRequestEpoch
  startLoading()
  try {
    const response = await fetchNotificationServicesEmail()
    if (epoch !== configRequestEpoch || isFlatRequestFailure(response) || !response.data) return

    setTableData(response.data)
  } finally {
    if (epoch === configRequestEpoch) {
      endLoading()
    }
  }
}

function createDefaultFormModel(): NotificationServices.Email {
  return {
    id: '',
    email_config: {},
    config: '',
    notice_type: 'EMAIL',
    status: 'OPEN',
    remark: ''
  }
}

const rules = {
  'email_config.host': createRequiredFormRule($t('common.pleaseCheckValue')),
  'email_config.port': createRequiredFormRule($t('common.pleaseCheckValue')),
  'email_config.from_email': createRequiredFormRule($t('common.pleaseCheckValue')),
  'email_config.from_password': createRequiredFormRule($t('common.pleaseCheckValue')),
  email: createRequiredFormRule($t('common.pleaseCheckValue')),
  body: createRequiredFormRule($t('common.pleaseCheckValue'))
}
const formRef = ref<HTMLElement & FormInst>()
async function handleSubmit() {
  if (loading.value) return
  const epoch = ++configRequestEpoch
  startLoading()
  try {
    try {
      await formRef.value?.validate()
    } catch (error) {
      if (error === undefined || Array.isArray(error)) return
      throw error
    }
    if (epoch !== configRequestEpoch) return

    const formData = deepClone(formModel)
    delete formData.config
    const response = await editNotificationServices(formData)
    if (epoch !== configRequestEpoch || isFlatRequestFailure(response)) return

    window.$message?.success($t('common.modifySuccess'))
    const configResponse = await fetchNotificationServicesEmail()
    if (epoch !== configRequestEpoch || isFlatRequestFailure(configResponse) || !configResponse.data) return

    setTableData(configResponse.data)
  } finally {
    if (epoch === configRequestEpoch) {
      endLoading()
    }
  }
}

type FormModel = {
  body: string
  email: string
  header: string
}

const debugData = reactive<FormModel>({
  body: '',
  email: '',
  header: ''
})

function handleOpenModal() {
  Object.assign(debugData, {
    body: '',
    email: '',
    header: ''
  })
  openModal()
}

const message = useMessage()
const debugFormRef = ref<HTMLElement & FormInst>()
async function handleSend() {
  if (sending.value) return
  const session = debugSession
  startSending()
  try {
    try {
      await debugFormRef.value?.validate()
    } catch (error) {
      if (error === undefined || Array.isArray(error)) return
      throw error
    }
    if (session !== debugSession) return

    const messageReactive = message.loading($t('common.sending'), {
      duration: 100000
    })
    try {
      const response = await sendTestEmail(debugData)
      if (session !== debugSession || isFlatRequestFailure(response)) return

      window.$message?.success($t('generate.sendingSuccess'))
      closeModal()
    } finally {
      messageReactive.destroy()
    }
  } finally {
    if (session === debugSession) {
      endSending()
    }
  }
}

watch(visible, () => {
  debugSession += 1
  endSending()
})

function init() {
  getNotificationServices()
}

init()
</script>

<template>
  <NSpin :show="loading">
    <NForm ref="formRef" label-placement="left" :label-width="130" :model="formModel" :rules="rules">
      <NGrid :cols="24">
        <NFormItemGridItem
          :span="6"
          :label="$t('page.manage.notification.email.form.sendMailServer')"
          path="email_config.host"
        >
          <NInput v-model:value="formModel.email_config.host" />
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem
          :span="6"
          :label="$t('page.manage.notification.email.form.sendPort')"
          path="email_config.port"
        >
          <NInputNumber v-model:value="formModel.email_config.port" />
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem
          :span="6"
          :label="$t('page.manage.notification.email.form.senderMail')"
          path="email_config.from_email"
        >
          <NInput v-model:value="formModel.email_config.from_email" />
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem
          :span="6"
          :label="$t('page.manage.notification.email.form.authorizationCodeOrPassword')"
          path="email_config.from_password"
        >
          <NInput v-model:value="formModel.email_config.from_password" type="password" show-password-on="click" />
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem :span="6" :label="$t('page.manage.notification.email.form.ssl')" path="email_config.ssl">
          <n-checkbox v-model:checked="formModel.email_config.ssl"></n-checkbox>
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem :span="6" :label="$t('page.manage.notification.enableDisableService')" path="status">
          <n-switch v-model:value="formModel.status" checked-value="OPEN" unchecked-value="CLOSE" />
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem :span="24" class="mt-20px">
          <div class="w-120px"></div>
          <NButton class="w-72px" @click="handleOpenModal">
            {{ $t('common.debug') }}
          </NButton>
          <NButton class="ml-20px w-72px" type="primary" @click="handleSubmit">
            {{ $t('common.save') }}
          </NButton>
        </NFormItemGridItem>
      </NGrid>
      <NSpace class="w-full pt-16px" :size="24" justify="start"></NSpace>
    </NForm>
  </NSpin>

  <NModal v-model:show="visible" preset="card" :title="$t('common.debug')" class="w-500px">
    <NForm ref="debugFormRef" label-placement="left" :label-width="120" :model="debugData" :rules="rules">
      <NGrid :cols="24" :x-gap="18">
        <NFormItemGridItem :span="24" :label="$t('page.manage.notification.email.form.inbox')" path="email">
          <NInput v-model:value="debugData.email" placeholder="" />
        </NFormItemGridItem>
        <NFormItemGridItem :span="24" :label="$t('page.manage.notification.email.form.message')" path="body">
          <NInput v-model:value="debugData.body" placeholder="" />
        </NFormItemGridItem>
      </NGrid>
      <NSpace class="w-full pt-16px" :size="24" justify="center">
        <NButton class="w-72px" type="primary" :loading="sending" @click="handleSend">
          {{ $t('common.send') }}
        </NButton>
      </NSpace>
    </NForm>
  </NModal>
</template>

<style lang="scss"></style>
