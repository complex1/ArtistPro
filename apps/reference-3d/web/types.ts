export type Vec3 = [number, number, number]
export type ObjectKind = 'figure' | 'cube' | 'sphere' | 'cylinder' | 'chair' | 'platform' | 'imported' | 'image' | 'group'
export type WorkspaceMode = 'arrange' | 'pose' | 'camera' | 'light'
export type TransformMode = 'translate' | 'rotate' | 'scale'
export type NavigationMode = 'orbit' | 'pan' | 'zoom'
export type DisplayStyle = 'clay' | 'materials' | 'silhouette'

export interface SceneObject {
  id: string
  name: string
  kind: ObjectKind
  position: Vec3
  rotation: Vec3
  scale: Vec3
  color: string
  visible: boolean
  locked: boolean
  /** Local joint rotations in radians, relative to the imported rest pose. */
  pose: Record<string, Vec3>
  assetId?: string
  /** Local transforms are relative to this group; omitted for scene-root objects. */
  parentId?: string
}

export interface SceneAsset {
  id: string
  name: string
  /** Self-contained GLB or sanitized PNG, embedded for offline and portable projects. */
  dataUrl: string
  bones: string[]
  /** Absent for GLB assets; present for a PNG image plane. */
  image?: { width: number; height: number }
}

export interface ShotCamera {
  position: Vec3
  target: Vec3
  projection: 'perspective' | 'orthographic'
  fov: number
  /** Vertical span in world units for orthographic projection. */
  orthoSize: number
  roll: number
}

export interface SceneDocument {
  version: 1
  name: string
  width: number
  height: number
  objects: SceneObject[]
  assets: SceneAsset[]
  camera: ShotCamera
  light: { azimuth: number; elevation: number; intensity: number; ambient: number; color: string; shadows: boolean }
  floor: { visible: boolean; grid: boolean; color: string }
  background: string
  displayStyle: DisplayStyle
  transparent: boolean
  savedViews: { id: string; name: string; camera: ShotCamera }[]
  savedPoses: { id: string; name: string; pose: Record<string, Vec3>; assetId?: string }[]
}
