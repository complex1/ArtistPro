import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { getFloorPosition, getVisibleBounds } from './stageGeometry'
import { createProp } from './rig'

describe('placing nested scene objects on the world floor', () => {
  it('converts vertical movement through rotated and scaled ancestors without lateral drift', () => {
    const outer = new THREE.Group()
    outer.position.set(2, 3, -1)
    outer.rotation.set(.3, .7, -.4)
    outer.scale.setScalar(1.7)
    const inner = new THREE.Group()
    inner.position.set(1, 2, 3)
    inner.rotation.set(-.2, .5, .3)
    inner.scale.setScalar(.8)
    outer.add(inner)
    const prop = createProp('cube', '#aaaaaa').root
    prop.position.set(1, 4, 2)
    prop.rotation.set(.4, .2, .1)
    inner.add(prop)
    outer.updateMatrixWorld(true)
    const before = prop.getWorldPosition(new THREE.Vector3())
    const local = getFloorPosition(prop, .005)!
    prop.position.fromArray(local)
    outer.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(prop, true)
    const after = prop.getWorldPosition(new THREE.Vector3())
    expect(bounds.min.y).toBeCloseTo(.005, 8)
    expect(after.x).toBeCloseTo(before.x, 8)
    expect(after.z).toBeCloseTo(before.z, 8)
    expect(outer.position.toArray()).toEqual([2, 3, -1])
  })

  it('settles a group from the lowest descendant while preserving child local positions', () => {
    const group = new THREE.Group()
    group.position.set(0, 3, 0)
    group.rotation.set(.1, .3, -.2)
    group.scale.setScalar(1.5)
    const first = createProp('chair', '#aaaaaa').root
    first.position.set(2, 1, 0)
    const nested = new THREE.Group()
    nested.position.set(-1, -.7, 0)
    const second = createProp('sphere', '#bbbbbb').root
    nested.add(second)
    group.add(first, nested)
    const original = [first.position.toArray(), nested.position.toArray(), second.position.toArray()]
    group.position.fromArray(getFloorPosition(group)!)
    group.updateMatrixWorld(true)
    expect(new THREE.Box3().setFromObject(group, true).min.y).toBeCloseTo(0, 8)
    expect([first.position.toArray(), nested.position.toArray(), second.position.toArray()]).toEqual(original)
    expect(getFloorPosition(new THREE.Group())).toBeNull()
  })

  it('ignores hidden children and hidden nested folders when framing and settling their parent', () => {
    const group = new THREE.Group()
    group.position.y = 4
    const visible = createProp('cube', '#aaaaaa').root
    const hidden = createProp('sphere', '#bbbbbb').root
    hidden.visible = false
    hidden.position.set(100, -50, 100)
    const hiddenFolder = new THREE.Group()
    hiddenFolder.visible = false
    const nested = createProp('chair', '#aaaaaa').root
    nested.position.set(-100, -100, 0)
    hiddenFolder.add(nested)
    group.add(visible, hidden, hiddenFolder)
    const bounds = getVisibleBounds(group)
    expect(bounds.min.y).toBeCloseTo(4)
    for (const size of bounds.getSize(new THREE.Vector3()).toArray()) expect(size).toBeCloseTo(.7, 5)
    group.position.fromArray(getFloorPosition(group)!)
    expect(getVisibleBounds(group, true).min.y).toBeCloseTo(0, 8)
    expect(hidden.position.y).toBe(-50)
    group.visible = false
    expect(getVisibleBounds(visible).isEmpty()).toBe(true)
    expect(getFloorPosition(group)).toBeNull()
  })

  it('uses deformed skin vertices for precise floor contact', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, 0, 1, 0], 3))
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4))
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
    const bone = new THREE.Bone()
    mesh.add(bone)
    mesh.bind(new THREE.Skeleton([bone]))
    bone.position.y = -3
    expect(getVisibleBounds(mesh, true).min.y).toBeCloseTo(-3, 8)
    mesh.position.fromArray(getFloorPosition(mesh)!)
    expect(getVisibleBounds(mesh, true).min.y).toBeCloseTo(0, 8)
  })
})
