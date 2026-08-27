import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/data-architecture/executors/DataItemFetcher', () => ({
  DataItemFetcher: class {
    setCurrentComponentId() {}

    async fetchData(item: { type: string; config: { jsonString?: string } }) {
      return item.type === 'json' && item.config.jsonString
        ? JSON.parse(item.config.jsonString)
        : {}
    }
  }
}))

import {
  MultiLayerExecutorChain,
  type DataSourceConfiguration
} from '@/core/data-architecture/executors/MultiLayerExecutorChain'

function createJsonConfig(): DataSourceConfiguration {
  return {
    componentId: 'test-component',
    dataSources: [
      {
        sourceId: 'profile',
        dataItems: [
          {
            item: {
              type: 'json',
              config: {
                jsonString: JSON.stringify({ user: { name: '张三', age: 25 } })
              }
            },
            processing: {
              filterPath: '$.user',
              defaultValue: {}
            }
          }
        ],
        mergeStrategy: { type: 'object' }
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

describe('MultiLayerExecutorChain', () => {
  it('executes the complete JSON processing chain', async () => {
    const result = await new MultiLayerExecutorChain().executeDataProcessingChain(createJsonConfig(), true)

    expect(result.success).toBe(true)
    expect(result.componentData?.profile.data).toEqual({ name: '张三', age: 25 })
    expect(result.componentData?.profile.metadata).toMatchObject({
      componentId: 'test-component',
      success: true
    })
    expect(result.executionState?.stages.rawData.size).toBe(1)
    expect(result.executionState?.stages.processedData.size).toBe(1)
  })

  it('validates required configuration fields', () => {
    const chain = new MultiLayerExecutorChain()

    expect(chain.validateConfiguration(createJsonConfig())).toBe(true)
    expect(chain.validateConfiguration({ ...createJsonConfig(), componentId: '' })).toBe(false)
  })

  it('reports the supported data and merge strategies', () => {
    const statistics = new MultiLayerExecutorChain().getChainStatistics()

    expect(statistics.supportedDataTypes).toEqual(['json', 'http', 'websocket', 'script'])
    expect(statistics.supportedMergeStrategies).toEqual(['object', 'array', 'script'])
  })
})
