export type AppRoute =
  | { page: 'home' }
  | { page: 'svg-home' }
  | { page: 'svg-editor'; projectId: string }

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '')
  if (!path) return { page: 'home' }

  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'svg') return { page: 'home' }
  if (parts.length === 1) return { page: 'svg-home' }

  const projectId = parts[1]?.trim()
  if (!projectId) return { page: 'svg-home' }
  return { page: 'svg-editor', projectId }
}

export function toHash(route: AppRoute): string {
  if (route.page === 'home') return '#/'
  if (route.page === 'svg-home') return '#/svg'
  return `#/svg/${encodeURIComponent(route.projectId)}`
}

export function navigate(route: AppRoute): void {
  const next = toHash(route)
  if (window.location.hash === next) return
  window.location.hash = next
}
