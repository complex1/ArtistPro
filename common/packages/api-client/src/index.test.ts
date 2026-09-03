import { describe, expect, it } from 'vitest'
import { readApiBase } from './index'

describe('api client', () => {
  it('strips a trailing slash from the default base', () => {
    expect(readApiBase()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })
})
