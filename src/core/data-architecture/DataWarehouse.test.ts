import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dataWarehouse,
  EnhancedDataWarehouse,
  type DynamicParameterStorage
} from '@/core/data-architecture/DataWarehouse'

describe('EnhancedDataWarehouse', () => {
  let warehouse: EnhancedDataWarehouse

  beforeEach(() => {
    warehouse = new EnhancedDataWarehouse({
      defaultCacheExpiry: 100,
      cleanupInterval: 60_000,
      enablePerformanceMonitoring: false
    })
  })

  afterEach(() => {
    warehouse.destroy()
    vi.useRealTimers()
  })

  it('stores isolated data sources and returns their merged view', () => {
    warehouse.storeComponentData('component-1', 'sensor', { temperature: 25 }, 'json')
    warehouse.storeComponentData('component-1', 'status', { online: true }, 'http')

    expect(warehouse.getComponentData('component-1')).toEqual({
      sensor: { temperature: 25 },
      status: { online: true }
    })
    expect(warehouse.getDataSourceData('component-1', 'sensor')).toEqual({ temperature: 25 })
    expect(warehouse.getComponentData('unknown')).toBeNull()
  })

  it('expires component and dynamic-parameter data', () => {
    vi.useFakeTimers()
    const parameter: DynamicParameterStorage = {
      name: 'deviceId',
      value: 'device-1',
      type: 'string',
      scope: 'component',
      expiresAt: Date.now() + 100
    }

    warehouse.storeComponentData('component-1', 'sensor', { value: 1 }, 'json', 100)
    warehouse.storeDynamicParameter('component-1.deviceId', parameter)
    vi.advanceTimersByTime(101)

    expect(warehouse.getComponentData('component-1')).toBeNull()
    expect(warehouse.getDynamicParameter('component-1.deviceId')).toBeNull()
  })

  it('clears a data source, a component, and the complete cache independently', () => {
    warehouse.storeComponentData('component-1', 'source-1', { value: 1 }, 'json')
    warehouse.storeComponentData('component-1', 'source-2', { value: 2 }, 'json')
    warehouse.storeComponentData('component-2', 'source-1', { value: 3 }, 'json')

    warehouse.clearDataSourceCache('component-1', 'source-1')
    expect(warehouse.getComponentData('component-1')).toEqual({ 'source-2': { value: 2 } })

    warehouse.clearComponentCache('component-1')
    expect(warehouse.getComponentData('component-1')).toBeNull()
    expect(warehouse.getComponentData('component-2')).toEqual({ 'source-1': { value: 3 } })

    warehouse.clearAllCache()
    expect(warehouse.getStorageStats().totalComponents).toBe(0)
  })

  it('reports current storage and performance metrics', () => {
    warehouse.storeComponentData('component-1', 'source-1', { value: 'payload' }, 'json')
    warehouse.getComponentData('component-1')

    expect(warehouse.getStorageStats()).toMatchObject({
      totalComponents: 1,
      totalDataSources: 1
    })
    expect(warehouse.getStorageStats().memoryUsageMB).toBeGreaterThan(0)
    expect(warehouse.getPerformanceMetrics()).toMatchObject({
      componentCount: 1,
      itemCount: 2
    })
    expect(warehouse.getPerformanceMetrics().cacheHitRate).toBeGreaterThanOrEqual(0)
    expect(warehouse.getPerformanceMetrics().cacheHitRate).toBeLessThanOrEqual(1)
  })

  it('enforces the configured storage item limit', () => {
    const limitedWarehouse = new EnhancedDataWarehouse({
      maxStorageItems: 1,
      cleanupInterval: 60_000,
      enablePerformanceMonitoring: false
    })

    try {
      limitedWarehouse.storeComponentData('component-1', 'source-1', { value: 1 }, 'json')
      limitedWarehouse.storeComponentData('component-1', 'source-2', { value: 2 }, 'json')

      expect(limitedWarehouse.getStorageStats().totalDataSources).toBe(1)
    } finally {
      limitedWarehouse.destroy()
    }
  })
})

describe('global data warehouse', () => {
  afterEach(() => dataWarehouse.clearAllCache())

  it('is isolated from separately constructed warehouses', () => {
    const separateWarehouse = new EnhancedDataWarehouse({ enablePerformanceMonitoring: false })

    try {
      dataWarehouse.storeComponentData('component-1', 'source-1', { global: true }, 'json')
      separateWarehouse.storeComponentData('component-1', 'source-1', { global: false }, 'json')

      expect(dataWarehouse.getComponentData('component-1')).toEqual({ 'source-1': { global: true } })
      expect(separateWarehouse.getComponentData('component-1')).toEqual({ 'source-1': { global: false } })
    } finally {
      separateWarehouse.destroy()
    }
  })
})
