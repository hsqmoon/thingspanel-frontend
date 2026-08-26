export interface RuntimeFeatures {
  thingsvis: boolean
}

let runtimeFeatures: RuntimeFeatures = { thingsvis: false }

export async function initRuntimeFeatures(): Promise<void> {
  try {
    const response = await fetch('/runtime-config.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`runtime config returned ${response.status}`)
    const value = (await response.json()) as Partial<RuntimeFeatures>
    runtimeFeatures = { thingsvis: value.thingsvis === true }
  } catch {
    // Fail closed: optional services must never be contacted when the runtime
    // profile cannot be identified.
    runtimeFeatures = { thingsvis: false }
  }
}

export function isThingsVisEnabled(): boolean {
  return runtimeFeatures.thingsvis
}
