import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createSceneDocument, createSceneObject, validateDocument } from './model'
import { createObjectGroup, duplicateObjectTree, getDescendantIds, hasLockedDescendant, isEffectivelyLocked, isEffectivelyVisible, removeObjectTree, reparentObjects, ungroupObject } from './groups'
import type { ObjectKind, SceneObject } from './types'

function object(id: string, kind: ObjectKind = 'cube', parentId?: string): SceneObject {
  return { ...createSceneObject(kind, id), id, ...(parentId ? { parentId } : {}) }
}

// Compose independently from the hierarchy helper to compare rendered world transforms.
function world(objects: SceneObject[], id: string): Matrix4 {
  const value = objects.find(item => item.id === id)!
  const local = new Matrix4().compose(new Vector3(...value.position), new Quaternion().setFromEuler(new Euler(...value.rotation)), new Vector3(...value.scale))
  return value.parentId ? world(objects, value.parentId).multiply(local) : local
}
function expectWorldUnchanged(before: SceneObject[], after: SceneObject[], ids: string[]) {
  for (const id of ids) world(before, id).elements.forEach((value, index) => expect(world(after, id).elements[index]).toBeCloseTo(value, 8))
}
function nestedScene(): SceneObject[] {
  return [
    { ...object('outer', 'group'), position: [3, 1, -2], rotation: [.3, -.8, .2], scale: [2, 2, 2] },
    { ...object('inner', 'group', 'outer'), position: [-1, 2, 1], rotation: [-.4, .2, .7], scale: [.5, .5, .5] },
    { ...object('child', 'figure', 'inner'), position: [.5, -.2, 1], rotation: [.2, -.6, .9], scale: [.7, 1.4, .9], pose: { leftHand: [.1, .2, .3] } },
    { ...object('destination', 'group'), position: [-2, .7, 3], rotation: [-.1, .5, -.4], scale: [1.5, 1.5, 1.5] },
    object('other'),
  ]
}

describe('scene folder hierarchy', () => {
  it('traverses complete subtrees and inherits visibility/locking without rewriting child flags', () => {
    const objects = nestedScene()
    expect([...getDescendantIds(objects, 'outer')]).toEqual(['outer', 'inner', 'child'])
    expect([...getDescendantIds(objects, 'child')]).toEqual(['child'])
    expect(getDescendantIds(objects, 'missing').size).toBe(0)
    objects[0].visible = false
    objects[0].locked = true
    expect(isEffectivelyVisible(objects, 'child')).toBe(false)
    expect(isEffectivelyLocked(objects, 'child')).toBe(true)
    expect(objects[2]).toMatchObject({ visible: true, locked: false })
    expect(hasLockedDescendant(objects, 'outer')).toBe(false)
    objects[2].locked = true
    expect(hasLockedDescendant(objects, 'outer')).toBe(true)
    expect(isEffectivelyVisible(objects, 'other')).toBe(true)
    expect(isEffectivelyLocked(objects, 'other')).toBe(false)
  })

  it('reparents rotated nonuniform objects between nested uniform folders without visual jumps', () => {
    const before = nestedScene()
    const after = reparentObjects(before, ['child'], 'destination')
    expect(after.find(item => item.id === 'child')?.parentId).toBe('destination')
    expectWorldUnchanged(before, after, before.map(item => item.id))
    const released = reparentObjects(after, ['child'], undefined)
    expect(released.find(item => item.id === 'child')).not.toHaveProperty('parentId')
    expectWorldUnchanged(before, released, before.map(item => item.id))
    expect(before[2].parentId).toBe('inner')
  })

  it('moves selected groups with their descendants only once and retains uniform scale', () => {
    const before = nestedScene()
    const after = reparentObjects(before, ['inner', 'child', 'inner'], 'destination')
    expect(after.find(item => item.id === 'inner')?.parentId).toBe('destination')
    expect(after.find(item => item.id === 'child')?.parentId).toBe('inner')
    expectWorldUnchanged(before, after, ['inner', 'child'])
    const scale = after.find(item => item.id === 'inner')!.scale
    expect(scale[0]).toBe(scale[1])
    expect(scale[1]).toBe(scale[2])
  })

  it('rejects cycles, non-folder parents, and missing selections before changing the array', () => {
    const objects = nestedScene()
    const snapshot = structuredClone(objects)
    expect(() => reparentObjects(objects, ['outer'], 'inner')).toThrow('descendants')
    expect(() => reparentObjects(objects, ['inner'], 'inner')).toThrow('itself')
    expect(() => reparentObjects(objects, ['child'], 'other')).toThrow('folder')
    expect(() => reparentObjects(objects, ['missing'], undefined)).toThrow('could not be found')
    expect(() => reparentObjects(objects, ['child'], 'missing')).toThrow('could not be found')
    expect(objects).toEqual(snapshot)
  })

  it('blocks edits across effective locks or locked descendants while keeping unrelated branches editable', () => {
    const objects = nestedScene()
    objects[2].locked = true
    expect(() => reparentObjects(objects, ['inner'], 'destination')).toThrow('objects inside')
    expect(() => removeObjectTree(objects, 'outer')).toThrow('objects inside')
    expect(() => ungroupObject(objects, 'inner')).toThrow('objects inside')
    expect(() => createObjectGroup(objects, ['inner'])).toThrow('objects inside')
    expect(() => reparentObjects(objects, ['other'], 'destination')).not.toThrow()
    objects[2].locked = false
    objects[0].locked = true
    expect(() => reparentObjects(objects, ['child'], 'destination')).toThrow('parent folders')
    expect(() => reparentObjects(objects, ['other'], 'inner')).toThrow('parent folders')
  })

  it('creates empty folders and wraps topmost selections at their mean world position', () => {
    const before = nestedScene()
    const empty = createObjectGroup(before)
    expect(empty.objects.at(-1)).toMatchObject({ id: empty.selectedId, kind: 'group', name: 'Folder', position: [0, 0, 0], scale: [1, 1, 1], pose: {} })
    const grouped = createObjectGroup(before, ['inner', 'child', 'other'], 'Composition')
    const folder = grouped.objects.find(item => item.id === grouped.selectedId)!
    const expectedCenter = new Vector3().setFromMatrixPosition(world(before, 'inner')).add(new Vector3().setFromMatrixPosition(world(before, 'other'))).multiplyScalar(.5)
    expect(folder.position).toEqual(expectedCenter.toArray())
    expect(folder).not.toHaveProperty('parentId')
    expect(grouped.objects.find(item => item.id === 'inner')?.parentId).toBe(folder.id)
    expect(grouped.objects.find(item => item.id === 'other')?.parentId).toBe(folder.id)
    expect(grouped.objects.find(item => item.id === 'child')?.parentId).toBe('inner')
    expectWorldUnchanged(before, grouped.objects, before.map(item => item.id))
    expect(validateDocument({ ...createSceneDocument(), objects: grouped.objects }).objects).toHaveLength(6)
  })

  it('duplicates a whole subtree with fresh IDs and independent poses while retaining shared assets', () => {
    const before = nestedScene()
    before[1].locked = true
    before[2].locked = true
    before.push({ ...object('image', 'image', 'inner'), assetId: 'shared-image' })
    const result = duplicateObjectTree(before, 'inner')
    const copy = result.objects.find(item => item.id === result.selectedId)!
    expect(copy).toMatchObject({ name: 'inner copy', parentId: 'outer', locked: false, position: [-.65, 2, 1] })
    expect(getDescendantIds(result.objects, copy.id).size).toBe(3)
    const copyChild = result.objects.find(item => item.parentId === copy.id && item.kind === 'figure')!
    const copyImage = result.objects.find(item => item.parentId === copy.id && item.kind === 'image')!
    expect(copyChild.id).not.toBe('child')
    expect(copyChild.locked).toBe(true)
    expect(copyImage.assetId).toBe('shared-image')
    copyChild.pose.leftHand[0] = 2
    copyChild.position[0] = 9
    expect(before[2].pose.leftHand[0]).toBe(.1)
    expect(before[2].position[0]).toBe(.5)
    expect(new Set(result.objects.map(item => item.id)).size).toBe(result.objects.length)
  })

  it('ungroups nested folders without moving children and removes complete subtrees', () => {
    const before = nestedScene()
    const ungrouped = ungroupObject(before, 'inner')
    expect(ungrouped.some(item => item.id === 'inner')).toBe(false)
    expect(ungrouped.find(item => item.id === 'child')?.parentId).toBe('outer')
    expectWorldUnchanged(before, ungrouped, ['outer', 'child', 'destination', 'other'])
    const outerUngrouped = ungroupObject(before, 'outer')
    expect(outerUngrouped.find(item => item.id === 'inner')).not.toHaveProperty('parentId')
    expectWorldUnchanged(before, outerUngrouped, ['inner', 'child'])
    expect(removeObjectTree(before, 'outer').map(item => item.id)).toEqual(['destination', 'other'])
    expect(removeObjectTree(before, 'child')).toHaveLength(4)
    expect(() => ungroupObject(before, 'child')).toThrow('Choose a folder')
  })

  it('enforces scene capacity and supported local transform limits', () => {
    const full = Array.from({ length: 64 }, (_, index) => object(`object-${index}`))
    expect(() => createObjectGroup(full)).toThrow('64 objects')
    expect(() => duplicateObjectTree(full, full[0].id)).toThrow('64-object')
    const objects = [
      { ...object('large'), scale: [1000, 1000, 1000] as [number, number, number] },
      { ...object('small-parent', 'group'), scale: [.001, .001, .001] as [number, number, number] },
    ]
    expect(() => reparentObjects(objects, ['large'], 'small-parent')).toThrow('transform limits')
  })
})
