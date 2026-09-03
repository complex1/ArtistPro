export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatUpdated(time: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(time)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeTime(time: number, now = Date.now()): string {
  const elapsed = now - time
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`
  return formatUpdated(time)
}

export const ARTBOARD_PRESETS = [
  { id: '800x600', width: 800, height: 600, label: '800 × 600' },
  { id: '1280x720', width: 1280, height: 720, label: '1280 × 720' },
  { id: '1080x1080', width: 1080, height: 1080, label: '1080 × 1080' },
  { id: '1920x1080', width: 1920, height: 1080, label: '1920 × 1080' },
] as const

export * from './stamp'
