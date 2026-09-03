import { describe, expect, it } from 'vitest'
import { clamp, formatRelativeTime, formatUpdated } from './index'

describe('utils', () => {
  it('clamps to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-03T12:00:00Z')
  const ago = (ms: number) => formatRelativeTime(now - ms, now)

  it('reads as just now under a minute', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(59_000)).toBe('just now')
  })

  it('counts whole minutes and hours', () => {
    expect(ago(60_000)).toBe('1m ago')
    expect(ago(45 * 60_000)).toBe('45m ago')
    expect(ago(2 * 3_600_000)).toBe('2h ago')
    expect(ago(23 * 3_600_000)).toBe('23h ago')
  })

  it('names the previous day, then counts days', () => {
    expect(ago(26 * 3_600_000)).toBe('yesterday')
    expect(ago(3 * 86_400_000)).toBe('3d ago')
  })

  it('falls back to an absolute date past a week', () => {
    const old = now - 30 * 86_400_000
    expect(formatRelativeTime(old, now)).toBe(formatUpdated(old))
  })

  it('treats future timestamps as just now', () => {
    expect(formatRelativeTime(now + 5_000, now)).toBe('just now')
  })
})
