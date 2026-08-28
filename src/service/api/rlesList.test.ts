import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn())

vi.mock('../request', () => ({ request: { get: requestGet } }))

import { getRolePermissions } from './rlesList'

describe('role permission API failures', () => {
  beforeEach(() => {
    requestGet.mockReset()
  })

  it('preserves a permission failure instead of treating the role as having no permissions', async () => {
    const failure = { data: null, error: { message: 'Unavailable', status: 503 } }
    requestGet.mockResolvedValue(failure)

    await expect(getRolePermissions('role-1')).resolves.toBe(failure)
    expect(requestGet).toHaveBeenCalledWith('/casbin/function?role_id=role-1')
  })
})
