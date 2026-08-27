<script setup lang="ts">
import { $t } from '@/locales'
import useVersionInfo from '@/hooks/business/use-version-info'

defineOptions({
  name: 'GlobalFooter'
})

const { currentVersion, latestVersion } = useVersionInfo()
</script>

<template>
  <DarkModeContainer class="h-full flex-center">
    <div class="flex flex-wrap items-center justify-center gap-x-2 text-center text-xs text-[var(--n-text-color)]">
      <span>Copyright &copy; 2026 福州市晋安区我的视界宠物用品有限责任公司</span>
      <span>|</span>
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">闽ICP备2026031617号</a>
      <span>|</span>
      <span>{{ $t('card.versionInfo.currentVersion') }} {{ currentVersion }}</span>
      <span>|</span>
      <span>{{ $t('card.versionInfo.latestVersion') }}{{ latestVersion }}</span>
    </div>
  </DarkModeContainer>
</template>

<style scoped></style>
