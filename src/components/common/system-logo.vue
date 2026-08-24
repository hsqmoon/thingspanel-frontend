<script lang="ts" setup>
defineOptions({ name: 'SystemLogo' })
export interface Props {
  width: string
}

withDefaults(defineProps<Props>(), {
  width: '40'
})
</script>

<template>
  <!-- <IconLocalLogo /> -->
  <div :style="{ height: width + 'rpx' }">
    <!--  v-if="sysSettingStore.logo_background"  -->
    <!-- {{sysSettingStore  }} -->
    <n-image :width="width" src="/favicon.ico" />
    <!-- <v-else icon-local-logo /> -->
  </div>
</template>

<style scoped></style>
