import type { Component } from 'vue'
import { createApp } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  attributesApi: vi.fn(),
  commandsApi: vi.fn(),
  eventsApi: vi.fn(),
  getTemplat: vi.fn(),
  putTemplat: vi.fn(),
  telemetryApi: vi.fn()
}))

vi.mock('@/service/api', () => api)
vi.mock('@/config/runtime-features', () => ({ isThingsVisEnabled: () => true }))
vi.mock('@/components/thingsvis/ThingsVisWidget.vue', () => ({ default: { render: () => null } }))

import AppChartConfig from './app-chart-config.vue'
import WebChartConfig from './web-chart-config.vue'

const mountedApps: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

function mount(component: Component) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(component, {
    stepCurrent: 3,
    modalVisible: true,
    deviceTemplateId: 'template-1'
  })
  app.mount(root)
  mountedApps.push({ app, root })
  return root
}

describe('damaged chart configuration', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    ;[api.telemetryApi, api.attributesApi, api.eventsApi, api.commandsApi].forEach(mock => {
      mock.mockResolvedValue({ data: [], error: null })
    })
    window.$message = { error: vi.fn(), success: vi.fn() } as unknown as typeof window.$message
  })

  afterEach(() => {
    mountedApps.splice(0).forEach(({ app, root }) => {
      app.unmount()
      root.remove()
    })
    delete window.$message
  })

  it.each([
    ['App', AppChartConfig, { app_chart_config: '{broken', web_chart_config: '' }],
    ['Web', WebChartConfig, { app_chart_config: '', web_chart_config: '{broken' }]
  ])('shows an error and disables %s editor overwrite', async (label, component, template) => {
    api.getTemplat.mockResolvedValue({ data: template, error: null })
    const root = mount(component)

    await vi.waitFor(() => expect(window.$message?.error).toHaveBeenCalled())
    const editButton = Array.from(root.querySelectorAll('button')).find(button => button.textContent?.includes('配置'))

    expect(editButton?.disabled).toBe(true)
    expect(root.textContent).toContain(`${label} 图表配置已损坏`)
    expect(api.putTemplat).not.toHaveBeenCalled()
  })
})
