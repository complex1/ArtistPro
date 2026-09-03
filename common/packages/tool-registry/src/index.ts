export type ToolStatus = 'ready' | 'coming-soon'

export type ToolManifest = {
  id: string
  title: string
  blurb: string
  route: string
  status: ToolStatus
  apiPrefix?: string
}

export function isToolManifest(value: unknown): value is ToolManifest {
  if (!value || typeof value !== 'object') return false
  const tool = value as Partial<ToolManifest>
  return (
    typeof tool.id === 'string' &&
    typeof tool.title === 'string' &&
    typeof tool.blurb === 'string' &&
    typeof tool.route === 'string' &&
    (tool.status === 'ready' || tool.status === 'coming-soon')
  )
}

export function parseToolManifests(values: unknown[]): ToolManifest[] {
  return values.filter(isToolManifest)
}
