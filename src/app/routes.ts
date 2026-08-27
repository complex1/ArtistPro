export type AppRoute =
  | { page: 'home' }
  | { page: 'svg-home' }
  | { page: 'svg-editor'; projectId: string }
  | { page: 'paint-home' }
  | { page: 'paint-playground'; brushId?: string }
  | { page: 'paint-editor'; projectId: string }

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '')
  if (!path) return { page: 'home' }

  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'svg' && parts[0] !== 'paint') return { page: 'home' }
  const tool = parts[0]
  if (parts.length === 1) {
    return tool === 'paint' ? { page: 'paint-home' } : { page: 'svg-home' }
  }

  if (tool === 'paint' && parts[1] === 'playground') {
    const brushId = parts[2]?.trim()
    return brushId
      ? { page: 'paint-playground', brushId: decodeURIComponent(brushId) }
      : { page: 'paint-playground' }
  }

  const projectId = parts[1]?.trim()
  if (!projectId) {
    return tool === 'paint' ? { page: 'paint-home' } : { page: 'svg-home' }
  }
  return tool === 'paint'
    ? { page: 'paint-editor', projectId }
    : { page: 'svg-editor', projectId }
}

export function toHash(route: AppRoute): string {
  if (route.page === 'home') return '#/'
  if (route.page === 'svg-home') return '#/svg'
  if (route.page === 'svg-editor') {
    return `#/svg/${encodeURIComponent(route.projectId)}`
  }
  if (route.page === 'paint-home') return '#/paint'
  if (route.page === 'paint-playground') {
    return route.brushId
      ? `#/paint/playground/${encodeURIComponent(route.brushId)}`
      : '#/paint/playground'
  }
  return `#/paint/${encodeURIComponent(route.projectId)}`
}

export function navigate(route: AppRoute): void {
  const next = toHash(route)
  if (window.location.hash === next) return
  window.location.hash = next
}
