import type { CharacterDocument, Layer, Matrix, Vec2 } from './model'
import { deformLayerVertices, getLayerWorldTransform } from './engine'

const imageCache = new Map<string, HTMLImageElement>()
const pendingImages = new Map<string, Promise<void>>()
const imageTextureIds = new WeakMap<HTMLImageElement, number>()
let nextImageTextureId = 1
type ArtworkTexture = {
  canvas: HTMLCanvasElement
  left: number
  top: number
  width: number
  height: number
}
const textureCache = new Map<string, ArtworkTexture>()
let texturePixels = 0

/** Call once after adding/restoring assets, before rendering or exporting. */
export async function prepareAssets(doc: CharacterDocument): Promise<void> {
  await Promise.all(
    doc.layers
      .filter((layer) => layer.kind === 'image' && layer.src)
      .map((layer) => {
        const src = layer.src!
        if (imageCache.has(src)) return Promise.resolve()
        const pending = pendingImages.get(src)
        if (pending) return pending
        const promise = new Promise<void>((resolve, reject) => {
          if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(src)) {
            reject(
              new Error(
                `“${layer.name}” contains an unsupported image source. Reimport the artwork.`,
              ),
            )
            return
          }
          const image = new Image()
          image.onload = () => {
            imageTextureIds.set(image, nextImageTextureId++)
            imageCache.set(src, image)
            resolve()
          }
          image.onerror = () =>
            reject(
              new Error(`Could not decode the artwork in “${layer.name}”.`),
            )
          image.src = src
        }).finally(() => pendingImages.delete(src))
        pendingImages.set(src, promise)
        return promise
      }),
  )
}

function hasVisibleParents(doc: CharacterDocument, layer: Layer): boolean {
  const visited = new Set<string>()
  let current: Layer | undefined = layer
  while (current) {
    if (!current.visible || visited.has(current.id)) return false
    visited.add(current.id)
    current = current.parentId
      ? doc.layers.find((item) => item.id === current!.parentId)
      : undefined
  }
  return true
}

function paintArtwork(ctx: CanvasRenderingContext2D, layer: Layer): void {
  const { width, height } = layer
  if (layer.kind === 'image') {
    const image = layer.src ? imageCache.get(layer.src) : undefined
    if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height)
    return
  }
  ctx.fillStyle = layer.fill
  ctx.strokeStyle = layer.stroke
  ctx.lineWidth = layer.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const inset = Math.min(layer.strokeWidth / 2, width / 2, height / 2)
  if (layer.kind === 'ellipse') {
    ctx.ellipse(
      0,
      0,
      Math.max(0.01, width / 2 - inset),
      Math.max(0.01, height / 2 - inset),
      0,
      0,
      Math.PI * 2,
    )
  } else if (layer.kind === 'rectangle') {
    ctx.rect(
      -width / 2 + inset,
      -height / 2 + inset,
      width - inset * 2,
      height - inset * 2,
    )
  } else if (layer.path?.length) {
    ctx.moveTo(layer.path[0].x, layer.path[0].y)
    for (const point of layer.path.slice(1)) ctx.lineTo(point.x, point.y)
    if (layer.fill !== 'none' && layer.fill !== 'transparent') ctx.closePath()
  }
  if (layer.fill !== 'none' && layer.fill !== 'transparent') ctx.fill()
  if (
    layer.strokeWidth > 0 &&
    layer.stroke !== 'none' &&
    layer.stroke !== 'transparent'
  )
    ctx.stroke()
}

function artworkBounds(layer: Layer): {
  left: number
  top: number
  width: number
  height: number
} {
  if (layer.kind === 'path' && layer.path?.length) {
    const xs = layer.path.map((point) => point.x),
      ys = layer.path.map((point) => point.y)
    const left = Math.min(...xs) - layer.strokeWidth / 2
    const top = Math.min(...ys) - layer.strokeWidth / 2
    return {
      left,
      top,
      width: Math.max(1, Math.max(...xs) - left + layer.strokeWidth / 2),
      height: Math.max(1, Math.max(...ys) - top + layer.strokeWidth / 2),
    }
  }
  return {
    left: -layer.width / 2,
    top: -layer.height / 2,
    width: layer.width,
    height: layer.height,
  }
}

function getTexture(layer: Layer): ArtworkTexture {
  const image = layer.src ? imageCache.get(layer.src) : undefined
  // Avoid serializing a multi-megabyte data URL on every animation frame.
  const imageId = image ? imageTextureIds.get(image) : 0
  const key = JSON.stringify([
    layer.kind,
    layer.width,
    layer.height,
    layer.fill,
    layer.stroke,
    layer.strokeWidth,
    layer.path,
    imageId,
  ])
  const cached = textureCache.get(key)
  if (cached) return cached
  const bounds = artworkBounds(layer)
  const canvas = document.createElement('canvas')
  const resolution = Math.min(2, 2048 / Math.max(bounds.width, bounds.height))
  canvas.width = Math.max(1, Math.ceil(bounds.width * resolution))
  canvas.height = Math.max(1, Math.ceil(bounds.height * resolution))
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('A 2D canvas is required to render character artwork.')
  ctx.scale(canvas.width / bounds.width, canvas.height / bounds.height)
  ctx.translate(-bounds.left, -bounds.top)
  paintArtwork(ctx, layer)
  const texture = { canvas, ...bounds }
  // Never cache a blank texture while an uploaded image is still decoding.
  if (layer.kind !== 'image' || (layer.src && imageCache.has(layer.src))) {
    // Bound texture memory to roughly 64 MB even when many large parts are edited.
    while (
      textureCache.size &&
      (textureCache.size >= 96 ||
        texturePixels + canvas.width * canvas.height > 16_000_000)
    ) {
      const oldestKey = textureCache.keys().next().value!
      const oldest = textureCache.get(oldestKey)!
      texturePixels -= oldest.canvas.width * oldest.canvas.height
      textureCache.delete(oldestKey)
    }
    textureCache.set(key, texture)
    texturePixels += canvas.width * canvas.height
  }
  return texture
}

/** Affine mapping from three source points to three destination points. */
export function triangleTransform(
  source: [Vec2, Vec2, Vec2],
  destination: [Vec2, Vec2, Vec2],
): Matrix | null {
  const [p, q, r] = source
  const [u, v, w] = destination
  const ax = q.x - p.x,
    ay = q.y - p.y
  const bx = r.x - p.x,
    by = r.y - p.y
  const determinant = ax * by - ay * bx
  if (Math.abs(determinant) < 1e-8) return null
  const ux = v.x - u.x,
    uy = v.y - u.y
  const vx = w.x - u.x,
    vy = w.y - u.y
  const a = (ux * by - vx * ay) / determinant
  const c = (vx * ax - ux * bx) / determinant
  const b = (uy * by - vy * ay) / determinant
  const d = (vy * ax - uy * bx) / determinant
  return { a, b, c, d, e: u.x - a * p.x - c * p.y, f: u.y - b * p.x - d * p.y }
}

function paintMesh(
  ctx: CanvasRenderingContext2D,
  restDoc: CharacterDocument,
  posedDoc: CharacterDocument,
  layer: Layer,
): void {
  const mesh = layer.mesh!
  const restLayer = restDoc.layers.find((item) => item.id === layer.id) ?? layer
  // Setup mesh edits define texture coordinates; mesh animation and bones move
  // only the posed vertices, preserving the artwork attached to each triangle.
  const texture = getTexture(restLayer)
  const vertices = deformLayerVertices(restDoc, posedDoc, layer.id)
  const sourceVertices = restLayer.mesh?.vertices ?? mesh.vertices
  const transform = ctx.getTransform()
  const seamPadding =
    0.35 /
    Math.max(
      0.01,
      Math.hypot(transform.a, transform.b),
      Math.hypot(transform.c, transform.d),
    )
  for (const indices of mesh.triangles) {
    const local = indices.map((index) => sourceVertices[index])
    const world = indices.map((index) => vertices[index])
    if (local.some((point) => !point) || world.some((point) => !point)) continue
    const source = local.map((point) => ({
      x: ((point.x - texture.left) / texture.width) * texture.canvas.width,
      y: ((point.y - texture.top) / texture.height) * texture.canvas.height,
    })) as [Vec2, Vec2, Vec2]
    const target = world as [Vec2, Vec2, Vec2]
    const matrix = triangleTransform(source, target)
    if (!matrix || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8)
      continue
    const center = {
      x: (target[0].x + target[1].x + target[2].x) / 3,
      y: (target[0].y + target[1].y + target[2].y) / 3,
    }
    const expanded = target.map((point) => {
      const length = Math.hypot(point.x - center.x, point.y - center.y) || 1
      return {
        x: point.x + ((point.x - center.x) / length) * seamPadding,
        y: point.y + ((point.y - center.y) / length) * seamPadding,
      }
    })
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(expanded[0].x, expanded[0].y)
    ctx.lineTo(expanded[1].x, expanded[1].y)
    ctx.lineTo(expanded[2].x, expanded[2].y)
    ctx.closePath()
    ctx.clip()
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
    ctx.drawImage(texture.canvas, 0, 0)
    ctx.restore()
  }
}

/** Draws artwork only, preserving the caller's transform. Does not clear the canvas. */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  restDoc: CharacterDocument,
  posedDoc: CharacterDocument,
  options: { background?: string } = {},
): void {
  ctx.save()
  if (options.background) {
    ctx.fillStyle = options.background
    ctx.fillRect(0, 0, posedDoc.width, posedDoc.height)
  }
  for (const layer of posedDoc.layers) {
    if (!hasVisibleParents(posedDoc, layer)) continue
    if (layer.mesh?.triangles.length) {
      paintMesh(ctx, restDoc, posedDoc, layer)
    } else {
      const matrix = getLayerWorldTransform(posedDoc, layer.id)
      ctx.save()
      ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
      paintArtwork(ctx, layer)
      ctx.restore()
    }
  }
  ctx.restore()
}

function localHit(layer: Layer, point: Vec2): boolean {
  const { x, y } = point
  const bounds = artworkBounds(layer)
  if (
    x < bounds.left ||
    y < bounds.top ||
    x > bounds.left + bounds.width ||
    y > bounds.top + bounds.height
  )
    return false
  if (layer.kind === 'ellipse')
    return (x / (layer.width / 2)) ** 2 + (y / (layer.height / 2)) ** 2 <= 1
  if (layer.kind === 'path' && layer.path?.length) {
    let inside = false
    for (let i = 0, j = layer.path.length - 1; i < layer.path.length; j = i++) {
      const a = layer.path[i],
        b = layer.path[j]
      if (
        a.y > y !== b.y > y &&
        x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside
      const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) /
                lengthSquared,
            ),
          )
        : 0
      const isPaintedSegment =
        i > 0 || (layer.fill !== 'none' && layer.fill !== 'transparent')
      if (
        isPaintedSegment &&
        Math.hypot(x - a.x - t * (b.x - a.x), y - a.y - t * (b.y - a.y)) <=
          Math.max(3, layer.strokeWidth / 2)
      )
        return true
    }
    return layer.fill !== 'none' && layer.fill !== 'transparent' && inside
  }
  if (layer.kind === 'image' && layer.src && imageCache.has(layer.src)) {
    const texture = getTexture(layer).canvas
    const ctx = texture.getContext('2d')
    const pixelX = Math.min(
      texture.width - 1,
      Math.max(0, Math.floor((x / layer.width + 0.5) * texture.width)),
    )
    const pixelY = Math.min(
      texture.height - 1,
      Math.max(0, Math.floor((y / layer.height + 0.5) * texture.height)),
    )
    return !ctx || ctx.getImageData(pixelX, pixelY, 1, 1).data[3] > 10
  }
  return true
}

/** Frontmost unlocked, visible layer at a document-space point. */
export function hitTestLayer(
  restDoc: CharacterDocument,
  posedDoc: CharacterDocument,
  point: Vec2,
): string | null {
  for (const layer of [...posedDoc.layers].reverse()) {
    if (layer.locked || !hasVisibleParents(posedDoc, layer)) continue
    if (layer.mesh?.triangles.length) {
      const sourceLayer =
        restDoc.layers.find((item) => item.id === layer.id) ?? layer
      const vertices = deformLayerVertices(restDoc, posedDoc, layer.id)
      const localVertices = sourceLayer.mesh?.vertices ?? layer.mesh.vertices
      for (const indices of layer.mesh.triangles) {
        const target = indices.map((index) => vertices[index]) as [
          Vec2,
          Vec2,
          Vec2,
        ]
        const source = indices.map((index) => localVertices[index]) as [
          Vec2,
          Vec2,
          Vec2,
        ]
        if (
          target.some((vertex) => !vertex) ||
          source.some((vertex) => !vertex)
        )
          continue
        const inverse = triangleTransform(target, [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ])
        if (!inverse) continue
        const u = inverse.a * point.x + inverse.c * point.y + inverse.e
        const v = inverse.b * point.x + inverse.d * point.y + inverse.f
        if (u < -0.001 || v < -0.001 || u + v > 1.001) continue
        const local = {
          x: source[0].x * (1 - u - v) + source[1].x * u + source[2].x * v,
          y: source[0].y * (1 - u - v) + source[1].y * u + source[2].y * v,
        }
        if (localHit(sourceLayer, local)) return layer.id
      }
    } else {
      const m = getLayerWorldTransform(posedDoc, layer.id)
      const determinant = m.a * m.d - m.b * m.c
      if (Math.abs(determinant) < 1e-8) continue
      const x = point.x - m.e,
        y = point.y - m.f
      if (
        localHit(layer, {
          x: (m.d * x - m.c * y) / determinant,
          y: (m.a * y - m.b * x) / determinant,
        })
      )
        return layer.id
    }
  }
  return null
}
