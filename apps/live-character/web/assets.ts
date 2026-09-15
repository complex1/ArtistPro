import type { Layer } from './model'

const MAX_FILE_BYTES = 12 * 1024 * 1024
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'title',
  'desc',
  'style',
  'use',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'linearGradient',
  'radialGradient',
  'stop',
  'image',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
])

function checkCss(value: string): void {
  const withoutLocalReferences = value.replace(
    /url\(\s*(['"]?)#[\w.:-]+\1\s*\)/gi,
    '',
  )
  if (
    /@|\\|url\s*\(|expression\s*\(|-moz-binding|behavior\s*:/i.test(
      withoutLocalReferences,
    )
  ) {
    throw new Error(
      'SVG artwork must not load external resources or contain active CSS.',
    )
  }
}

/** Validate static SVG artwork before decoding it in an isolated image element. */
export function sanitizeSvg(source: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error(
      'SVG files with document types or entities are not supported.',
    )
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = parsed.documentElement
  if (
    !root ||
    root.localName !== 'svg' ||
    root.namespaceURI !== SVG_NAMESPACE ||
    parsed.getElementsByTagName('parsererror').length
  ) {
    throw new Error('This file is not a valid SVG image.')
  }
  for (let index = 0; index < parsed.childNodes.length; index++) {
    if (parsed.childNodes[index].nodeType === 7)
      throw new Error('SVG processing instructions are not supported.')
  }
  const elements = [root, ...Array.from(root.getElementsByTagName('*'))]
  for (const element of elements) {
    if (
      element.namespaceURI !== SVG_NAMESPACE ||
      !SVG_TAGS.has(element.localName)
    ) {
      throw new Error(
        `SVG element “${element.localName}” is not supported. Use static SVG artwork without scripts or embedded HTML.`,
      )
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase()
      const value = attribute.value.trim()
      if (/^on/i.test(name) || name === 'base')
        throw new Error(
          'SVG event handlers and external base URLs are not supported.',
        )
      if (name === 'href' || name === 'src') {
        if (
          !/^#[\w.:-]+$/.test(value) &&
          !/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(
            value,
          )
        ) {
          throw new Error(
            'SVG artwork must embed its images and use local references only.',
          )
        }
      }
      if (name !== 'xmlns' && attribute.prefix !== 'xmlns') checkCss(value)
    }
    if (element.localName === 'style') checkCss(element.textContent ?? '')
  }
  return new XMLSerializer().serializeToString(root)
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(new Error('The image file could not be read.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(
        new Error(
          'The image could not be decoded. Try exporting it as PNG or a static SVG.',
        ),
      )
    image.src = src
  })
}

/** Returns embedded artwork at (0,0), sized to fit 360 document units. */
export async function importCharacterAsset(file: File): Promise<Layer> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error('Artwork must be 12 MB or smaller.')
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
  if (
    !isSvg &&
    !/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type) &&
    !/\.(png|jpe?g|webp|gif)$/i.test(file.name)
  ) {
    throw new Error('Choose PNG, JPEG, WebP, GIF, or SVG artwork.')
  }
  let temporaryUrl: string | undefined
  try {
    let src: string
    if (isSvg) {
      const safeSvg = sanitizeSvg(await file.text())
      temporaryUrl = URL.createObjectURL(
        new Blob([safeSvg], { type: 'image/svg+xml' }),
      )
      src = temporaryUrl
    } else {
      src = await readDataUrl(file)
    }
    const image = await loadImage(src)
    const width = image.naturalWidth,
      height = image.naturalHeight
    if (
      !width ||
      !height ||
      width > 16384 ||
      height > 16384 ||
      width * height > 32_000_000
    ) {
      throw new Error(
        'Artwork dimensions are too large. Resize it below 32 megapixels and 16,384 pixels per side.',
      )
    }
    // Freeze animated imports to one reusable texture and normalize all input MIME types.
    const raster = document.createElement('canvas')
    const rasterScale = Math.min(1, 2048 / Math.max(width, height))
    raster.width = Math.max(1, Math.round(width * rasterScale))
    raster.height = Math.max(1, Math.round(height * rasterScale))
    const context = raster.getContext('2d')
    if (!context) throw new Error('A 2D canvas is required to import artwork.')
    context.drawImage(image, 0, 0, raster.width, raster.height)
    const scale = Math.min(1, 360 / Math.max(width, height))
    return {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, '') || 'Artwork',
      parentId: null,
      visible: true,
      locked: false,
      kind: 'image',
      fill: 'none',
      stroke: 'none',
      strokeWidth: 0,
      width: Math.max(1, width * scale),
      height: Math.max(1, height * scale),
      src: raster.toDataURL('image/png'),
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      mesh: null,
    }
  } finally {
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl)
  }
}
