import type { LayerV2 } from './types'

export type LayerEntry = { key: string; groupId?: string; layers: LayerV2[] }
export type LayerDrop = { key: string; edge: 'before' | 'after' | 'inside' }

/** Display order is topmost first; the document stores bottommost first. */
export function layerEntries(layers: LayerV2[]): LayerEntry[] {
  const entries: LayerEntry[] = []
  const groups = new Map<string, LayerEntry>()
  for (const layer of [...layers].reverse()) {
    if (!layer.groupId) entries.push({ key: layer.id, layers: [layer] })
    else {
      let entry = groups.get(layer.groupId)
      if (!entry) {
        entry = { key: `group:${layer.groupId}`, groupId: layer.groupId, layers: [] }
        groups.set(layer.groupId, entry)
        entries.push(entry)
      }
      entry.layers.push(layer)
    }
  }
  return entries
}

export function groupLayers(layers: LayerV2[], selected: ReadonlySet<string>, groupId: string): LayerV2[] {
  const display = [...layers].reverse()
  const first = display.findIndex(layer => selected.has(layer.id))
  if (first < 0 || display.filter(layer => selected.has(layer.id)).length < 2) return layers
  const members = display.filter(layer => selected.has(layer.id)).map(layer => ({ ...layer, groupId }))
  const remaining = display.filter(layer => !selected.has(layer.id))
  remaining.splice(first, 0, ...members)
  return remaining.reverse()
}

export function moveLayerEntry(layers: LayerV2[], sourceKey: string, drop: LayerDrop): LayerV2[] {
  const entries = layerEntries(layers)
  const sourceGroup = entries.find(entry => entry.groupId && entry.key === sourceKey)
  const source = sourceGroup?.layers ?? layers.filter(layer => layer.id === sourceKey)
  const targetGroup = entries.find(entry => entry.groupId && entry.key === drop.key)
  const target = targetGroup?.layers ?? layers.filter(layer => layer.id === drop.key)
  if (!source.length || !target.length || sourceKey === drop.key) return layers
  const moving = new Set(source.map(layer => layer.id))
  if (target.every(layer => moving.has(layer.id)) || (!targetGroup && target.some(layer => moving.has(layer.id)))) return layers
  // Nested folders are deliberately disallowed; folders move as complete blocks.
  if (sourceGroup && (drop.edge === 'inside' || (!targetGroup && target[0].groupId))) return layers
  if (drop.edge === 'inside' && !targetGroup) return layers
  const destinationGroup = sourceGroup ? sourceGroup.groupId
    : drop.edge === 'inside' ? targetGroup!.groupId
    : targetGroup ? undefined : target[0].groupId
  const members = source.map(layer => {
    const result = { ...layer }
    if (destinationGroup) result.groupId = destinationGroup
    else delete result.groupId
    return result
  })
  const display = entries.flatMap(entry => entry.layers).filter(layer => !moving.has(layer.id))
  const targetIds = new Set(target.map(layer => layer.id))
  const first = display.findIndex(layer => targetIds.has(layer.id))
  const last = display.findLastIndex(layer => targetIds.has(layer.id))
  display.splice(drop.edge === 'before' ? first : last + 1, 0, ...members)
  const result = display.reverse()
  return result.every((layer, i) => layer.id === layers[i].id && layer.groupId === layers[i].groupId) ? layers : result
}
