import { createApp, nextTick, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const thingsVisApi = vi.hoisted(() => ({
  applySuperAdminHomeTemplate: vi.fn(),
  createThingsVisDashboard: vi.fn(),
  createThingsVisProject: vi.fn(),
  deleteThingsVisProject: vi.fn(),
  duplicateThingsVisDashboard: vi.fn(),
  getThingsVisDashboard: vi.fn(),
  getThingsVisDashboards: vi.fn(),
  getThingsVisDashboardThumbnail: vi.fn(),
  getThingsVisHomeDashboard: vi.fn(),
  getThingsVisProject: vi.fn(),
  getThingsVisProjects: vi.fn(),
  setHomeThingsVisDashboard: vi.fn(),
  updateThingsVisProject: vi.fn()
}))
const menuApi = vi.hoisted(() => ({
  deleteDashboardMenuConfig: vi.fn(),
  fetchDashboardDeletion: vi.fn(),
  fetchDashboardMenuConfig: vi.fn(),
  requestDashboardDeletion: vi.fn(),
  saveDashboardMenuConfig: vi.fn()
}))
const message = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}))
const routerPushByKey = vi.hoisted(() => vi.fn())
const refreshAuthRoutes = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const clearThingsVisHomeCache = vi.hoisted(() => vi.fn())
const routeState = vi.hoisted(() => ({
  fullPath: '/visualization',
  path: '/visualization',
  params: {} as Record<string, string>,
  query: {} as Record<string, string>
}))

vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')
  const passthrough = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () =>
        h(
          'div',
          attrs,
          Object.values(slots).flatMap((slot) => slot?.() || [])
        )
    }
  })
  const button = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            'data-circle': String(Object.prototype.hasOwnProperty.call(attrs, 'circle'))
          },
          Object.values(slots).flatMap((slot) => slot?.() || [])
        )
    }
  })
  const toggle = defineComponent({
    inheritAttrs: false,
    props: { value: Boolean },
    emits: ['update:value'],
    setup(props, { emit }) {
      return () => h('button', { class: 'switch', onClick: () => emit('update:value', !props.value) }, 'switch')
    }
  })
  return {
    NButton: button,
    NBreadcrumb: passthrough,
    NBreadcrumbItem: passthrough,
    NCard: passthrough,
    NEmpty: passthrough,
    NForm: passthrough,
    NFormItem: passthrough,
    NGrid: passthrough,
    NGridItem: passthrough,
    NInput: passthrough,
    NInputNumber: passthrough,
    NModal: passthrough,
    NResult: passthrough,
    NSpin: passthrough,
    NSwitch: toggle,
    NTag: passthrough,
    NTooltip: passthrough,
    useMessage: () => message
  }
})
vi.mock('vue-router', () => ({ useRoute: () => routeState }))
vi.mock('@/hooks/common/router', () => ({ useRouterPush: () => ({ routerPushByKey }) }))
vi.mock('@/service/api/thingsvis', () => thingsVisApi)
vi.mock('@/service/api/dashboard-menu', () => menuApi)
vi.mock('@/utils/router/refresh-auth-routes', () => ({ refreshAuthRoutes }))
vi.mock('@/utils/thingsvis/home-cache', () => ({ clearThingsVisHomeCache }))
vi.mock('@/locales', () => ({ $t: (key: string) => key }))
vi.mock('@/views/device/config/MarketPublishEntry.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/thingsvis/ThingsVisAppFrame.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { schema: Object },
      setup(props) {
        return () => h('div', { class: 'thingsvis-app-frame' }, (props.schema as any)?.name || '')
      }
    })
  }
})

import ThingsVisProjects from '@/views/visualization/thingsvis/index.vue'
import ThingsVisDashboards from '@/views/visualization/thingsvis-dashboards/index.vue'
import ThingsVisEditor from '@/views/visualization/thingsvis-editor/index.vue'
import ThingsVisMenuDashboard from '@/views/visualization/thingsvis-menu-dashboard/index.vue'
import ThingsVisPreview from '@/views/visualization/thingsvis-preview/index.vue'

const apiFailure = { data: null, error: { message: 'service unavailable', status: 503 } }

function mount(component: Component) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(component)
  app.mount(root)
  return { app, root }
}

function findButton(root: HTMLElement, text: string) {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.includes(text))
}

function findNestedButton(root: HTMLElement, text: string) {
  return Array.from(root.querySelectorAll<HTMLElement>('*'))
    .filter((element) => element.textContent?.trim() === text)
    .map((element) => element.querySelector<HTMLButtonElement>('button'))
    .find((button): button is HTMLButtonElement => Boolean(button))
}

async function flushUI() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('ThingsVis mutation failure guards', () => {
  const mountedApps: ReturnType<typeof mount>[] = []

  beforeEach(() => {
    document.body.innerHTML = ''
    Object.values(thingsVisApi).forEach((mock) => mock.mockReset())
    Object.values(menuApi).forEach((mock) => mock.mockReset())
    Object.values(message).forEach((mock) => mock.mockReset())
    routerPushByKey.mockReset()
    refreshAuthRoutes.mockClear()
    clearThingsVisHomeCache.mockReset()
    routeState.fullPath = '/visualization'
    routeState.path = '/visualization'
    routeState.params = {}
    routeState.query = {}
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(({ app }) => app.unmount())
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('does not delete a project when its dashboard query fails', async () => {
    thingsVisApi.getThingsVisProjects.mockResolvedValue({
      data: {
        data: [
          {
            id: 'project-1',
            name: 'Project',
            description: '',
            updatedAt: '2026-08-28T00:00:00Z',
            _count: { dashboards: 0 }
          }
        ]
      },
      error: null
    })
    thingsVisApi.getThingsVisDashboards.mockResolvedValue(apiFailure)
    const mounted = mount(ThingsVisProjects)
    mountedApps.push(mounted)
    await vi.waitFor(() => expect(mounted.root.textContent).toContain('Project'))

    const circleButtons = mounted.root.querySelectorAll<HTMLButtonElement>('button[data-circle="true"]')
    circleButtons[1]!.click()
    findButton(mounted.root, '确认删除')!.click()

    await vi.waitFor(() => expect(thingsVisApi.getThingsVisDashboards).toHaveBeenCalledOnce())
    expect(thingsVisApi.deleteThingsVisProject).not.toHaveBeenCalled()
    expect(menuApi.deleteDashboardMenuConfig).not.toHaveBeenCalled()
    expect(message.error).toHaveBeenCalledWith('删除失败：无法确认项目下的仪表盘')
  })

  it('does not delete a project or menus when the authoritative query still finds a dashboard', async () => {
    thingsVisApi.getThingsVisProjects.mockResolvedValue({
      data: {
        data: [
          {
            id: 'project-1',
            name: 'Project',
            description: '',
            updatedAt: '2026-08-28T00:00:00Z',
            _count: { dashboards: 0 }
          }
        ]
      },
      error: null
    })
    thingsVisApi.getThingsVisDashboards.mockResolvedValue({
      data: { data: [{ id: 'dashboard-1', name: 'Dashboard' }] },
      error: null
    })
    const mounted = mount(ThingsVisProjects)
    mountedApps.push(mounted)
    await vi.waitFor(() => expect(mounted.root.textContent).toContain('Project'))

    mounted.root.querySelectorAll<HTMLButtonElement>('button[data-circle="true"]')[1]!.click()
    findButton(mounted.root, '确认删除')!.click()

    await vi.waitFor(() => expect(thingsVisApi.getThingsVisDashboards).toHaveBeenCalledOnce())
    expect(thingsVisApi.deleteThingsVisProject).not.toHaveBeenCalled()
    expect(menuApi.deleteDashboardMenuConfig).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledWith('该项目下仍有仪表盘，无法删除。请先删除所有仪表盘。')
  })

  it('does not save or report success when the required home dashboard query fails', async () => {
    routeState.query = { projectId: 'project-1' }
    thingsVisApi.getThingsVisProject.mockResolvedValue({ data: { id: 'project-1', name: 'Project' }, error: null })
    thingsVisApi.getThingsVisDashboards.mockResolvedValue({
      data: {
        data: [
          {
            id: 'dashboard-1',
            name: 'Dashboard',
            thumbnail: null,
            version: 1,
            isPublished: false,
            homeFlag: false,
            updatedAt: '2026-08-28T00:00:00Z'
          }
        ]
      },
      error: null
    })
    thingsVisApi.getThingsVisDashboardThumbnail.mockResolvedValue({ data: { thumbnail: null }, error: null })
    thingsVisApi.getThingsVisHomeDashboard.mockResolvedValue(apiFailure)
    menuApi.fetchDashboardMenuConfig.mockResolvedValue({ data: null, error: null })
    const mounted = mount(ThingsVisDashboards)
    mountedApps.push(mounted)
    await vi.waitFor(() => expect(findNestedButton(mounted.root, '设为系统菜单')).toBeDefined())

    findNestedButton(mounted.root, '设为系统菜单')!.click()
    mounted.root.querySelector<HTMLButtonElement>('.switch')!.click()
    await flushUI()
    findButton(mounted.root, '保存菜单')!.click()

    await vi.waitFor(() => expect(thingsVisApi.getThingsVisHomeDashboard).toHaveBeenCalledOnce())
    expect(menuApi.saveDashboardMenuConfig).not.toHaveBeenCalled()
    expect(message.success).not.toHaveBeenCalledWith('菜单配置已保存')
    expect(message.error).toHaveBeenCalledWith('菜单配置保存失败: service unavailable')
  })

  it('polls a pending durable delete job until delivery before refreshing the menu and dashboard', async () => {
    vi.useFakeTimers()
    routeState.query = { projectId: 'project-1' }
    const dashboard = {
      id: 'dashboard-1',
      name: 'Dashboard',
      thumbnail: null,
      version: 1,
      isPublished: false,
      homeFlag: false,
      updatedAt: '2026-08-28T00:00:00Z'
    }
    const menuConfig = {
      dashboard_id: 'dashboard-1',
      menu_name: 'Operations',
      sort: 3,
      enabled: true,
      parent_code: 'home'
    }
    thingsVisApi.getThingsVisProject.mockResolvedValue({ data: { id: 'project-1', name: 'Project' }, error: null })
    thingsVisApi.getThingsVisDashboards.mockResolvedValue({ data: { data: [dashboard] }, error: null })
    thingsVisApi.getThingsVisDashboardThumbnail.mockResolvedValue({ data: { thumbnail: null }, error: null })
    menuApi.fetchDashboardMenuConfig.mockResolvedValue({ data: menuConfig, error: null })
    menuApi.requestDashboardDeletion.mockResolvedValue({
      data: { operation_id: 'operation-1', dashboard_id: 'dashboard-1', status: 'pending', attempts: 1 },
      error: null
    })
    menuApi.fetchDashboardDeletion
      .mockResolvedValueOnce({
        data: { operation_id: 'operation-1', dashboard_id: 'dashboard-1', status: 'pending', attempts: 1 },
        error: null
      })
      .mockResolvedValueOnce({
        data: { operation_id: 'operation-1', dashboard_id: 'dashboard-1', status: 'delivered', attempts: 2 },
        error: null
      })
    const mounted = mount(ThingsVisDashboards)
    mountedApps.push(mounted)
    await vi.waitFor(() => expect(mounted.root.textContent).toContain('Dashboard'))

    mounted.root.querySelectorAll<HTMLButtonElement>('button[type="error"]')[0]!.click()
    findButton(mounted.root, '确认删除')!.click()

    await vi.waitFor(() => expect(menuApi.requestDashboardDeletion).toHaveBeenCalledWith('dashboard-1'))
    expect(menuApi.deleteDashboardMenuConfig).not.toHaveBeenCalled()
    expect(menuApi.saveDashboardMenuConfig).not.toHaveBeenCalled()
    expect(refreshAuthRoutes).not.toHaveBeenCalled()
    expect(clearThingsVisHomeCache).not.toHaveBeenCalled()
    await flushUI()
    expect(mounted.root.textContent).toContain('Dashboard')
    expect(mounted.root.textContent).toContain('删除中')
    expect(message.warning).toHaveBeenCalledWith('删除任务已提交，关联菜单将在仪表盘确认删除后自动清理')

    await vi.advanceTimersByTimeAsync(2000)
    await flushUI()

    expect(menuApi.fetchDashboardDeletion).toHaveBeenCalledTimes(2)
    expect(refreshAuthRoutes).toHaveBeenCalledWith('/visualization')
    expect(clearThingsVisHomeCache).toHaveBeenCalledOnce()
    expect(message.success).toHaveBeenCalledWith('仪表盘已删除')
  })

  it('refreshes menus and dashboards only after durable deletion is delivered', async () => {
    routeState.query = { projectId: 'project-1' }
    const dashboard = {
      id: 'dashboard-1',
      name: 'Dashboard',
      thumbnail: null,
      version: 1,
      isPublished: false,
      homeFlag: false,
      updatedAt: '2026-08-28T00:00:00Z'
    }
    thingsVisApi.getThingsVisProject.mockResolvedValue({ data: { id: 'project-1', name: 'Project' }, error: null })
    thingsVisApi.getThingsVisDashboards
      .mockResolvedValueOnce({ data: { data: [dashboard] }, error: null })
      .mockResolvedValueOnce({ data: { data: [] }, error: null })
    thingsVisApi.getThingsVisDashboardThumbnail.mockResolvedValue({ data: { thumbnail: null }, error: null })
    menuApi.fetchDashboardMenuConfig.mockResolvedValue({ data: null, error: null })
    menuApi.requestDashboardDeletion.mockResolvedValue({
      data: { operation_id: 'operation-1', dashboard_id: 'dashboard-1', status: 'delivered', attempts: 1 },
      error: null
    })
    const mounted = mount(ThingsVisDashboards)
    mountedApps.push(mounted)
    await vi.waitFor(() => expect(mounted.root.textContent).toContain('Dashboard'))

    mounted.root.querySelectorAll<HTMLButtonElement>('button[type="error"]')[0]!.click()
    findButton(mounted.root, '确认删除')!.click()

    await vi.waitFor(() => expect(menuApi.requestDashboardDeletion).toHaveBeenCalledWith('dashboard-1'))
    expect(menuApi.deleteDashboardMenuConfig).not.toHaveBeenCalled()
    expect(menuApi.saveDashboardMenuConfig).not.toHaveBeenCalled()
    expect(refreshAuthRoutes).toHaveBeenCalledWith('/visualization')
    await vi.waitFor(() => expect(clearThingsVisHomeCache).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mounted.root.textContent).not.toContain('Dashboard'))
    expect(message.success).toHaveBeenCalledWith('仪表盘已删除')
  })

  it('keeps the dashboard and menu untouched when the durable delete request fails', async () => {
    routeState.query = { projectId: 'project-1' }
    const dashboard = {
      id: 'dashboard-1',
      name: 'Dashboard',
      thumbnail: null,
      version: 1,
      isPublished: false,
      homeFlag: false,
      updatedAt: '2026-08-28T00:00:00Z'
    }
    thingsVisApi.getThingsVisProject.mockResolvedValue({ data: { id: 'project-1', name: 'Project' }, error: null })
    thingsVisApi.getThingsVisDashboards.mockResolvedValue({ data: { data: [dashboard] }, error: null })
    thingsVisApi.getThingsVisDashboardThumbnail.mockResolvedValue({ data: { thumbnail: null }, error: null })
    menuApi.fetchDashboardMenuConfig.mockResolvedValue({ data: null, error: null })
    menuApi.requestDashboardDeletion.mockResolvedValue(apiFailure)
    const mounted = mount(ThingsVisDashboards)
    mountedApps.push(mounted)
    await vi.waitFor(() => expect(mounted.root.textContent).toContain('Dashboard'))

    mounted.root.querySelectorAll<HTMLButtonElement>('button[type="error"]')[0]!.click()
    findButton(mounted.root, '确认删除')!.click()

    await vi.waitFor(() => expect(menuApi.requestDashboardDeletion).toHaveBeenCalledWith('dashboard-1'))
    expect(menuApi.deleteDashboardMenuConfig).not.toHaveBeenCalled()
    expect(menuApi.saveDashboardMenuConfig).not.toHaveBeenCalled()
    expect(refreshAuthRoutes).not.toHaveBeenCalled()
    expect(clearThingsVisHomeCache).not.toHaveBeenCalled()
    expect(mounted.root.textContent).toContain('Dashboard')
    expect(message.error).toHaveBeenCalledWith('删除任务提交失败：service unavailable')
  })

  it('keeps the editor closed on failure and retries with a real schema', async () => {
    routeState.query = { id: 'dashboard-1', projectId: 'project-1' }
    thingsVisApi.getThingsVisDashboard.mockResolvedValueOnce(apiFailure).mockResolvedValueOnce({
      data: { id: 'dashboard-1', projectId: 'project-1', name: 'Recovered dashboard' },
      error: null
    })
    const mounted = mount(ThingsVisEditor)
    mountedApps.push(mounted)

    await vi.waitFor(() => expect(findButton(mounted.root, '重试')).toBeDefined())
    expect(mounted.root.querySelector('.thingsvis-app-frame')).toBeNull()

    findButton(mounted.root, '重试')!.click()
    await vi.waitFor(() =>
      expect(mounted.root.querySelector('.thingsvis-app-frame')?.textContent).toBe('Recovered dashboard')
    )
    expect(thingsVisApi.getThingsVisDashboard).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['preview', ThingsVisPreview, { query: { id: 'dashboard-1' }, params: {}, path: '/tv-preview' }],
    [
      'menu dashboard',
      ThingsVisMenuDashboard,
      {
        query: {},
        params: { dashboardId: 'dashboard-1' },
        path: '/home/dashboard/dashboard-1'
      }
    ]
  ])('keeps the %s frame closed on failure and retries explicitly', async (_name, component, route) => {
    routeState.query = route.query
    routeState.params = route.params
    routeState.path = route.path
    thingsVisApi.getThingsVisDashboard.mockResolvedValueOnce(apiFailure).mockResolvedValueOnce({
      data: { id: 'dashboard-1', projectId: 'project-1', name: 'Recovered dashboard' },
      error: null
    })
    const mounted = mount(component as Component)
    mountedApps.push(mounted)

    await vi.waitFor(() => expect(findButton(mounted.root, '重试')).toBeDefined())
    expect(mounted.root.querySelector('.thingsvis-app-frame')).toBeNull()

    findButton(mounted.root, '重试')!.click()
    await vi.waitFor(() =>
      expect(mounted.root.querySelector('.thingsvis-app-frame')?.textContent).toBe('Recovered dashboard')
    )
    expect(thingsVisApi.getThingsVisDashboard).toHaveBeenCalledTimes(2)
  })
})
