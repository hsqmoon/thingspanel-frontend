<script setup lang="ts">
import { ref } from 'vue'
import { type ECOption, useEcharts } from '@/hooks/chart/use-echarts'

const refreshCount = ref(0)
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function createValues(base: number, step: number) {
  return weekDays.map((_, index) => base + ((index * step + refreshCount.value * 7) % 28))
}

function createLineOptions(): ECOption {
  return {
    title: { text: '设备在线趋势', left: 16, top: 8 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['在线设备', '活跃设备'], top: 40 },
    grid: { left: 48, right: 24, top: 82, bottom: 36 },
    xAxis: { type: 'category', boundaryGap: false, data: weekDays },
    yAxis: { type: 'value', min: 0 },
    series: [
      {
        name: '在线设备',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.16 },
        data: createValues(120, 11)
      },
      {
        name: '活跃设备',
        type: 'line',
        smooth: true,
        data: createValues(82, 9)
      }
    ]
  }
}

function createBarOptions(): ECOption {
  return {
    title: { text: '告警处理统计', left: 16, top: 8 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['已处理', '待处理'], top: 40 },
    grid: { left: 48, right: 24, top: 82, bottom: 36 },
    xAxis: { type: 'category', data: weekDays },
    yAxis: { type: 'value', min: 0 },
    series: [
      {
        name: '已处理',
        type: 'bar',
        stack: '告警',
        barMaxWidth: 36,
        data: createValues(28, 5)
      },
      {
        name: '待处理',
        type: 'bar',
        stack: '告警',
        barMaxWidth: 36,
        data: createValues(6, 3).map(value => Math.round(value / 3))
      }
    ]
  }
}

function createPieOptions(): ECOption {
  const offset = refreshCount.value % 4

  return {
    title: { text: '设备类型分布', left: 16, top: 8 },
    tooltip: { trigger: 'item', formatter: '{b}：{c}（{d}%）' },
    legend: { orient: 'vertical', left: 16, top: 56 },
    series: [
      {
        name: '设备类型',
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['62%', '56%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
        data: [
          { name: '智能插座', value: 86 + offset * 3 },
          { name: '环境传感器', value: 64 + offset * 2 },
          { name: '网关', value: 32 + offset },
          { name: '其他设备', value: 18 + offset }
        ]
      }
    ]
  }
}

const { setDomRef: setLineRef, updateOptions: updateLineOptions } = useEcharts(createLineOptions)
const { setDomRef: setBarRef, updateOptions: updateBarOptions } = useEcharts(createBarOptions)
const { setDomRef: setPieRef, updateOptions: updatePieOptions } = useEcharts(createPieOptions)

async function refreshCharts() {
  refreshCount.value += 1
  await Promise.all([
    updateLineOptions((_options, factory) => factory()),
    updateBarOptions((_options, factory) => factory()),
    updatePieOptions((_options, factory) => factory())
  ])
}
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :bordered="false" class="rounded-8px shadow-sm">
      <NFlex justify="space-between" align="center">
        <div>
          <h2 class="m-0 text-20px font-600">ECharts 图表示例</h2>
          <p class="mb-0 mt-8px text-gray-500">使用本地数据展示折线图、柱状图和环形图，无外部数据源依赖。</p>
        </div>
        <NButton type="primary" @click="refreshCharts">刷新示例数据</NButton>
      </NFlex>
    </NCard>

    <NGrid cols="1 l:2" responsive="screen" :x-gap="16" :y-gap="16">
      <NGridItem>
        <NCard :bordered="false" class="rounded-8px shadow-sm">
          <div :ref="setLineRef" class="h-380px"></div>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard :bordered="false" class="rounded-8px shadow-sm">
          <div :ref="setBarRef" class="h-380px"></div>
        </NCard>
      </NGridItem>
      <NGridItem span="1 l:2">
        <NCard :bordered="false" class="rounded-8px shadow-sm">
          <div :ref="setPieRef" class="h-380px"></div>
        </NCard>
      </NGridItem>
    </NGrid>
  </NSpace>
</template>
