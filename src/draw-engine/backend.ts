import type { BlendMode, Dab, Rect, Rgba, SurfaceId } from './types'

export type LayerComposite = {
  id: SurfaceId
  visible: boolean
  opacity: number
  blendMode: BlendMode
}

export type GpuBackend = {
  kind: 'cpu' | 'webgl2'
  width: number
  height: number
  createSurface(id: SurfaceId): void
  destroySurface(id: SurfaceId): void
  clear(id: SurfaceId, color?: Rgba): void
  fillRect(id: SurfaceId, rect: Rect, color: Rgba): void
  stampDab(target: SurfaceId, dab: Dab, clip?: SurfaceId | null): Rect
  beginStroke(): void
  stampStrokeDab(dab: Dab, clip?: SurfaceId | null): Rect
  previewStroke(target: SurfaceId, color: Rgba, opacity: number, erase: boolean): Rect
  applyStrokeFromSource(
    source: SurfaceId,
    target: SurfaceId,
    color: Rgba,
    opacity: number,
    erase: boolean,
    rect: Rect,
  ): Rect
  mergeStroke(target: SurfaceId, color: Rgba, opacity: number, erase: boolean): Rect
  clearStroke(): void
  read(id: SurfaceId, rect?: Rect): Uint8ClampedArray
  write(id: SurfaceId, pixels: Uint8ClampedArray, rect?: Rect): void
  copySurface(src: SurfaceId, dst: SurfaceId): void
  warp(
    src: SurfaceId,
    dst: SurfaceId,
    sample: (x: number, y: number) => { x: number; y: number },
    clip?: SurfaceId | null,
    options?: { clear?: boolean },
  ): void
  composite(layers: LayerComposite[], background: string): Uint8ClampedArray
  present(pixels: Uint8ClampedArray): void
  resize(width: number, height: number): void
  dispose(): void
}
