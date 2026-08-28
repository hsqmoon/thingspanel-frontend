import { describe, expect, it } from 'vitest'
import { smartDeepClone } from './deep-clone'

describe('smartDeepClone', () => {
  it('creates an independent nested clone', () => {
    const source = { nested: { value: 1 }, items: [{ enabled: true }] }
    const cloned = smartDeepClone(source)

    cloned.nested.value = 2
    cloned.items[0].enabled = false

    expect(source).toEqual({ nested: { value: 1 }, items: [{ enabled: true }] })
  })

  it('throws instead of returning a shallow copy when every deep-clone strategy fails', () => {
    const source = { nested: { value: 1 }, callback: () => undefined }

    expect(() => smartDeepClone(source)).toThrowError('Deep clone failed')
  })

  it('rejects non-JSON values when JSON cloning is explicitly requested', () => {
    expect(() => smartDeepClone({ createdAt: new Date() }, { forceJSON: true })).toThrowError('Deep clone failed')
  })
})
