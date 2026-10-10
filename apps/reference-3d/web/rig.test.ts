import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyPose, createFigure, readPose, solveTwoBoneIK } from './rig'

describe('reference figure rig', () => {
  it('keeps duplicated figures independent and round trips a relative pose', () => {
    const first = createFigure('#adcbc1')
    const second = createFigure('#adcbc1')
    const pose: Record<string, [number, number, number]> = { leftUpperArm: [-.65, .25, .18], head: [.1, -.3, .12] }
    applyPose(first, pose)
    const saved = readPose(first)
    for (const key of Object.keys(pose)) for (let index = 0; index < 3; index++) expect(saved[key][index]).toBeCloseTo(pose[key][index], 8)
    expect(second.joints.get('leftUpperArm')!.node.rotation.x).toBe(0)
    applyPose(first, {})
    expect(readPose(first).leftUpperArm).toEqual([-0, 0, -0])
  })

  it('reaches a hand target under character translation, rotation, and uniform scaling', () => {
    const figure = createFigure('#adcbc1')
    figure.root.position.set(1, .2, -2)
    figure.root.rotation.y = .7
    figure.root.scale.setScalar(1.3)
    figure.root.updateMatrixWorld(true)
    const upper = figure.joints.get('leftUpperArm')!.node
    const middle = figure.joints.get('leftForearm')!.node
    const hand = figure.joints.get('leftHand')!.node
    const start = upper.getWorldPosition(new THREE.Vector3())
    const target = start.clone().add(new THREE.Vector3(-.15, -.35, .30))
    const lengths = [middle.position.length(), hand.position.length()]
    solveTwoBoneIK(upper, middle, hand, target, start.clone().add(new THREE.Vector3(0, 0, 1)))
    expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(1e-5)
    expect(middle.position.length()).toBe(lengths[0])
    expect(hand.position.length()).toBe(lengths[1])
  })

  it('clamps unreachable targets without stretching or producing invalid rotations', () => {
    const figure = createFigure('#adcbc1')
    const upper = figure.joints.get('rightThigh')!.node
    const middle = figure.joints.get('rightShin')!.node
    const foot = figure.joints.get('rightFoot')!.node
    const start = upper.getWorldPosition(new THREE.Vector3())
    solveTwoBoneIK(upper, middle, foot, new THREE.Vector3(10, 10, 10), new THREE.Vector3(0, 0, 2))
    const end = foot.getWorldPosition(new THREE.Vector3())
    expect(start.distanceTo(end)).toBeLessThanOrEqual(.801)
    expect(Object.values(readPose(figure)).flat().every(Number.isFinite)).toBe(true)
  })
})
