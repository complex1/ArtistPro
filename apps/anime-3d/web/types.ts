export type Vec3 = [number, number, number]

export type JointName =
  | 'hips' | 'spine' | 'head'
  | 'leftUpperArm' | 'leftForearm' | 'leftHand'
  | 'rightUpperArm' | 'rightForearm' | 'rightHand'
  | 'leftThigh' | 'leftShin' | 'leftFoot'
  | 'rightThigh' | 'rightShin' | 'rightFoot'

/** Local joint rotations in degrees. Every pose is a complete rig snapshot. */
export type Pose = Record<JointName, Vec3>

export interface ShotCamera {
  position: Vec3
  target: Vec3
  fov: number
}

export interface Stroke {
  id: string
  points: Vec3[]
  color: string
  width: number
}

export interface PoseKey {
  frame: number
  pose: Pose
}

export interface AnimeDocument {
  version: 1
  name: string
  fps: 24
  duration: 24
  character: { position: Vec3; rotation: number; visible: boolean; locked: boolean }
  keys: PoseKey[]
  strokes: Stroke[]
  camera: ShotCamera
  appearance: {
    background: string
    characterColor: string
    celShading: boolean
    outlines: boolean
    ground: boolean
    lightAzimuth: number
  }
  output: { width: 1280; height: 720; transparent: boolean }
}

export interface ProjectRecord {
  id: string
  createdAt: number
  updatedAt: number
  document: AnimeDocument
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
}
