<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editor } from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/lua/register'

const contributionsReady = Promise.all([
  import('monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'),
  import('monaco-editor/editor/contrib/clipboard/browser/clipboard'),
  import('monaco-editor/editor/contrib/contextmenu/browser/contextmenu'),
  import('monaco-editor/editor/contrib/find/browser/findController'),
  import('monaco-editor/editor/contrib/folding/browser/folding'),
  import('monaco-editor/editor/contrib/indentation/browser/indentation'),
  import('monaco-editor/editor/contrib/suggest/browser/suggestController')
])

interface Props {
  value?: string
  height?: string | number
  options?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  height: '100%',
  options: () => ({})
})

const emit = defineEmits<{
  'update:value': [value: string]
}>()

const containerRef = ref<HTMLElement>()
const height = computed(() => (typeof props.height === 'number' ? `${props.height}px` : props.height))
let editorInstance: editor.IStandaloneCodeEditor | null = null
let contentChangeListener: { dispose: () => void } | null = null

onMounted(async () => {
  await contributionsReady
  if (!containerRef.value) return

  editorInstance = editor.create(containerRef.value, {
    ...props.options,
    value: props.value,
    language: 'lua'
  })
  contentChangeListener = editorInstance.onDidChangeModelContent(() => {
    const value = editorInstance?.getValue() ?? ''
    if (value !== props.value) emit('update:value', value)
  })
})

watch(
  () => props.value,
  value => {
    if (editorInstance && editorInstance.getValue() !== value) editorInstance.setValue(value)
  }
)

watch(
  () => props.options,
  options => editorInstance?.updateOptions(options as editor.IEditorOptions & editor.IGlobalEditorOptions),
  { deep: true }
)

onBeforeUnmount(() => {
  const model = editorInstance?.getModel()
  contentChangeListener?.dispose()
  editorInstance?.dispose()
  model?.dispose()
  contentChangeListener = null
  editorInstance = null
})
</script>

<template>
  <div ref="containerRef" class="w-full" :style="{ height }"></div>
</template>
