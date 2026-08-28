import { createApp, defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTable } from './table'

vi.mock('@/store/modules/app', () => ({
  useAppStore: () => ({ locale: 'zh-CN' })
}))
vi.mock('@/locales', () => ({ $t: (key: string) => key }))

const mountedApps: ReturnType<typeof createApp>[] = []

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
})

function mountTable(apiFn: (params: Record<string, unknown>) => Promise<any>) {
  let table!: ReturnType<typeof useTable<Record<string, unknown>, typeof apiFn>>
  const app = createApp(
    defineComponent({
      setup() {
        table = useTable({
          apiFn,
          immediate: false,
          transformer: response => ({
            data: response.data.records,
            pageNum: 1,
            pageSize: 10,
            total: response.data.records.length
          }),
          columns: () => []
        })
        return () => h('div')
      }
    })
  )
  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)
  mountedApps.push(app)
  return table
}

describe('useTable request failures', () => {
  it('keeps the last successful rows and always ends loading after a flat failure', async () => {
    const apiFn = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Unavailable', status: 503 }
    })
    const table = mountTable(apiFn)
    table.data.value = [{ id: 'existing' }]

    await table.getData()

    expect(table.data.value).toEqual([{ id: 'existing' }])
    expect(table.loading.value).toBe(false)
  })

  it('ends loading when an unexpected non-request exception escapes', async () => {
    const failure = new Error('Transformer dependency failed')
    const apiFn = vi.fn().mockRejectedValue(failure)
    const table = mountTable(apiFn)

    await expect(table.getData()).rejects.toBe(failure)
    expect(table.loading.value).toBe(false)
  })
})
