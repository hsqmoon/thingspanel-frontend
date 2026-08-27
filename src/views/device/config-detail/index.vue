<script lang="ts" setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NButton } from 'naive-ui'
import { deviceConfigInfo, deviceTemplateDetail } from '@/service/api/device'
import { useRouterPush } from '@/hooks/common/router'
import { $t } from '@/locales'
import AssociatedDevices from './modules/associated-devices.vue'

const tabComponentLoaders = [
  () => import('./modules/attribute-info.vue'),
  () => import('./modules/connection-info.vue'),
  () => import('./modules/data-handle.vue'),
  () => import('./modules/automate.vue'),
  () => import('./modules/alarm-info.vue'),
  () => import('./modules/extend-info.vue'),
  () => import('./modules/setting-info.vue')
] as const

const AttributeInfo = defineAsyncComponent(tabComponentLoaders[0])
const ConnectionInfo = defineAsyncComponent(tabComponentLoaders[1])
const DataHandle = defineAsyncComponent(tabComponentLoaders[2])
const Automate = defineAsyncComponent(tabComponentLoaders[3])
const AlarmInfo = defineAsyncComponent(tabComponentLoaders[4])
const ExtendInfo = defineAsyncComponent(tabComponentLoaders[5])
const SettingInfo = defineAsyncComponent(tabComponentLoaders[6])

const preloadTabComponents = () => void Promise.allSettled(tabComponentLoaders.map(load => load()))
onMounted(() => setTimeout(preloadTabComponents, 1000))

const { routerPushByKey } = useRouterPush()
const route = useRoute()
const configId = ref<string>(typeof route.query.id === 'string' ? route.query.id : '')

const configForm = ref({
  id: typeof route.query.id === 'string' ? route.query.id : '',
  additional_info: null,
  description: null,
  device_conn_type: null,
  device_template_id: null,
  device_template_name: '',
  device_type: '',
  name: '',
  protocol_config: null,
  protocol_type: null,
  remark: null,
  voucher_type: null
})
const editConfig = () => {
  routerPushByKey('device_config-edit', { query: { id: configId.value } })
}
const getTemplateDetail = async (templateId: string) => {
  const res = await deviceTemplateDetail({ id: templateId })
  if (res.data) {
    configForm.value.device_template_name = res.data.name
  }
}
const getConfig = async () => {
  const res = await deviceConfigInfo({ id: configId.value })
  configForm.value = res.data
  if (configForm.value.device_template_id) {
    configForm.value.device_template_name = ''
    getTemplateDetail(String(configForm.value.device_template_id))
  }
}
const tabKeys = {
  associatedDevices: 'associatedDevices',
  thingModel: 'thingModel',
  protocolConfig: 'protocolConfig',
  dataProces: 'dataProces',
  automate: 'automate',
  alarm: 'alarm',
  extensionInfo: 'extensionInfo',
  devicesSetting: 'devicesSetting'
}

const activeName = ref(tabKeys.associatedDevices)
if (configId.value) {
  getConfig()
  activeName.value = tabKeys.associatedDevices
}
const clickConfig: () => void = () => {
  routerPushByKey('device_template', {
    query: {
      id: String(configForm.value.device_template_id || '')
    }
  })
}
</script>

<template>
  <div class="h-full overflow-auto">
    <NCard :title="configForm?.name || '--'">
      <template #header-extra>
        <NButton type="primary" @click="editConfig">{{ $t('common.edit') }}</NButton>
      </template>
      <div class="mb-4 flex">
        {{ $t('generate.deviceAccessType') }}
        <template v-if="configForm.device_type === '1'">{{ $t('generate.direct-connected-device') }}</template>
        <template v-if="configForm.device_type === '2'">{{ $t('generate.gateway') }}</template>
        <template v-if="configForm.device_type === '3'">{{ $t('generate.gateway-sub-device') }}</template>
        <div class="ml-20">
          {{ $t('route.device_template') }}：
          <span style="color: blue; cursor: pointer" @click="clickConfig">
            {{
              configForm.device_template_name || configForm.device_template_name === ''
                ? configForm.device_template_name
                : $t('generate.unbound')
            }}
          </span>
        </div>
      </div>

      <n-tabs v-model:value="activeName" type="line">
        <n-tab-pane
          display-directive="show:lazy"
          :name="tabKeys.associatedDevices"
          :tab="$t('common.associatedDevices')"
        >
          <AssociatedDevices :device-config-id="configId" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.thingModel" :tab="$t('common.thingModel')">
          <AttributeInfo :config-info="configForm" @up-date-config="getConfig" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.protocolConfig" :tab="$t('common.protocolConfig')">
          <ConnectionInfo :config-info="configForm" @up-date-config="getConfig" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.dataProces" :tab="$t('common.dataProces')">
          <DataHandle :config-info="configForm" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.automate" :tab="$t('custom.device_details.automate')">
          <Automate :config_id="configId" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.alarm" :tab="$t('route.alarm')">
          <AlarmInfo :config_id="configId" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.extensionInfo" :tab="$t('generate.extension-info')">
          <ExtendInfo :config-info="configForm" @up-date-config="getConfig" />
        </n-tab-pane>
        <n-tab-pane display-directive="show:lazy" :name="tabKeys.devicesSetting" :tab="$t('common.devicesSetting')">
          <SettingInfo :config-info="configForm" @change="getConfig" />
        </n-tab-pane>
      </n-tabs>
    </NCard>
  </div>
</template>

<style lang="scss" scoped>
:deep(.n-card-header__main) {
  width: auto;
  flex: none !important;
}

:deep(.n-card-header__extra) {
  flex: 1;
  margin-left: 20px;
}

:deep(.n-tabs) {
  height: calc(100% - 80px);
}
.flex {
  display: flex;
}
.ml-20 {
  margin-left: 20px;
}
</style>
