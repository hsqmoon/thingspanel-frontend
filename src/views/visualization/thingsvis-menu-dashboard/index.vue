<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NBreadcrumb, NBreadcrumbItem, NResult, NSpin } from 'naive-ui'
import { getThingsVisDashboard, type ThingsVisDashboard } from '@/service/api/thingsvis'
import { useRouterPush } from '@/hooks/common/router'
import ThingsVisAppFrame from '@/components/thingsvis/ThingsVisAppFrame.vue'

const route = useRoute()
const { routerPushByKey } = useRouterPush()

const dashboardSchema = ref<ThingsVisDashboard | null>(null)
const dashboardTitle = ref('')
const loading = ref(false)
const loadError = ref('')
let loadSequence = 0

const dashboardId = computed(() => {
  const paramValue = route.params.dashboardId
  if (typeof paramValue === 'string' && paramValue.trim()) {
    return paramValue.trim()
  }

  const queryValue = route.query.id
  if (typeof queryValue === 'string' && queryValue.trim()) {
    return queryValue.trim()
  }

  const segments = route.path.split('/').filter(Boolean)
  return segments.at(-1) || ''
})

async function loadDashboard() {
  if (!dashboardId.value) {
    loadSequence += 1
    dashboardSchema.value = null
    dashboardTitle.value = ''
    loadError.value = ''
    loading.value = false
    return
  }

  const requestedDashboardId = dashboardId.value
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = ''
  if (dashboardSchema.value?.id !== requestedDashboardId) dashboardTitle.value = ''
  try {
    const { data, error } = await getThingsVisDashboard(requestedDashboardId)
    if (sequence !== loadSequence) return
    if (error || !data) {
      loadError.value = error?.message || '仪表盘加载失败，请重试'
      return
    }
    dashboardSchema.value = data
    dashboardTitle.value = data.name || ''
  } catch {
    if (sequence !== loadSequence) return
    loadError.value = '仪表盘加载失败，请重试'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

watch(
  dashboardId,
  () => {
    void loadDashboard()
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full w-full flex flex-col bg-[var(--layout-content-bg)]">
    <div class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 h-12">
      <NBreadcrumb>
        <NBreadcrumbItem class="cursor-pointer" @click="routerPushByKey('home')">首页</NBreadcrumbItem>
        <NBreadcrumbItem>
          {{ dashboardTitle || '仪表盘' }}
        </NBreadcrumbItem>
      </NBreadcrumb>

      <NButton text @click="routerPushByKey('home')">返回首页</NButton>
    </div>

    <div class="flex-1 overflow-hidden bg-white">
      <NSpin :show="loading" class="h-full">
        <NResult v-if="loadError" status="error" title="仪表盘加载失败" :description="loadError">
          <template #footer>
            <NButton type="primary" @click="loadDashboard">重试</NButton>
          </template>
        </NResult>
        <ThingsVisAppFrame
          v-else-if="dashboardSchema?.id === dashboardId"
          :id="dashboardId"
          :schema="dashboardSchema"
          mode="viewer"
          class="h-full w-full"
        />
      </NSpin>
    </div>
  </div>
</template>
