import type { Transform, Vec2 } from './types'

type Matrix2 = { a: number; b: number; c: number; d: number }

const multiply = (m1: Matrix2, m2: Matrix2): Matrix2 => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
})

const radians = (degrees: number) => (degrees * Math.PI) / 180

const n = (value: number) => (Object.is(value, -0) ? 0 : value)

export function defaultTransform(): Transform {
  return {
    pivot: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    skew: { x: 0, y: 0 },
    opacity: 1,
  }
}

/** Linear part of the node transform: rotate, then scale, then skew. */
export function linearMatrix(transform: Transform): Matrix2 {
  const angle = radians(transform.rotation)
  const rotation: Matrix2 = {
    a: Math.cos(angle),
    b: Math.sin(angle),
    c: -Math.sin(angle),
    d: Math.cos(angle),
  }
  const scale: Matrix2 = { a: transform.scale.x, b: 0, c: 0, d: transform.scale.y }
  const skewX: Matrix2 = { a: 1, b: 0, c: Math.tan(radians(transform.skew.x)), d: 1 }
  const skewY: Matrix2 = { a: 1, b: Math.tan(radians(transform.skew.y)), c: 0, d: 1 }

  return multiply(multiply(multiply(rotation, scale), skewX), skewY)
}

export function transformPoint(transform: Transform, point: Vec2): Vec2 {
  const { a, b, c, d } = linearMatrix(transform)
  const local = {
    x: point.x - transform.pivot.x,
    y: point.y - transform.pivot.y,
  }

  return {
    x: transform.position.x + transform.pivot.x + a * local.x + c * local.y,
    y: transform.position.y + transform.pivot.y + b * local.x + d * local.y,
  }
}

/** Moves the pivot without shifting the artwork, the way an anchor point behaves. */
export function retargetPivot(transform: Transform, pivot: Vec2): Transform {
  const { a, b, c, d } = linearMatrix(transform)
  const delta = {
    x: transform.pivot.x - pivot.x,
    y: transform.pivot.y - pivot.y,
  }

  return {
    ...transform,
    pivot,
    position: {
      x: transform.position.x + delta.x - (a * delta.x + c * delta.y),
      y: transform.position.y + delta.y - (b * delta.x + d * delta.y),
    },
  }
}

export type Affine = {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

export function transformToAffine(transform: Transform): Affine {
  const { a, b, c, d } = linearMatrix(transform)
  const { pivot, position } = transform
  return {
    a,
    b,
    c,
    d,
    tx: position.x + pivot.x - a * pivot.x - c * pivot.y,
    ty: position.y + pivot.y - b * pivot.x - d * pivot.y,
  }
}

export function multiplyAffine(parent: Affine, child: Affine): Affine {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  }
}

export function affinePoint(matrix: Affine, point: Vec2): Vec2 {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty,
  }
}

export function affineDelta(matrix: Affine, delta: Vec2): Vec2 {
  return {
    x: matrix.a * delta.x + matrix.c * delta.y,
    y: matrix.b * delta.x + matrix.d * delta.y,
  }
}

export function identityAffine(): Affine {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
}

export function invertAffine(matrix: Affine): Affine {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) < 1e-12) return identityAffine()
  const a = matrix.d / determinant
  const b = -matrix.b / determinant
  const c = -matrix.c / determinant
  const d = matrix.a / determinant
  return {
    a,
    b,
    c,
    d,
    tx: -(a * matrix.tx + c * matrix.ty),
    ty: -(b * matrix.tx + d * matrix.ty),
  }
}

/** Expresses a delta measured in the affine's output space back in its input space. */
export function invertDelta(matrix: Affine, delta: Vec2): Vec2 {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (determinant === 0) return delta

  return {
    x: (matrix.d * delta.x - matrix.c * delta.y) / determinant,
    y: (matrix.a * delta.y - matrix.b * delta.x) / determinant,
  }
}

export function invertPoint(matrix: Affine, point: Vec2): Vec2 {
  return invertDelta(matrix, {
    x: point.x - matrix.tx,
    y: point.y - matrix.ty,
  })
}

export function rotationFromPoints(
  transform: Transform,
  start: Vec2,
  current: Vec2,
  snap = false,
): number {
  const pivot = {
    x: transform.position.x + transform.pivot.x,
    y: transform.position.y + transform.pivot.y,
  }
  const angle = (point: Vec2) =>
    (Math.atan2(point.y - pivot.y, point.x - pivot.x) * 180) / Math.PI
  const delta = ((angle(current) - angle(start) + 540) % 360) - 180
  const rotation = transform.rotation + delta
  return snap ? Math.round(rotation / 15) * 15 : rotation
}

export function bakeParentTransform(parent: Transform, child: Transform): Transform {
  const matrix = multiplyAffine(transformToAffine(parent), transformToAffine(child))
  return affineToTransform(matrix, child.pivot, parent.opacity * child.opacity)
}

export function affineToTransform(
  matrix: Affine,
  pivot: Vec2,
  opacity = 1,
): Transform {
  const { a, b, c, d, tx, ty } = matrix
  const scaleX = Math.hypot(a, b) || 1
  const rotation = (Math.atan2(b, a) * 180) / Math.PI
  const cos = a / scaleX
  const sin = b / scaleX
  const projectedSkew = cos * c + sin * d
  const skewX = (Math.atan2(projectedSkew, scaleX) * 180) / Math.PI
  const scaleY = cos * d - sin * c || 1

  return {
    pivot,
    position: {
      x: tx - pivot.x + a * pivot.x + c * pivot.y,
      y: ty - pivot.y + b * pivot.x + d * pivot.y,
    },
    rotation,
    scale: { x: scaleX, y: scaleY },
    skew: { x: skewX, y: 0 },
    opacity,
  }
}

export function composeTransform(transform: Transform): string {
  const { position, pivot, rotation, scale, skew } = transform

  return [
    `translate(${n(position.x)} ${n(position.y)})`,
    `translate(${n(pivot.x)} ${n(pivot.y)})`,
    `rotate(${n(rotation)})`,
    `scale(${n(scale.x)} ${n(scale.y)})`,
    `skewX(${n(skew.x)})`,
    `skewY(${n(skew.y)})`,
    `translate(${n(-pivot.x)} ${n(-pivot.y)})`,
  ].join(' ')
}
