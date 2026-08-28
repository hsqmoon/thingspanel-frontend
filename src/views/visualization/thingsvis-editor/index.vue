<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NBreadcrumb, NBreadcrumbItem, NResult, NSpin } from 'naive-ui'
import { $t } from '@/locales'
import { useRouterPush } from '@/hooks/common/router'
import { getThingsVisDashboard, type ThingsVisDashboard } from '@/service/api/thingsvis'
import ThingsVisAppFrame from '@/components/thingsvis/ThingsVisAppFrame.vue'

const route = useRoute()
const { routerPushByKey } = useRouterPush()

const dashboardId = computed(() => String(route.query.id || '').trim())
const currentProjectId = computed(() => {
  const routeProjectId = String(route.query.projectId || '').trim()
  const schemaProjectId = dashboardSchema.value?.id === dashboardId.value ? dashboardSchema.value.projectId : ''
  return routeProjectId || schemaProjectId
})
const projectTitle = ref('')
const dashboardSchema = ref<ThingsVisDashboard | null>(null)
const loading = ref(false)
const loadError = ref('')
let loadSequence = 0
const currentDashboardSchema = computed(() =>
  dashboardSchema.value?.id === dashboardId.value ? dashboardSchema.value : null
)

/** 加载标题 (仅用于面包屑显示) */
const loadDashboardInfo = async () => {
  if (!dashboardId.value) {
    loadSequence += 1
    projectTitle.value = ''
    dashboardSchema.value = null
    loadError.value = ''
    loading.value = false
    return
  }

  const requestedDashboardId = dashboardId.value
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = ''
  if (dashboardSchema.value?.id !== requestedDashboardId) {
    projectTitle.value = ''
  }

  try {
    const { data, error } = await getThingsVisDashboard(requestedDashboardId)
    if (sequence !== loadSequence) return
    if (error || !data) {
      loadError.value = error?.message || '仪表盘加载失败，请重试'
      return
    }
    projectTitle.value = data.name
    dashboardSchema.value = data
  } catch {
    if (sequence !== loadSequence) return
    loadError.value = '仪表盘加载失败，请重试'
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
    }
  }
}

const goBack = () => {
  if (currentProjectId.value) {
    routerPushByKey('visualization_thingsvis-dashboards', {
      query: { projectId: currentProjectId.value }
    })
    return
  }

  routerPushByKey('visualization_thingsvis')
}

watch(
  dashboardId,
  () => {
    void loadDashboardInfo()
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full w-full flex flex-col">
    <!-- 顶部导航栏 -->
    <div class="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-2 min-h-12">
      <NBreadcrumb>
        <NBreadcrumbItem class="cursor-pointer" @click="goBack">仪表盘列表</NBreadcrumbItem>
        <NBreadcrumbItem>
          {{ projectTitle || $t('common.loading') }}
        </NBreadcrumbItem>
      </NBreadcrumb>

      <NButton text @click="goBack">
        {{ $t('common.back') }}
      </NButton>
    </div>

    <!-- 编辑器区域 (全屏 Iframe) -->
    <div class="flex-1 overflow-hidden bg-white relative">
      <NSpin :show="loading" class="h-full">
        <NResult v-if="loadError" status="error" title="仪表盘加载失败" :description="loadError">
          <template #footer>
            <NButton type="primary" @click="loadDashboardInfo">重试</NButton>
          </template>
        </NResult>
        <ThingsVisAppFrame
          v-else-if="currentDashboardSchema"
          :id="dashboardId"
          :schema="currentDashboardSchema"
          mode="editor"
        />
      </NSpin>
    </div>
  </div>
</template>
