import { createApp } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/list-page/index.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/dev-card-item/index.vue', () => ({ default: { render: () => null } }))
vi.mock('./modules/tencent-map.vue', () => ({ default: { render: () => null } }))
vi.mock('@/utils/common/tool', () => ({ getDemoServerUrl: () => 'https://example.test/api/v1' }))

import DataTablePage from './index.vue'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

const mountedApps: ReturnType<typeof createApp>[] = []

afterEach(() => {
  mountedApps.splice(0).forEach(app => app.unmount())
})

function mountTable(
  fetchData: (params: Record<string, unknown>) => Promise<any>,
  onDataLoaded: (rows: unknown[]) => void = () => undefined,
  pagination: { initPage?: number; initPageSize?: number } = {},
  searchConfigs: Array<Record<string, unknown>> = []
) {
  const app = createApp(DataTablePage, {
    fetchData,
    columnsToShow: [],
    searchConfigs,
    tableActions: [],
    topActions: [],
    onDataLoaded,
    ...pagination
  })
  const root = document.createElement('div')
  document.body.appendChild(root)
  const vm = app.mount(root) as any
  mountedApps.push(app)
  return vm
}

describe('DataTablePage request sequencing', () => {
  it('keeps the newest page result when an older request finishes last', async () => {
    const first = deferred<any>()
    const second = deferred<any>()
    const fetchData = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const onDataLoaded = vi.fn()
    const vm = mountTable(fetchData, onDataLoaded)

    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledOnce())
    const latestRequest = vm.handleSearch()
    await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(2))

    second.resolve({ data: { list: [{ id: 'newest' }], total: 1 }, error: null })
    await latestRequest
    await vi.waitFor(() => expect(vm.dataList).toEqual([{ id: 'newest' }]))
    expect(onDataLoaded).toHaveBeenCalledOnce()
    expect(onDataLoaded).toHaveBeenLastCalledWith([{ id: 'newest' }])

    first.resolve({ data: { list: [{ id: 'stale' }], total: 1 }, error: null })
    await first.promise
    await Promise.resolve()

    expect(vm.dataList).toEqual([{ id: 'newest' }])
    expect(onDataLoaded).toHaveBeenCalledOnce()
  })

  it('does not erase the displayed rows when a refresh fails', async () => {
    const fetchData = vi
      .fn()
      .mockResolvedValueOnce({ data: { list: [{ id: 'existing' }], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const vm = mountTable(fetchData)

    await vi.waitFor(() => expect(vm.dataList).toEqual([{ id: 'existing' }]))
    await vm.handleSearch()
    expect(fetchData).toHaveBeenCalledTimes(2)

    expect(vm.dataList).toEqual([{ id: 'existing' }])
  })

  it('clears interactive rows when a page-changing request fails', async () => {
    const fetchData = vi
      .fn()
      .mockResolvedValueOnce({ data: { list: [{ id: 'page-three' }], total: 30 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const vm = mountTable(fetchData, () => undefined, { initPage: 3, initPageSize: 10 })
    await vi.waitFor(() => expect(vm.dataList).toEqual([{ id: 'page-three' }]))

    expect(vm.currentPage).toBe(3)
    await vm.handleSearch()

    expect(vm.currentPage).toBe(1)
    expect(vm.pageSize).toBe(10)
    expect(vm.dataList).toEqual([])
  })

  it('clears interactive rows when a changed filter request fails', async () => {
    const fetchData = vi
      .fn()
      .mockResolvedValueOnce({ data: { list: [{ id: 'matching-old-filter' }], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', status: 503 } })
    const onDataLoaded = vi.fn()
    const vm = mountTable(fetchData, onDataLoaded, {}, [
      { key: 'status', label: 'Status', type: 'input', initValue: 'old' }
    ])
    await vi.waitFor(() => expect(vm.dataList).toEqual([{ id: 'matching-old-filter' }]))

    await vm.forceChangeParamsByKey({ status: 'new' })

    expect(fetchData).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'new' }))
    expect(vm.dataList).toEqual([])
    expect(onDataLoaded).toHaveBeenLastCalledWith([])
  })
})
