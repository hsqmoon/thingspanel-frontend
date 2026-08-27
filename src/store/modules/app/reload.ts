import { ref } from 'vue'

export const reloadFlag = ref(true)

export async function reloadPage(duration = 0) {
  reloadFlag.value = false

  if (duration > 0) {
    await new Promise(resolve => {
      setTimeout(resolve, duration)
    })
  }

  reloadFlag.value = true
}
