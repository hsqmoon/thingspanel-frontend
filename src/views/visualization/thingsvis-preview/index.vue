<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NResult, NSpin } from 'naive-ui'
import ThingsVisAppFrame from '@/components/thingsvis/ThingsVisAppFrame.vue'
import ThingsVisSharedFrame from '@/components/thingsvis/ThingsVisSharedFrame.vue'
import { getThingsVisDashboard, type ThingsVisDashboard } from '@/service/api/thingsvis'

const route = useRoute()

const dashboardSchema = ref<ThingsVisDashboard | null>(null)
const loading = ref(false)
const loadError = ref('')
let loadSequence = 0

const shareToken = computed(() => {
  const queryValue = route.query.shareToken
  return typeof queryValue === 'string' ? queryValue.trim() : ''
})

const dashboardId = computed(() => {
  const queryValue = route.query.id
  if (typeof queryValue === 'string' && queryValue.trim()) {
    return queryValue.trim()
  }

  const paramValue = route.params.dashboardId
  if (typeof paramValue === 'string' && paramValue.trim()) {
    return paramValue.trim()
  }

  return ''
})

async function loadDashboard() {
  if (shareToken.value) {
    loadSequence += 1
    dashboardSchema.value = null
    loadError.value = ''
    loading.value = false
    return
  }

  if (!dashboardId.value) {
    loadSequence += 1
    dashboardSchema.value = null
    loadError.value = ''
    loading.value = false
    return
  }

  const requestedDashboardId = dashboardId.value
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = ''
  try {
    const { data, error } = await getThingsVisDashboard(requestedDashboardId)
    if (sequence !== loadSequence) return
    if (error || !data) {
      loadError.value = error?.message || '仪表盘加载失败，请重试'
      return
    }
    dashboardSchema.value = data
    document.title = `${data.name || '仪表盘'} - 浏览`
  } catch {
    if (sequence !== loadSequence) return
    loadError.value = '仪表盘加载失败，请重试'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

watch(
  [dashboardId, shareToken],
  () => {
    void loadDashboard()
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full w-full bg-white">
    <div v-if="dashboardId" class="h-full w-full overflow-hidden bg-white">
      <ThingsVisSharedFrame v-if="shareToken" :id="dashboardId" :share-token="shareToken" class="h-full w-full" />
      <NSpin v-else :show="loading" class="h-full">
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
    <div v-else class="flex h-full items-center justify-center text-gray-400">
      <div class="text-center">
        <p class="text-lg">无法加载仪表盘</p>
        <p class="text-sm mt-2 opacity-70">ID: {{ dashboardId }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 确保容器占满全屏 */
:global(body),
:global(#app) {
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
