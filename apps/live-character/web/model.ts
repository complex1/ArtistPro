export interface Vec2 {
  x: number
  y: number
}

export interface Transform {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
}

export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface Mesh {
  vertices: Vec2[]
  triangles: [number, number, number][]
  weights: Record<string, number>[]
}

export type LayerKind = 'ellipse' | 'rectangle' | 'path' | 'image'

export interface Layer {
  id: string
  name: string
  parentId: string | null
  visible: boolean
  locked: boolean
  kind: LayerKind
  fill: string
  stroke: string
  strokeWidth: number
  width: number
  height: number
  path?: Vec2[]
  src?: string
  transform: Transform
  mesh: Mesh | null
}

export interface Bone {
  id: string
  name: string
  parentId: string | null
  /** Local offset from the parent bone's tip; world coordinates for roots. */
  x: number
  y: number
  length: number
  /** Degrees relative to the parent's direction; world degrees for roots. */
  rotation: number
}

export interface Controller {
  id: string
  name: string
  boneId: string | null
  kind: 'bone' | 'ik'
  x: number
  y: number
  chainLength: 2
  bend: 1 | -1
}

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step'
export type KeyframeTarget = 'layer' | 'bone' | 'controller' | 'mesh'

interface KeyframeBase {
  id: string
  targetId: string
  frame: number
  easing: Easing
}

export interface TransformKeyframe extends KeyframeBase {
  targetType: 'layer' | 'bone' | 'controller'
  value: Transform
}

export interface MeshKeyframe extends KeyframeBase {
  targetType: 'mesh'
  /** Layer-local deformed positions; the layer mesh remains the artwork's bind mesh. */
  vertices: Vec2[]
}

export type Keyframe = TransformKeyframe | MeshKeyframe

export interface CharacterDocument {
  version: 1
  name: string
  width: number
  height: number
  fps: number
  /** The inclusive final frame. */
  duration: number
  layers: Layer[]
  bones: Bone[]
  controllers: Controller[]
  keyframes: Keyframe[]
}

export interface BoneWorldTransform {
  start: Vec2
  end: Vec2
  rotation: number
}

export { createCharacterDocument, validateDocument } from './engine'
