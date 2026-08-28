/**
 * 智能深拷贝工具
 * 专门处理Vue 3响应式对象与structuredClone的兼容性问题
 */

import { toRaw, isRef, unref, isReactive, isReadonly } from 'vue'

/**
 * 检查对象是否为Vue响应式对象
 */
const isVueReactiveObject = (obj: any): boolean => {
  return (
    isReactive(obj) ||
    isReadonly(obj) ||
    isRef(obj) ||
    (obj && typeof obj === 'object' && (obj.__v_isReactive || obj.__v_isReadonly || obj.__v_isRef))
  )
}

/**
 * 智能深度toRaw转换
 * 只对Vue响应式对象使用toRaw，避免不必要的处理
 */
const smartDeepToRaw = <T>(obj: T): T => {
  if (obj === null || obj === undefined) return obj

  // 处理基本类型
  if (typeof obj !== 'object') return obj

  // 处理ref对象
  if (isRef(obj)) {
    return smartDeepToRaw(unref(obj)) as T
  }

  // 处理响应式对象
  let raw = obj
  if (isVueReactiveObject(obj)) {
    raw = toRaw(obj)
  }

  // 处理数组
  if (Array.isArray(raw)) {
    return raw.map(smartDeepToRaw) as T
  }

  // 处理Date、RegExp等内置对象
  if (raw instanceof Date || raw instanceof RegExp || raw instanceof Error) {
    return raw
  }

  // 处理Set
  if (raw instanceof Set) {
    const newSet = new Set()
    raw.forEach(value => {
      newSet.add(smartDeepToRaw(value))
    })
    return newSet as T
  }

  // 处理Map
  if (raw instanceof Map) {
    const newMap = new Map()
    raw.forEach((value, key) => {
      newMap.set(smartDeepToRaw(key), smartDeepToRaw(value))
    })
    return newMap as T
  }

  // 处理普通对象
  if (raw.constructor === Object || raw.constructor === undefined) {
    const result: any = {}
    for (const [key, value] of Object.entries(raw)) {
      result[key] = smartDeepToRaw(value)
    }
    return result
  }

  // 其他类型保持原样
  return raw
}

function assertJsonCloneSafe(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON cloning cannot preserve non-finite numbers')
    return
  }
  if (typeof value !== 'object') throw new TypeError(`JSON cloning cannot preserve ${typeof value}`)
  if (ancestors.has(value)) throw new TypeError('JSON cloning cannot preserve circular references')
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('JSON cloning cannot preserve non-plain objects')
  }

  ancestors.add(value)
  Object.values(value).forEach(item => assertJsonCloneSafe(item, ancestors))
  ancestors.delete(value)
}

/**
 * 性能优化的深拷贝函数
 *
 * 策略：
 * 1. 优先使用高性能的 structuredClone()
 * 2. 对Vue响应式对象智能预处理
 * 3. 失败时降级到JSON方法
 * 4. 所有策略失败时显式抛错，不伪装成深拷贝成功
 */
export const smartDeepClone = <T>(
  obj: T,
  options?: {
    /** 强制使用JSON方法（用于测试） */
    forceJSON?: boolean
  }
): T => {
  const { forceJSON = false } = options || {}

  if (obj === null || obj === undefined) return obj

  try {
    // 第一步：智能预处理Vue响应式对象
    const rawObj = smartDeepToRaw(obj)

    // 第二步：尝试高性能的structuredClone
    if (!forceJSON && typeof structuredClone !== 'undefined') {
      try {
        const cloned = structuredClone(rawObj)
        return cloned
      } catch {
        // 继续到JSON方法
      }
    }

    // 第三步：降级到JSON方法
    assertJsonCloneSafe(rawObj)
    const jsonCloned = JSON.parse(JSON.stringify(rawObj))
    return jsonCloned
  } catch (error) {
    throw new Error('Deep clone failed', { cause: error })
  }
}

/**
 * 简化版深拷贝（仅用于简单对象，性能更好）
 */
export const simpleDeepClone = <T>(obj: T): T => {
  return smartDeepClone(obj)
}

/**
 * 批量深拷贝（用于数组等批量操作）
 */
export const batchDeepClone = <T>(items: T[]): T[] => {
  try {
    // 尝试批量处理
    const rawItems = items.map(smartDeepToRaw)
    return structuredClone(rawItems)
  } catch {
    // 降级到单个处理
    return items.map(item => smartDeepClone(item))
  }
}

/**
 * JSON 兼容数据的深拷贝（不支持的数据会显式抛错）
 */
export const safeDeepClone = <T>(obj: T): T => {
  return smartDeepClone(obj, { forceJSON: true })
}

// 默认导出
export default smartDeepClone
