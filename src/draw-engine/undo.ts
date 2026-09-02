import type { Rect } from './types'
import { TILE_SIZE } from './types'

export type TileSnapshot = {
  tx: number
  ty: number
  data: Uint8ClampedArray
}

export type UndoStep = {
  layerId: string
  tiles: TileSnapshot[]
}

export function tilesForRect(rect: Rect, width: number, height: number): { tx: number; ty: number }[] {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
  if (x1 <= x0 || y1 <= y0) return []
  const tiles: { tx: number; ty: number }[] = []
  const tx0 = Math.floor(x0 / TILE_SIZE)
  const ty0 = Math.floor(y0 / TILE_SIZE)
  const tx1 = Math.floor((x1 - 1) / TILE_SIZE)
  const ty1 = Math.floor((y1 - 1) / TILE_SIZE)
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      tiles.push({ tx, ty })
    }
  }
  return tiles
}

export function captureTiles(
  read: (rect: Rect) => Uint8ClampedArray,
  rect: Rect,
  width: number,
  height: number,
): TileSnapshot[] {
  return tilesForRect(rect, width, height).map(({ tx, ty }) => {
    const x = tx * TILE_SIZE
    const y = ty * TILE_SIZE
    const tileRect = {
      x,
      y,
      width: Math.min(TILE_SIZE, width - x),
      height: Math.min(TILE_SIZE, height - y),
    }
    return { tx, ty, data: read(tileRect) }
  })
}

export function restoreTiles(
  write: (pixels: Uint8ClampedArray, rect: Rect) => void,
  tiles: TileSnapshot[],
  width: number,
  height: number,
): void {
  for (const tile of tiles) {
    const x = tile.tx * TILE_SIZE
    const y = tile.ty * TILE_SIZE
    write(tile.data, {
      x,
      y,
      width: Math.min(TILE_SIZE, width - x),
      height: Math.min(TILE_SIZE, height - y),
    })
  }
}

export class TileHistory {
  private undoStack: UndoStep[] = []
  private redoStack: UndoStep[] = []

  push(step: UndoStep): void {
    this.undoStack.push(step)
    this.redoStack.length = 0
  }

  undo(): UndoStep | null {
    const step = this.undoStack.pop()
    if (step) this.redoStack.push(step)
    return step ?? null
  }

  redo(): UndoStep | null {
    const step = this.redoStack.pop()
    if (step) this.undoStack.push(step)
    return step ?? null
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
