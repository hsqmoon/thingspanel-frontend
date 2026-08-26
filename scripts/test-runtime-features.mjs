import assert from 'node:assert/strict'
import { initRuntimeFeatures, isThingsVisEnabled } from '../src/config/runtime-features.ts'

globalThis.fetch = async () => ({ ok: true, json: async () => ({ thingsvis: true }) })
await initRuntimeFeatures()
assert.equal(isThingsVisEnabled(), true, 'explicit visualization profile must enable ThingsVis')

globalThis.fetch = async () => {
  throw new Error('offline')
}
await initRuntimeFeatures()
assert.equal(isThingsVisEnabled(), false, 'missing runtime config must fail closed')

console.log('Runtime feature tests passed')
