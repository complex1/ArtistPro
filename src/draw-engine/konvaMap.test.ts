import { describe, expect, it } from 'vitest'
import {
  affineFromPose,
  flattenPoints,
  pairsToPoints,
  poseFromBounds,
  snapPose,
} from './konvaMap'

describe('konva pose mapping', () => {
  it('maps a centered Konva pose back to an engine affine', () => {
    const bounds = { x: 10, y: 20, width: 40, height: 20 }
    const pose = { ...poseFromBounds(bounds), x: 40, y: 40, scaleX: 1.5, rotation: 90 }
    const affine = affineFromPose(pose, bounds)
    expect(affine.tx).toBeCloseTo(10)
    expect(affine.ty).toBeCloseTo(10)
    expect(affine.scaleX).toBe(1.5)
    expect(affine.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('snaps to the stage center and flattens lasso points', () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 }
    const snapped = snapPose(
      { x: 152, y: 99, scaleX: 1, scaleY: 1, rotation: 0 },
      bounds,
      { width: 300, height: 200 },
      8,
    )
    expect(snapped.pose.x).toBe(150)
    expect(snapped.guides.x).toBe(150)
    expect(flattenPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([1, 2, 3, 4])
    expect(pairsToPoints([1, 2, 3, 4])).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ])
  })
})
