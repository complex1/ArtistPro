import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPose } from './model'
import { applyRigPose, createAnimeRig, disposeRig, getIKChain, readRigPose, solveTwoBoneIK } from './rig'

describe('Anime starter rig', () => {
  it('keeps local degree rotations through pose application and capture', () => {
    const rig = createAnimeRig()
    const pose = createPose()
    pose.leftUpperArm = [12, -20, 145]
    pose.leftForearm = [0, 0, 25]
    pose.head = [10, -17, 0]
    applyRigPose(rig, pose)
    const captured = readRigPose(rig)
    expect(captured.leftUpperArm).toEqual(pose.leftUpperArm)
    expect(captured.leftForearm).toEqual(pose.leftForearm)
    expect(captured.head).toEqual(pose.head)
    disposeRig(rig)
  })

  it('reaches an IK target after character translation and rotation without changing segment lengths', () => {
    const rig = createAnimeRig()
    rig.root.position.set(2, .4, -3)
    rig.root.rotation.y = .8
    applyRigPose(rig, createPose())
    const chain = getIKChain(rig, 'leftHand')!
    const start = chain.upper.getWorldPosition(new THREE.Vector3())
    const target = start.clone().add(new THREE.Vector3(.32, -.23, .11))
    solveTwoBoneIK(chain.upper, chain.middle, chain.end, target, start.clone().add(new THREE.Vector3(0, 0, 1)))
    const a = chain.upper.getWorldPosition(new THREE.Vector3())
    const b = chain.middle.getWorldPosition(new THREE.Vector3())
    const c = chain.end.getWorldPosition(new THREE.Vector3())
    expect(c.distanceTo(target)).toBeLessThan(1e-6)
    expect(a.distanceTo(b)).toBeCloseTo(.3, 6)
    expect(b.distanceTo(c)).toBeCloseTo(.27, 6)
    disposeRig(rig)
  })

  it('clamps unreachable and coincident IK targets to finite, unstretched poses', () => {
    const rig = createAnimeRig()
    const chain = getIKChain(rig, 'rightFoot')!
    const a = chain.upper.getWorldPosition(new THREE.Vector3())
    for (const target of [a.clone().add(new THREE.Vector3(50, 10, 0)), a.clone()]) {
      solveTwoBoneIK(chain.upper, chain.middle, chain.end, target, a.clone().add(new THREE.Vector3(0, 0, 1)))
      const b = chain.middle.getWorldPosition(new THREE.Vector3())
      const c = chain.end.getWorldPosition(new THREE.Vector3())
      expect(a.distanceTo(b)).toBeCloseTo(.425, 6)
      expect(b.distanceTo(c)).toBeCloseTo(.4, 6)
      expect(Object.values(readRigPose(rig)).flat().every(Number.isFinite)).toBe(true)
    }
    disposeRig(rig)
  })
})
