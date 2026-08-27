import { expect, test } from 'vitest'
import { initializeAppChartConfigOnce } from './chart-config-initialization'

const webConfig = '{"nodes":[{"type":"media/ezuikit-player"}]}'

test('App 从未配置时使用 Web 配置初始化', () => {
  for (const emptyConfig of [null, undefined, '', '   ']) {
    const result = JSON.parse(initializeAppChartConfigOnce(emptyConfig, webConfig))
    expect(result.nodes).toEqual([{ type: 'media/ezuikit-player' }])
    expect(result.canvas).toEqual({
      mode: 'grid',
      width: 375,
      height: 844,
      gridCols: 4,
      gridRowHeight: 50,
      gridGap: 5,
      padding: 0,
      responsive: false
    })
  }
})

test('App 已有配置时不被后续 Web 保存覆盖', () => {
  const appConfig = '{"nodes":[{"type":"interaction/value-card"}]}'
  expect(initializeAppChartConfigOnce(appConfig, webConfig)).toBe(appConfig)

  const objectConfig = { nodes: [] }
  expect(initializeAppChartConfigOnce(objectConfig, webConfig)).toBe(JSON.stringify(objectConfig))
})
