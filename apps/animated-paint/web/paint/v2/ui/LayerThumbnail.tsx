import { memo, useEffect, useRef } from 'react'
import { createDocumentV2 } from '../core/defaults'
import type { LayerV2 } from '../core/types'
import { renderDocumentV2, releaseRenderCache } from '../render/engine'
import { onStampAssetReady } from '../render/canvas2d'
import type { PaintSurface } from '../render/surfaces'

/** Static, visible-only thumbnails: no animation loop or full-size scratch canvas. */
export const LayerThumbnail = memo(function LayerThumbnail({ layer, width, height, rasters, masks, ready }: {
  layer: LayerV2
  width: number
  height: number
  rasters: { current: ReadonlyMap<string, PaintSurface> }
  masks: { current: ReadonlyMap<string, PaintSurface> }
  ready: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !ready) return
    let visible = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const paint = () => {
      if (!visible) return
      const preview = createDocumentV2('Layer thumbnail', width, height)
      preview.background = 'transparent'
      preview.layers = [{ ...layer, visible: true, opacity: 1, blendMode: 'source-over' }]
      const scale = Math.min(canvas.width / width, canvas.height / height)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.save()
      context.translate((canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2)
      context.scale(scale, scale)
      try {
        renderDocumentV2(context, preview, 1500, rasters.current)
        const mask = masks.current.get(layer.id)
        if (mask) { context.globalCompositeOperation = 'destination-out'; context.drawImage(mask, 0, 0) }
      } finally { context.restore(); releaseRenderCache(context) }
    }
    const schedule = () => { clearTimeout(timer); if (visible) timer = setTimeout(paint, 180) }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule() })
    observer.observe(canvas)
    const unsubscribe = onStampAssetReady(schedule)
    return () => { clearTimeout(timer); observer.disconnect(); unsubscribe(); releaseRenderCache(context) }
  }, [layer, width, height, rasters, masks, ready])
  return <canvas ref={ref} className="paint-layer-thumbnail" width={96} height={72} aria-hidden="true" />
})
