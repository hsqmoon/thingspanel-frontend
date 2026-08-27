<script setup lang="ts">
import { watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import useImageVerify from '@/hooks/business/use-image-verify'

defineOptions({ name: 'ImageVerify' })

interface Props {
  code?: string
}

const props = withDefaults(defineProps<Props>(), {
  code: ''
})

interface Emits {
  (e: 'update:code', code: string): void
}

const emit = defineEmits<Emits>()

const { domRef, imgCode, setImgCode, getImgCode } = useImageVerify()
const setDomRef = (element: Element | ComponentPublicInstance | null) => {
  domRef.value = element instanceof HTMLCanvasElement ? element : undefined
}

watch(
  () => props.code,
  newValue => {
    setImgCode(newValue)
  }
)
watch(imgCode, newValue => {
  emit('update:code', newValue)
})

defineExpose({ getImgCode })
</script>

<template>
  <div>
    <canvas :ref="setDomRef" width="152" height="40" class="cursor-pointer" @click="getImgCode"></canvas>
  </div>
</template>

<style scoped></style>
