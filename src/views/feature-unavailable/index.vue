<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="h-full w-full flex-center p-24px">
    <NResult
      status="info"
      title="当前生产 Profile 未启用可视化"
      description="ThingsVis 属于可选组件。当前核心版继续提供设备、规则、告警和 OTA 功能，不会向未运行的可视化服务发起请求。"
    >
      <template #footer>
        <NButton type="primary" @click="router.push('/home')">返回首页</NButton>
      </template>
    </NResult>
  </div>
</template>
