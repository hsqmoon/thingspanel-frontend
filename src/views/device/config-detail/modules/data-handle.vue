<script setup lang="ts">
import { computed, defineAsyncComponent, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { isFlatRequestFailure, type FlatRequestError } from '@sa/axios'
import { type FormInst, NButton, useDialog, useMessage } from 'naive-ui'
import { PencilOutline as editIcon, TrashOutline as trashIcon } from '@vicons/ionicons5'
import { onBeforeRouteLeave } from 'vue-router'
import ItemCard from '@/components/dev-card-item/index.vue'
import {
  dataScriptAdd,
  dataScriptDel,
  dataScriptEdit,
  dataScriptQuiz,
  getDataScriptList,
  setDeviceScriptEnable
} from '@/service/api/device'
import { $t } from '@/locales'
import { useI18n } from 'vue-i18n'
// import { createLogger } from '@/utils/logger'
// const logger = createLogger('DataHandle')

// 获取国际化函数
const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const LuaEditor = defineAsyncComponent(() => import('./components/lua-editor.vue'))

function showQuizRequestFailure(errorInfo: FlatRequestError) {
  const errorMessage = errorInfo.message || t('page.dataForward.requestFailed')
  const errorType = errorInfo.status ? `HTTP ${errorInfo.status}` : errorInfo.code || 'Unknown'
  configForm.value.resolt_analog_input = `${t('page.dataForward.debugFailed')}\n${t('page.dataForward.errorType')}: ${errorType}\n${t('page.dataForward.errorCode')}: ${errorInfo.code || 'N/A'}\n${t('page.dataForward.errorMessage')}: ${errorMessage}`
}

interface Props {
  configInfo?: object | any
}

const props = withDefaults(defineProps<Props>(), {
  configInfo: null
})
const configFormRef = ref<HTMLElement & FormInst>()

const modalTitle = ref($t('generate.add'))
const configForm: any = ref({})
const scripTypeOpt = ref([
  {
    label: $t('generate.all'),
    value: ''
  },
  {
    label: $t('custom.devicePage.reportPreprocessing'),
    value: 'A'
  },
  {
    label: $t('custom.devicePage.transmissionPreprocessing'),
    value: 'B'
  },
  {
    label: $t('custom.devicePage.attributeReporting'),
    value: 'C'
  },
  {
    label: $t('custom.devicePage.attributeDistribution'),
    value: 'D'
  },
  {
    label: $t('custom.devicePage.commandDeliveryPreprocessing'),
    value: 'E'
  },
  {
    label: $t('custom.devicePage.eventReportPreprocessing'),
    value: 'F'
  }
])

function defaultConfigForm() {
  return {
    id: null,
    content: `function encodeInp(msg,topic) 
 -- 说明：该函数为编码函数，将输入的消息编码为平台可识别的消息格式或者设备可识别的消息格式，请根据实际需求编写编码逻辑 
 -- 入参：输入的msg，可以是任意数据类型的字符串。 
 -- 出参：返回值为编码后的消息,需要是json字符串形式 
 -- 注意：string与jsonObj互转需导入json库：local json = require("json") 
 -- 例，string转jsonObj：local jsonData = json.decode(msgString) 
 -- 例，jsonObj转string：local jsonStr = json.encode(jsonTable) 
 local json = require("json") 
 local jsonData = json.decode(msg) 
 -- 例 if jsonData.temp then 
 -- 例 jsonData.temp = jsonData.temp * 10 
 -- 例 end 
 local newJsonString = json.encode(jsonData) 
 return newJsonString 
 end`,
    description: null,
    device_config_id: null,
    enable_flag: 'Y',
    analog_input: null,
    last_analog_input: null,
    name: null,
    remark: null,
    script_type: null,
    resolt_analog_input: ''
  }
}

// Monaco Editor 配置
const editorOptions = ref({
  automaticLayout: true,
  theme: 'vs',
  language: 'lua',
  fontSize: 14,
  lineHeight: 20,
  fontFamily: 'Consolas, "Courier New", monospace',
  wordWrap: 'on',
  lineNumbers: 'on',
  glyphMargin: true,
  folding: true,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
  minimap: {
    enabled: true,
    side: 'right',
    size: 'proportional',
    showSlider: 'mouseover'
  },
  scrollBeyondLastLine: false,
  readOnly: false,
  cursorStyle: 'line',
  cursorBlinking: 'blink',
  renderWhitespace: 'selection',
  renderControlCharacters: false,
  fontLigatures: true,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'on',
  wordBasedSuggestions: 'currentDocument',
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false
  },
  bracketPairColorization: {
    enabled: true
  },
  guides: {
    bracketPairs: true,
    indentation: true
  }
})

// 编辑器工具栏功能
const toggleMinimap = () => {
  editorOptions.value.minimap.enabled = !editorOptions.value.minimap.enabled
}

const toggleWordWrap = () => {
  editorOptions.value.wordWrap = editorOptions.value.wordWrap === 'on' ? 'off' : 'on'
}

const changeFontSize = (delta: number) => {
  const newSize = editorOptions.value.fontSize + delta
  if (newSize >= 10 && newSize <= 24) {
    editorOptions.value.fontSize = newSize
  }
}

const configFormRules = ref({
  name: {
    required: true,
    message: $t('generate.enter-title'),
    trigger: 'blur'
  },
  content: {
    required: true,
    message: $t('generate.parse-script'),
    trigger: 'blur'
  },
  enable_flag: {
    required: true,
    message: $t('common.select'),
    trigger: 'change'
  },
  script_type: {
    required: true,
    message: $t('generate.select-processing-type'),
    trigger: 'change'
  }
})
const showModal = ref(false)
const submitting = ref(false)
const quizLoading = ref(false)
const scriptMutationIds = ref(new Set<string>())
const listReady = ref(false)
const activeEditorOptions = computed(() => ({ ...editorOptions.value, readOnly: submitting.value }))
let listRequestEpoch = 0
let modalSession = 0
let closeModalAfterSubmit = false
let modalDeviceConfigId = ''

const openModal = (type: any, item: any) => {
  if (!listReady.value || submitting.value) return

  modalSession += 1
  closeModalAfterSubmit = false
  modalDeviceConfigId = String(props.configInfo?.id || '')
  modalTitle.value = type
  // 先用默认值初始化表单
  configForm.value = defaultConfigForm()

  if (modalTitle.value === $t('common.edit')) {
    // 编辑模式：加载选中项的数据
    configForm.value = JSON.parse(JSON.stringify(item))
  } else {
    // 添加模式：检查筛选器是否有值
    if (queryData.value.script_type) {
      // 如果筛选器有值，则将该值预设给表单的 script_type 字段
      configForm.value.script_type = queryData.value.script_type
    }
  }
  // 先设置 showModal 为 true，让模态框和表单开始渲染
  showModal.value = true

  // 使用 nextTick 确保 VDOM 更新和组件挂载完成后执行
  nextTick(() => {
    // 清除可能由初始数据绑定触发的校验提示
    configFormRef.value?.restoreValidation()
  })
}

const getPlatform = computed(() => {
  const { proxy }: any = getCurrentInstance()
  return proxy.getPlatform()
})
const bodyStyle = ref({
  width: getPlatform.value ? '90%' : '800px'
})
const queryData: any = ref({
  device_config_id: '',
  script_type: '',
  page: 1,
  page_size: 10
})

interface DataScriptItem {
  id: string
  name: string
  content: string
  description: string
  device_config_id: string
  enable_flag: string
  script_type: string
}

interface DataScriptQuizResponse {
  code: number | string
  message?: string
  data: unknown
}

const isDataScriptQuizResponse = (value: unknown): value is DataScriptQuizResponse => {
  if (!value || typeof value !== 'object') return false

  const response = value as Record<string, unknown>
  return (typeof response.code === 'number' || typeof response.code === 'string') && 'data' in response
}

const dataScriptList = ref<Array<DataScriptItem>>([])
const dataScriptTotal = ref(0)
const queryDataScriptList = async () => {
  const deviceConfigId = props.configInfo?.id
  const requestEpoch = ++listRequestEpoch
  dataScriptList.value = []
  dataScriptTotal.value = 0
  listReady.value = false
  if (!deviceConfigId) {
    return
  }
  try {
    const res = await getDataScriptList({ ...queryData.value, device_config_id: deviceConfigId })
    if (requestEpoch !== listRequestEpoch) return
    if (isFlatRequestFailure(res)) return

    dataScriptList.value = Array.isArray(res.data?.list) ? res.data.list : []
    dataScriptTotal.value = Number(res.data?.total) || 0
    listReady.value = true
  } catch {
    if (requestEpoch === listRequestEpoch) message.error(t('page.dataForward.requestFailed'))
  }
}
// const findScriptType = (scriptType: any) => {

//   if (scriptType) {
//     return scripTypeOpt.value.find((data: any) => {
//       return scriptType === data.value
//     })?.label
//   }
//   return ''
// }
const handleChange = async (item: DataScriptItem, enableFlag: string) => {
  if (!listReady.value || scriptMutationIds.value.has(item.id)) return

  const requestEpoch = listRequestEpoch
  scriptMutationIds.value = new Set(scriptMutationIds.value).add(item.id)
  try {
    const response = await setDeviceScriptEnable({ ...item, enable_flag: enableFlag })
    if (isFlatRequestFailure(response) || requestEpoch !== listRequestEpoch || !listReady.value) return

    const currentItem = dataScriptList.value.find(script => script.id === item.id)
    if (currentItem) currentItem.enable_flag = enableFlag
  } catch {
    message.error(t('page.dataForward.requestFailed'))
  } finally {
    const pendingIds = new Set(scriptMutationIds.value)
    pendingIds.delete(item.id)
    scriptMutationIds.value = pendingIds
  }
}
const handleClose = (force = false) => {
  if (submitting.value && !force) return
  modalSession += 1
  closeModalAfterSubmit = false
  quizLoading.value = false
  configFormRef.value?.restoreValidation()
  showModal.value = false
}
const handleModalShowUpdate = (value: boolean) => {
  if (!value) handleClose()
}
// 提交表单
const handleSubmit = async () => {
  if (submitting.value || quizLoading.value) return

  const session = modalSession
  submitting.value = true
  try {
    try {
      await configFormRef?.value?.validate()
    } catch {
      return
    }
    if (session !== modalSession || closeModalAfterSubmit) return

    const payload = { ...configForm.value, device_config_id: modalDeviceConfigId }
    const res = payload.id ? await dataScriptEdit(payload) : await dataScriptAdd(payload)
    if (isFlatRequestFailure(res) || session !== modalSession) return

    handleClose(true)
  } catch {
    message.error(t('page.dataForward.requestFailed'))
  } finally {
    submitting.value = false
    if (closeModalAfterSubmit && session === modalSession) handleClose()
  }
  await queryDataScriptList()
}
const deleteData = async (item: any) => {
  if (!listReady.value) return
  const requestEpoch = listRequestEpoch
  dialog.warning({
    title: $t('common.tip'),
    content: $t('common.deleteProcessing'),
    positiveText: $t('device_template.confirm'),
    negativeText: $t('common.cancel'),
    onPositiveClick: async () => {
      if (!listReady.value || requestEpoch !== listRequestEpoch) return

      try {
        const response = await dataScriptDel({ id: item.id })
        if (isFlatRequestFailure(response)) return

        await queryDataScriptList()
      } catch {
        message.error(t('page.dataForward.requestFailed'))
      }
    }
  })
}
const doQuiz = async () => {
  if (quizLoading.value || submitting.value) return

  const session = modalSession
  quizLoading.value = true
  try {
    await configFormRef?.value?.validate()
  } catch {
    quizLoading.value = false
    return
  }
  if (session !== modalSession || !showModal.value) return

  try {
    const response = await dataScriptQuiz({ ...configForm.value })
    if (session !== modalSession || !showModal.value) return

    if (isFlatRequestFailure(response)) {
      if (response.error.status !== 401) showQuizRequestFailure(response.error)
      return
    }

    // needMessage 会保留后端的 { code, message, data } 响应信封。
    if (!isDataScriptQuizResponse(response.data)) {
      configForm.value.resolt_analog_input = `${t('page.dataForward.debugFailed')}\nmessage: ${t('page.dataForward.noErrorMessage')}`
      return
    }

    const actualResponse = response.data
    if (actualResponse.code === 200 || actualResponse.code === '200') {
      // code为200时显示data的值
      if (typeof actualResponse.data === 'string') {
        // 如果data是字符串，直接显示（包括"null"字符串）
        configForm.value.resolt_analog_input =
          actualResponse.data === 'null' ? t('page.dataForward.debugSuccessWithNull') : actualResponse.data
      } else if (actualResponse.data === null || actualResponse.data === undefined) {
        // 如果data是null或undefined
        configForm.value.resolt_analog_input = t('page.dataForward.debugSuccessWithNull')
      } else {
        // 如果data是对象，转换为JSON字符串
        configForm.value.resolt_analog_input = JSON.stringify(actualResponse.data, null, 2)
      }
    } else {
      // code不为200时显示错误信息
      // 优先显示message，如果message为空则显示默认错误信息
      const errorMessage = actualResponse.message || t('page.dataForward.noErrorMessage')
      configForm.value.resolt_analog_input = `${t('page.dataForward.debugFailed')}\ncode: ${actualResponse.code}\nmessage: ${errorMessage}`
    }
  } catch (error: unknown) {
    if (session !== modalSession || !showModal.value) return

    if (isFlatRequestFailure(error)) {
      if (error.error.status !== 401) showQuizRequestFailure(error.error)
      return
    }

    configForm.value.resolt_analog_input =
      t('page.dataForward.debugRequestFailed') + ': ' + t('page.dataForward.unknownError')
  } finally {
    if (session === modalSession) quizLoading.value = false
  }
}
watch(
  () => [props.configInfo?.id, queryData.value.script_type, queryData.value.page, queryData.value.page_size],
  () => {
    if (showModal.value) {
      if (submitting.value) closeModalAfterSubmit = true
      else handleClose()
    }
    queryDataScriptList()
  },
  { immediate: true, flush: 'sync' }
)
onBeforeRouteLeave(() => !submitting.value)
useEventListener(window, 'beforeunload', event => {
  if (!submitting.value) return

  event.preventDefault()
  event.returnValue = true
})
</script>
<template>
  <div class="m-b-20px flex items-center gap-20px">
    <n-select v-model:value="queryData.script_type" :options="scripTypeOpt" class="max-w-40" clearable />
    <NButton type="primary" :disabled="!listReady" @click="openModal($t('common.add'), null)">
      {{ $t('generate.add-data-processing') }}
    </NButton>
  </div>
  <n-empty v-if="dataScriptList.length === 0" size="huge" :description="$t('common.nodata')"></n-empty>
  <NGrid v-else x-gap="24" y-gap="16" cols="1 s:2 m:3 l:4" responsive="screen">
    <NGridItem v-for="item in dataScriptList" :key="item.id">
      <ItemCard
        :title="item.name"
        :status-active="true"
        :status-type="'success'"
        :isStatus="false"
        :hideFooterLeft="true"
        hoverable
      >
        <template #default>
          <div class="item-desc">{{ item.description }}</div>
        </template>
        <!-- 右上角开关 -->
        <template #top-right-icon>
          <NSwitch
            :value="item.enable_flag"
            checked-value="Y"
            unchecked-value="N"
            :loading="scriptMutationIds.has(item.id)"
            :disabled="!listReady"
            @update:value="value => handleChange(item, value)"
          />
        </template>

        <!-- 底部操作按钮 -->
        <template #footer>
          <div class="flex items-center gap-2 w-full justify-between">
            <NButton size="small" quaternary circle :disabled="!listReady" @click="openModal($t('common.edit'), item)">
              <template #icon>
                <n-icon color="#888">
                  <editIcon />
                </n-icon>
              </template>
            </NButton>
            <NButton size="small" quaternary circle :disabled="!listReady" @click="deleteData(item)">
              <template #icon>
                <n-icon color="#888">
                  <trashIcon />
                </n-icon>
              </template>
            </NButton>
          </div>
        </template>
      </ItemCard>
      <!-- <NCard hoverable style="height: 180px">
        <div class="item-name item-center flex">
          <div class="flex-1">
            {{ item.name }}
          </div>
          <NSwitch
            v-model:value="item.enable_flag"
            checked-value="Y"
            unchecked-value="N"
            @update-value="handleChange(item)"
          />
        </div>
        <div class="h-80px flex-1">
          <div class="item-desc description">{{ item.description }}</div>
          <div class="item-desc">{{ findScriptType(item.script_type) }}</div>
        </div>
        <NFlex justify="end">
          <NButton tertiary circle type="info" @click="openModal($t('common.edit'), item)">
            <template #icon>
              <n-icon>
                <editIcon />
              </n-icon>
            </template>
          </NButton>
          <NButton circle tertiary type="error" @click="deleteData(item)">
            <template #icon>
              <n-icon>
                <trashIcon />
              </n-icon>
            </template>
          </NButton>
        </NFlex>
      </NCard> -->
    </NGridItem>
  </NGrid>

  <n-modal
    :show="showModal"
    preset="dialog"
    :width="800"
    :title="modalTitle + $t('common.dataProces')"
    :show-icon="false"
    :style="bodyStyle"
    :closable="false"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    @update:show="handleModalShowUpdate"
  >
    <NForm
      ref="configFormRef"
      class="flex-wrap"
      :class="getPlatform ? 'flex-col' : 'flex'"
      :model="configForm"
      :rules="configFormRules"
      :disabled="submitting"
      label-placement="left"
      label-width="auto"
    >
      <NFormItem :class="getPlatform ? 'w-100%' : 'w-50%'" :label="$t('page.manage.menu.form.title')" path="name">
        <NInput v-model:value="configForm.name" :placeholder="$t('generate.enter-title')" />
      </NFormItem>
      <NFormItem :class="getPlatform ? 'w-100%' : 'w-50%'" :label="$t('generate.processing-type')" path="script_type">
        <NSelect
          v-model:value="configForm.script_type"
          :options="scripTypeOpt"
          :placeholder="$t('generate.select-processing-type')"
        ></NSelect>
      </NFormItem>
      <NFormItem class="w-100%" :label="$t('device_template.table_header.description')" path="description">
        <NInput
          v-model:value="configForm.description"
          type="textarea"
          :rows="2"
          :placeholder="$t('generate.enter-description')"
        />
      </NFormItem>
      <NFormItem class="w-100%" :label="$t('generate.parse-script')" :rules="configFormRules" path="content">
        <div class="editor-container">
          <!-- 编辑器工具栏 -->
          <div class="editor-toolbar">
            <div class="toolbar-left">
              <NButton size="small" tertiary :disabled="submitting" @click="toggleWordWrap">
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3l3 3v-2h2.25c2.3 0 4.25-2.05 4.25-4.5S19.55 11 17.25 11z"
                      />
                    </svg>
                  </n-icon>
                </template>
                自动换行
              </NButton>
              <NButton size="small" tertiary :disabled="submitting" @click="toggleMinimap">
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h2v2H7V7zm0 4h2v2H7v-2zm0 4h2v2H7v-2zm4-8h6v2h-6V7zm0 4h6v2h-6v-2zm0 4h6v2h-6v-2z"
                      />
                    </svg>
                  </n-icon>
                </template>
                小地图
              </NButton>
            </div>
            <div class="toolbar-right">
              <NButton size="small" tertiary :disabled="submitting" @click="changeFontSize(-1)">
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13H5v-2h14v2z" /></svg>
                  </n-icon>
                </template>
              </NButton>
              <span class="font-size-display">{{ editorOptions.fontSize }}px</span>
              <NButton size="small" tertiary :disabled="submitting" @click="changeFontSize(1)">
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                  </n-icon>
                </template>
              </NButton>
            </div>
          </div>
          <!-- Monaco Editor -->
          <div class="editor-wrapper">
            <LuaEditor
              v-model:value="configForm.content"
              :options="activeEditorOptions"
              height="300"
              language="lua"
              class="custom-monaco-editor"
            />
          </div>
        </div>
      </NFormItem>
      <NFormItem
        v-if="0"
        class="w-100%"
        :label="$t('page.manage.setting.dataClearSetting.form.enabled')"
        path="enable_flag"
      >
        <NSwitch v-model:value="configForm.enable_flag" checked-value="Y" unchecked-value="N" />
      </NFormItem>
      <NFormItem class="w-100%" :label="$t('generate.simulate-input')" path="last_analog_input">
        <NInput v-model:value="configForm.last_analog_input" type="textarea" :rows="2" />
      </NFormItem>
      <NFormItem class="w-100%" :label="$t('generate.debug-run-result')" path="resolt_analog_input">
        <NInput v-model:value="configForm.resolt_analog_input" :rows="5" :disabled="true" type="textarea" />
      </NFormItem>
      <NFormItem>
        <NButton type="primary" :loading="quizLoading" :disabled="submitting" @click="doQuiz">
          {{ $t('common.debug') }}
        </NButton>
      </NFormItem>
    </NForm>
    <NFlex justify="end">
      <NButton :disabled="submitting" @click="handleClose()">{{ $t('generate.cancel') }}</NButton>
      <NButton type="primary" :loading="submitting" :disabled="quizLoading" @click="handleSubmit">
        {{ $t('common.save') }}
      </NButton>
    </NFlex>
  </n-modal>
</template>

<style scoped lang="scss">
.alarm-box {
  display: flex;
  flex-flow: row;
  justify-content: flex-start;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 40px;

  .alarm-item {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 18px;
    flex: 0 0 23%;
    margin-right: calc(30% / 3);
    margin-bottom: 30px;

    .item-name {
      display: flex;
      flex-flow: row;
      align-items: center;
      justify-content: space-between;
    }

    .item-desc {
      margin: 15px 0;
    }

    .item-operate {
      display: flex;
      flex-flow: row;
      justify-content: space-between;
      align-items: center;
    }
  }
}

.description {
  height: 40px;
  word-break: break-all;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* 编辑器容器样式 */
.editor-container {
  width: 100%;
  border: 1px solid #e0e0e6;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e6;
  min-height: 40px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.font-size-display {
  font-size: 12px;
  color: #666;
  min-width: 35px;
  text-align: center;
}

.editor-wrapper {
  position: relative;
  background: #fff;
  width: 100%;
}

.custom-monaco-editor {
  border: none !important;
  width: 100% !important;
}

/* 编辑器工具栏按钮样式优化 */
.editor-toolbar .n-button {
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.editor-toolbar .n-button .n-icon {
  font-size: 14px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .editor-toolbar {
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .toolbar-left,
  .toolbar-right {
    width: 100%;
    justify-content: center;
  }
}
</style>
