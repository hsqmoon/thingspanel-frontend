import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestPost = vi.hoisted(() => vi.fn())
const requestGet = vi.hoisted(() => vi.fn())

vi.mock('../request', () => ({
  request: {
    get: requestGet,
    post: requestPost
  }
}))

import { fetchGetUserInfo, fetchSuperAdminInit, transformUser } from './auth'

describe('super administrator initialization API', () => {
  beforeEach(() => {
    requestPost.mockReset()
    requestGet.mockReset()
  })

  it('returns a 404 failure without retrying the removed legacy registration endpoint', async () => {
    const failure = {
      data: null,
      error: { message: 'Not found', status: 404, code: 'ERR_BAD_REQUEST' }
    }
    const payload = {
      email: 'admin@example.com',
      password: 'password1',
      confirm_password: 'password1'
    }
    requestPost.mockResolvedValue(failure)

    await expect(fetchSuperAdminInit(payload)).resolves.toEqual(failure)
    expect(requestPost).toHaveBeenCalledOnce()
    expect(requestPost).toHaveBeenCalledWith('/tenant/super-admin/init', payload, {
      headers: { 'Content-Type': 'application/json' }
    })
  })

  it('owns transform 401 failures without allowing them to clear the current administrator session', async () => {
    requestPost.mockResolvedValue({ data: null, error: { message: 'Forbidden', status: 401 } })

    await transformUser({ become_user_id: 'tenant-user' })

    expect(requestPost).toHaveBeenCalledWith(
      '/user/transform',
      { become_user_id: 'tenant-user' },
      { preserveSessionOn401: true, silentError: true }
    )
  })

  it('loads a candidate identity with its own token and owned error message', async () => {
    await fetchGetUserInfo('candidate-token')

    expect(requestGet).toHaveBeenCalledWith('/user/detail', {
      headers: { 'x-token': 'candidate-token' },
      silentError: true
    })
  })
})
