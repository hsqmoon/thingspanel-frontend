<script lang="ts" setup>
import { reactive, ref } from 'vue'
import type { FormInst } from 'naive-ui'
import { isFlatRequestFailure } from '@sa/axios'
import { useLoading } from '@sa/hooks'
import { createRequiredFormRule } from '@/utils/form/rule'
import { deepClone } from '@/utils/common/tool'
import { editPushNotificationServices, fetchPushNotificationServices } from '@/service/api'
import { $t } from '~/src/locales'

const { loading, startLoading, endLoading } = useLoading(false)

const formModel = reactive<NotificationServices.PushNotification>(createDefaultFormModel())

function setTableData(data: Api.NotificationServices.PushNotification) {
  Object.assign(formModel, data)
  if (data.url !== 'null') {
    formModel.url = data.url
  }
}

async function getNotificationServices() {
  startLoading()
  try {
    const response = await fetchPushNotificationServices()
    if (isFlatRequestFailure(response) || !response.data) return

    setTableData(response.data)
  } finally {
    endLoading()
  }
}

function createDefaultFormModel(): NotificationServices.PushNotification {
  return {
    url: ''
  }
}

const rules = {
  url: createRequiredFormRule($t('common.pleaseCheckValue'))
}
const formRef = ref<HTMLElement & FormInst>()
async function handleSubmit() {
  if (loading.value) return
  if (!formModel.url.trim()) {
    window.$message?.warning($t('common.pleaseCheckValue'))
    return
  }
  try {
    await formRef.value?.validate()
  } catch (error) {
    if (error === undefined || Array.isArray(error)) return
    throw error
  }

  startLoading()
  try {
    const formData = deepClone(formModel)
    delete formData.config
    const response = await editPushNotificationServices(formData)
    if (isFlatRequestFailure(response)) return

    window.$message?.success($t('common.saveSuccess'))
  } finally {
    endLoading()
  }

  await getNotificationServices()
}

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
          :span="14"
          :label="$t('page.manage.notification.pushNotification.pushServer')"
          path="url"
        >
          <NInput v-model:value="formModel.url" />
        </NFormItemGridItem>
      </NGrid>
      <NGrid :cols="24">
        <NFormItemGridItem :span="24" class="mt-20px">
          <div class="w-120px"></div>
          <NButton class="ml-20px w-72px" type="primary" @click="handleSubmit">
            {{ $t('common.save') }}
          </NButton>
        </NFormItemGridItem>
      </NGrid>
    </NForm>
  </NSpin>
</template>

<style lang="scss"></style>
