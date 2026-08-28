import { describe, expect, it, vi } from 'vitest'

vi.mock('@/router/elegant/routes', () => ({
  generatedRoutes: [
    { component: 'layout.base' },
    { component: 'view.device_config' }
  ]
}))
vi.mock('@/router/elegant/transform', () => ({
  getRouteName: (path: string) => (path === '/device/template' ? 'device_config' : null)
}))

import { adapterOfFetchUserRouterList } from './management.adapter'

describe('management route adapter', () => {
  it('maps the current device-template URL to its current generated view', () => {
    const routes = adapterOfFetchUserRouterList([
      {
        element_code: 'custom_device_templates',
        element_type: 2,
        parent_id: 'device',
        param1: '/device/template',
        description: '设备配置',
        multilingual: 'route.device_config',
        orders: 1,
        param2: '',
        param3: '0',
        remark: ''
      } as any
    ])

    expect(routes).toHaveLength(1)
    expect(routes[0]?.component).toBe('view.device_config')
  })

  it('rejects a damaged menu route instead of silently hiding it', () => {
    expect(() =>
      adapterOfFetchUserRouterList([
        {
          element_code: 'broken_menu',
          element_type: 2,
          parent_id: 'device',
          param1: '/missing/view',
          description: '损坏菜单',
          multilingual: '',
          orders: 1,
          param2: '',
          param3: '0',
          remark: ''
        } as any
      ])
    ).toThrow(/损坏菜单.*缺少有效组件/)
  })
})
