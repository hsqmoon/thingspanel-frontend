<script setup lang="tsx">
import { ref } from 'vue'
import { isFlatRequestFailure } from '@sa/axios'
import { editFunction, getFunction } from '@/service/api/setting'

interface FunctionOption {
  id: string
  description: string
  enable_flag: string
  value: boolean
}

const updatingId = ref('')

const changeFunc = async (item: FunctionOption) => {
  if (updatingId.value) return

  updatingId.value = item.id
  try {
    const response = await editFunction({ function_id: item.id })
    if (isFlatRequestFailure(response)) return

    await getFunctionOption()
  } finally {
    updatingId.value = ''
  }
}
const funcOptions = ref<FunctionOption[]>([])
async function getFunctionOption() {
  const response = await getFunction()
  if (isFlatRequestFailure(response) || !response.data) return

  localStorage.setItem('enableZcAndYzm', JSON.stringify(response.data))
  funcOptions.value = response.data.map((v: Omit<FunctionOption, 'value'>) => {
    return {
      ...v,
      value: v.enable_flag === 'enable'
    }
  })
}

getFunctionOption()
</script>

<template>
  <NFlex class="function-setting-panel">
    <NForm class="function-setting-form" label-placement="left" :label-width="260">
      <NGrid :cols="24" :x-gap="18">
        <NFormItemGridItem v-for="(item, index) in funcOptions" :key="index" :span="24" :label="item.description">
          <n-switch
            :value="item.value"
            :loading="updatingId === item.id"
            :disabled="Boolean(updatingId)"
            @update:value="() => changeFunc(item)"
          />
        </NFormItemGridItem>
      </NGrid>
      <NSpace class="w-full pt-16px" :size="24" justify="start"></NSpace>
    </NForm>
  </NFlex>
</template>

<style lang="scss" scoped>
.function-setting-panel {
  width: 100%;
  padding-top: 12px;
}

.function-setting-form {
  width: min(640px, 100%);
}
</style>
