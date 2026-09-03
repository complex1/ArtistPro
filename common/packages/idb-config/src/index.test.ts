import { describe, expect, it } from 'vitest'
import { deleteConfig, getConfig, setConfig } from './index'

describe('idb-config', () => {
  it('round-trips values through the memory fallback in Node', async () => {
    await setConfig('last-tool', 'svg-tool')
    expect(await getConfig<string>('last-tool')).toBe('svg-tool')
    await deleteConfig('last-tool')
    expect(await getConfig('last-tool')).toBeUndefined()
  })
})
