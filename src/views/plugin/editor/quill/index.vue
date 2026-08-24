<script setup lang="ts">
import { ref } from 'vue'
import { $t } from '@/locales'

const content = ref('')
</script>

<template>
  <div class="h-full">
    <NCard :title="$t('generate.richTextPlugin')" :bordered="false" class="rounded-8px shadow-sm">
      <NInput v-model:value="content" type="textarea" :autosize="{ minRows: 12 }" />
    </NCard>
  </div>
</template>

