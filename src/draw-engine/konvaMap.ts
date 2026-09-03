import type { AffineTransform, Rect } from './types'

export type KonvaNodePose = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

export function boundsCenter(bounds: Rect): { x: number; y: number } {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

export function poseFromBounds(bounds: Rect): KonvaNodePose {
  const center = boundsCenter(bounds)
  return {
    x: center.x,
    y: center.y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  }
}

export function affineFromPose(pose: KonvaNodePose, bounds: Rect): AffineTransform {
  const center = boundsCenter(bounds)
  return {
    scaleX: pose.scaleX,
    scaleY: pose.scaleY,
    rotation: (pose.rotation * Math.PI) / 180,
    tx: pose.x - center.x,
    ty: pose.y - center.y,
  }
}

export function snapValue(value: number, targets: number[], threshold = 6): number {
  let best = value
  let distance = threshold
  for (const target of targets) {
    const next = Math.abs(value - target)
    if (next < distance) {
      distance = next
      best = target
    }
  }
  return best
}

export function snapPose(
  pose: KonvaNodePose,
  bounds: Rect,
  stage: { width: number; height: number },
  threshold = 6,
): { pose: KonvaNodePose; guides: { x?: number; y?: number } } {
  const halfW = (bounds.width * pose.scaleX) / 2
  const halfH = (bounds.height * pose.scaleY) / 2
  const xTargets = [halfW, stage.width / 2, stage.width - halfW]
  const yTargets = [halfH, stage.height / 2, stage.height - halfH]
  const x = snapValue(pose.x, xTargets, threshold)
  const y = snapValue(pose.y, yTargets, threshold)
  return {
    pose: { ...pose, x, y },
    guides: {
      x: x !== pose.x ? x : undefined,
      y: y !== pose.y ? y : undefined,
    },
  }
}

export function flattenPoints(points: { x: number; y: number }[]): number[] {
  const out: number[] = []
  for (const point of points) {
    out.push(point.x, point.y)
  }
  return out
}

export function pairsToPoints(values: number[]): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < values.length; i += 2) {
    points.push({ x: values[i], y: values[i + 1] })
  }
  return points
}
