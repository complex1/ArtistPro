import type { DrawItem, PackedDrawList, ShadowConfig } from './types'

export const DRAW_ITEM_STRIDE = 21

function hexToRgb(color: string): number {
  const value = color.trim()
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) {
    if (value.length === 4) {
      const r = value[1]
      const g = value[2]
      const b = value[3]
      return (
        (Number.parseInt(r + r, 16) << 16) |
        (Number.parseInt(g + g, 16) << 8) |
        Number.parseInt(b + b, 16)
      )
    }
    return Number.parseInt(value.slice(1), 16)
  }
  return 0x111111
}

function rgbToHex(value: number): string {
  return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`
}

const KIND = { stamp: 0, particle: 1, segment: 2 } as const

export function packDrawList(items: DrawItem[]): PackedDrawList {
  const stride = DRAW_ITEM_STRIDE
  const buffer = new Float32Array(items.length * stride)
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const offset = index * stride
    buffer[offset] = item.x
    buffer[offset + 1] = item.y
    buffer[offset + 2] = item.size
    buffer[offset + 3] = item.rotation
    buffer[offset + 4] = item.opacity
    buffer[offset + 5] = hexToRgb(item.color)
    buffer[offset + 6] = item.stampIndex
    buffer[offset + 7] = item.blur
    buffer[offset + 8] = item.glow
    buffer[offset + 9] = item.shadow.offsetX
    buffer[offset + 10] = item.shadow.offsetY
    buffer[offset + 11] = item.shadow.blur
    buffer[offset + 12] = item.shadow.opacity
    buffer[offset + 13] = KIND[item.kind]
    buffer[offset + 14] = item.life ?? 1
    buffer[offset + 15] = item.vx ?? 0
    buffer[offset + 16] = item.vy ?? 0
    buffer[offset + 17] = hexToRgb(item.shadow.color)
    buffer[offset + 18] = item.scaleX ?? 1
    buffer[offset + 19] = item.scaleY ?? 1
    buffer[offset + 20] = item.breakBefore ? 1 : 0
  }
  return { items: buffer, count: items.length, stride }
}

export function unpackDrawList(packed: PackedDrawList): DrawItem[] {
  const items: DrawItem[] = []
  const kinds = ['stamp', 'particle', 'segment'] as const
  for (let index = 0; index < packed.count; index += 1) {
    const offset = index * packed.stride
    const data = packed.items
    const shadow: ShadowConfig = {
      offsetX: data[offset + 9],
      offsetY: data[offset + 10],
      blur: data[offset + 11],
      opacity: data[offset + 12],
      color: rgbToHex(data[offset + 17]),
    }
    items.push({
      x: data[offset],
      y: data[offset + 1],
      size: data[offset + 2],
      rotation: data[offset + 3],
      opacity: data[offset + 4],
      color: rgbToHex(data[offset + 5]),
      stampIndex: data[offset + 6],
      blur: data[offset + 7],
      glow: data[offset + 8],
      shadow,
      kind: kinds[data[offset + 13]] ?? 'stamp',
      life: data[offset + 14],
      vx: data[offset + 15],
      vy: data[offset + 16],
      scaleX: data[offset + 18] || 1,
      scaleY: data[offset + 19] || 1,
      breakBefore: packed.stride > 20 && data[offset + 20] === 1,
    })
  }
  return items
}
