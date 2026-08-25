export type Vec2 = { x: number; y: number }

type GridBase = {
  enabled: boolean
  locked: boolean
  color: string
  opacity: number
  snap: boolean
  snapThreshold: number
}

export type GridSettings =
  | (GridBase & {
      type: 'grid'
      spacing: number
      origin: Vec2
    })
  | (GridBase & {
      type: 'orthographic'
      spacing: number
      origin: Vec2
      angles: [number, number, number]
      guideColors?: string[]
    })
  | (GridBase & {
      type: 'perspective-1'
      density: number
      horizonAngle: number
      vanishingPoints: Vec2[]
      guideColors?: string[]
    })
  | (GridBase & {
      type: 'perspective-2' | 'perspective-3'
      density: number
      vanishingPoints: Vec2[]
      guideColors?: string[]
    })
  | (GridBase & {
      type: 'fisheye'
      spacing: number
      center: Vec2
      radius: number
    })

export type PivotPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom'

export type Transform = {
  pivot: Vec2
  position: Vec2
  rotation: number
  scale: Vec2
  skew: Vec2
  opacity: number
}

export type Paint = {
  fill: string
  stroke: string
  strokeWidth: number
}

export type MotionPathBinding = {
  pathId: string
  progress: number
  autoRotate: boolean
}

type EffectBase = {
  id: string
  enabled: boolean
}

export type BlurEffect = EffectBase & {
  type: 'blur'
  radius: number
}

export type DropShadowEffect = EffectBase & {
  type: 'drop-shadow'
  offset: Vec2
  radius: number
  color: string
  opacity: number
}

export type GlowEffect = EffectBase & {
  type: 'glow'
  radius: number
  color: string
  opacity: number
}

export type LayerEffect = BlurEffect | DropShadowEffect | GlowEffect
export type EffectType = LayerEffect['type']

export type NodeBase = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  pivotPreset: PivotPreset
  effects: LayerEffect[]
  transform: Transform
  motionPath?: MotionPathBinding
}

export type RectNode = NodeBase &
  Paint & {
    type: 'rect'
    width: number
    height: number
    rx: number
    ry: number
  }

export type EllipseNode = NodeBase &
  Paint & {
    type: 'ellipse'
    rx: number
    ry: number
  }

export type HandleMode =
  | 'symmetric'
  | 'asymmetric'
  | 'disconnected'
  | 'none'

export type PathPoint = {
  id: string
  anchor: Vec2
  handleIn: Vec2
  handleOut: Vec2
  handleMode: HandleMode
}

export type PathNode = NodeBase &
  Paint & {
    type: 'path'
    closed: boolean
    points: PathPoint[]
    trimStart: number
    trimEnd: number
    trimOffset: number
  }

export type BrushSample = Vec2 & {
  pressure: number
}

export type BrushSettings = {
  size: number
  color: string
  smoothing: number
  stability: number
  pressure: number
}

export type BrushNode = NodeBase & {
  type: 'brush'
  samples: BrushSample[]
  settings: BrushSettings
  simulatePressure: boolean
  complete: boolean
}

export type PencilSettings = {
  smoothing: number
}

export type TextAlign = 'left' | 'center' | 'right'

export type TextNode = NodeBase &
  Paint & {
    type: 'text'
    text: string
    width: number
    fontFamily: string
    fontSize: number
    fontWeight: number
    letterSpacing: number
    textAlign: TextAlign
  }

export type ImageAdjustments = {
  brightness: number
  contrast: number
  saturation: number
  chroma: {
    enabled: boolean
    color: string
    tolerance: number
    feather: number
  }
}

export type ImageNode = NodeBase & {
  type: 'image'
  source: string
  processedSource?: string
  processedKey?: string
  naturalWidth: number
  naturalHeight: number
  width: number
  height: number
  crop: {
    x: number
    y: number
    width: number
    height: number
  }
  adjustments: ImageAdjustments
}

export type GroupNode = NodeBase & {
  type: 'group'
  children: EditorNode[]
}

export type EditorNode =
  | RectNode
  | EllipseNode
  | PathNode
  | BrushNode
  | TextNode
  | ImageNode
  | GroupNode
export type ShapeType = 'rect' | 'ellipse'

export type AnimatableProperty =
  | 'position.x'
  | 'position.y'
  | 'rotation'
  | 'scale.x'
  | 'scale.y'
  | 'skew.x'
  | 'skew.y'
  | 'opacity'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'path.trimStart'
  | 'path.trimEnd'
  | 'path.trimOffset'
  | 'width'
  | 'height'
  | 'rx'
  | 'ry'
  | 'fontSize'
  | 'letterSpacing'
  | 'fontWeight'
  | 'brush.size'
  | 'brush.color'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'chroma.color'
  | 'chroma.tolerance'
  | 'chroma.feather'
  | 'crop.x'
  | 'crop.y'
  | 'crop.width'
  | 'crop.height'
  | 'path.points'
  | 'motionPath.progress'
  | `effect.${string}.radius`
  | `effect.${string}.opacity`
  | `effect.${string}.color`
  | `effect.${string}.offset.x`
  | `effect.${string}.offset.y`

export type KeyframeEase = 'linear' | 'power2.inOut'

export type KeyframeValue = number | string | PathPoint[]

export type Keyframe = {
  id: string
  time: number
  value: KeyframeValue
  easing: KeyframeEase
}

export type AnimationTrack = {
  nodeId: string
  property: AnimatableProperty
  keys: Keyframe[]
}

export type DocumentAnimation = {
  duration: number
  tracks: AnimationTrack[]
}

export type EditorDocument = {
  version: 1
  name: string
  artboard: {
    width: number
    height: number
    background: string
    grid: GridSettings
  }
  children: EditorNode[]
  animation: DocumentAnimation
}

export type EditorMode = 'draw' | 'animate' | 'preview' | 'export'
export type Tool =
  | 'select'
  | 'node'
  | 'pan'
  | 'rect'
  | 'ellipse'
  | 'pen'
  | 'brush'
  | 'pencil'
  | 'text'
  | 'image'
