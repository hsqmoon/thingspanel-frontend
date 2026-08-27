import type { ComponentPublicInstance } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useNaiveForm } from './form'

vi.mock('@/locales', () => ({ $t: (key: string) => key }))

describe('useNaiveForm', () => {
  it('validates through a function template ref and clears detached instances', async () => {
    const validateForm = vi.fn(async () => undefined)
    const restoreValidation = vi.fn()
    const formInstance = {
      validate: validateForm,
      restoreValidation,
      invalidateLabelWidth: vi.fn()
    } as unknown as ComponentPublicInstance
    const { formRef, setFormRef, validate, restoreValidation: restore } = useNaiveForm()

    setFormRef(formInstance)
    await validate()
    restore()

    expect(validateForm).toHaveBeenCalledOnce()
    expect(restoreValidation).toHaveBeenCalledOnce()

    setFormRef(null)
    expect(formRef.value).toBeNull()
  })
})
