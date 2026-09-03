export type AppRoute =
  | { page: 'home' }
  | { page: 'svg-home' }
  | { page: 'svg-editor'; projectId: string }
  | { page: 'paint-home' }
  | { page: 'paint-playground'; brushId?: string }
  | { page: 'paint-editor'; projectId: string }
  | { page: 'cel-home' }
  | { page: 'cel-editor'; projectId: string }
  | { page: 'tappilot' }

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '')
  if (!path) return { page: 'home' }

  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'tappilot') return { page: 'tappilot' }
  if (parts[0] !== 'svg' && parts[0] !== 'paint' && parts[0] !== 'cel') {
    return { page: 'home' }
  }
  const tool = parts[0]
  if (parts.length === 1) {
    if (tool === 'paint') return { page: 'paint-home' }
    if (tool === 'cel') return { page: 'cel-home' }
    return { page: 'svg-home' }
  }

  if (tool === 'paint' && parts[1] === 'playground') {
    const brushId = parts[2]?.trim()
    return brushId
      ? { page: 'paint-playground', brushId: decodeURIComponent(brushId) }
      : { page: 'paint-playground' }
  }

  const projectId = parts[1]?.trim()
  if (!projectId) {
    if (tool === 'paint') return { page: 'paint-home' }
    if (tool === 'cel') return { page: 'cel-home' }
    return { page: 'svg-home' }
  }
  if (tool === 'paint') return { page: 'paint-editor', projectId }
  if (tool === 'cel') return { page: 'cel-editor', projectId }
  return { page: 'svg-editor', projectId }
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
  if (route.page === 'cel-home') return '#/cel'
  if (route.page === 'cel-editor') {
    return `#/cel/${encodeURIComponent(route.projectId)}`
  }
  if (route.page === 'tappilot') return '#/tappilot'
  return `#/paint/${encodeURIComponent(route.projectId)}`
}

export function toolHomeRoute(toolRoute: string): AppRoute | undefined {
  if (toolRoute === '/svg') return { page: 'svg-home' }
  if (toolRoute === '/paint') return { page: 'paint-home' }
  if (toolRoute === '/cel') return { page: 'cel-home' }
  if (toolRoute === '/tappilot') return { page: 'tappilot' }
  return undefined
}

export function projectRoute(
  toolRoute: string,
  projectId: string,
): AppRoute | undefined {
  if (toolRoute === '/svg') return { page: 'svg-editor', projectId }
  if (toolRoute === '/paint') return { page: 'paint-editor', projectId }
  if (toolRoute === '/cel') return { page: 'cel-editor', projectId }
  return undefined
}

export function navigate(route: AppRoute): void {
  const next = toHash(route)
  if (window.location.hash === next) return
  window.location.hash = next
}
