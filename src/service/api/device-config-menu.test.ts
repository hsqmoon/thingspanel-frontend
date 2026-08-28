import { expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }))

vi.mock('../request', () => ({
  request: {
    delete: vi.fn(),
    delete2: vi.fn(),
    get: requestGet,
    post: vi.fn(),
    put: vi.fn()
  }
}))

import { deviceConfigMenu } from './device'

it('accepts component-owned silent errors for the device template menu', async () => {
  await deviceConfigMenu({ name: '' }, { silentError: true })

  expect(requestGet).toHaveBeenCalledWith('/device/template/menu', {
    params: { name: '' },
    silentError: true
  })
})
