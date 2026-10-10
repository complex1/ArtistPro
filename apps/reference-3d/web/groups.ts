import { nanoid } from 'nanoid'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { createSceneObject } from './model'
import type { SceneObject, Vec3 } from './types'

const MAX_OBJECTS = 64
type Objects = readonly SceneObject[]

function lookup(objects: Objects, id: string): SceneObject {
  const object = objects.find(item => item.id === id)
  if (!object) throw new Error('The selected object could not be found.')
  return object
}

/** Includes the selected object itself. Missing selections produce an empty set. */
export function getDescendantIds(objects: Objects, id: string): Set<string> {
  if (!objects.some(object => object.id === id)) return new Set()
  const descendants = new Set([id])
  const pending = [id]
  while (pending.length) {
    const parent = pending.pop()!
    for (const object of objects) if (object.parentId === parent && !descendants.has(object.id)) {
      descendants.add(object.id)
      pending.push(object.id)
    }
  }
  return descendants
}

function ancestors(objects: Objects, id: string): SceneObject[] | null {
  const byId = new Map(objects.map(object => [object.id, object]))
  const chain: SceneObject[] = []
  const visited = new Set<string>()
  let next: string | undefined = id
  while (next !== undefined) {
    const object = byId.get(next)
    if (!object || visited.has(next)) return null
    visited.add(next)
    chain.push(object)
    next = object.parentId
  }
  return chain
}

export function isEffectivelyVisible(objects: Objects, id: string): boolean {
  const chain = ancestors(objects, id)
  return !!chain && chain.every(object => object.visible)
}

export function isEffectivelyLocked(objects: Objects, id: string): boolean {
  const chain = ancestors(objects, id)
  return !chain || chain.some(object => object.locked)
}

/** Checks children's own locks; use with isEffectivelyLocked to include the root and its ancestors. */
export function hasLockedDescendant(objects: Objects, id: string): boolean {
  const descendants = getDescendantIds(objects, id)
  descendants.delete(id)
  return objects.some(object => descendants.has(object.id) && object.locked)
}

function assertEditableSubtree(objects: Objects, id: string): void {
  const object = lookup(objects, id)
  if (isEffectivelyLocked(objects, id)) throw new Error(`Unlock “${object.name}” and its parent folders before changing it.`)
  if (hasLockedDescendant(objects, id)) throw new Error(`Unlock the objects inside “${object.name}” before changing this folder.`)
}

function worldMatrix(objects: Objects, id: string): Matrix4 {
  const chain = ancestors(objects, id)
  if (!chain) throw new Error('The folder hierarchy contains a missing parent or a cycle.')
  const result = new Matrix4()
  for (const object of chain.reverse()) {
    result.multiply(new Matrix4().compose(
      new Vector3().fromArray(object.position),
      new Quaternion().setFromEuler(new Euler(...object.rotation, 'XYZ')),
      new Vector3().fromArray(object.scale),
    ))
  }
  if (result.elements.some(value => !Number.isFinite(value))) throw new Error('The folder transforms are too large. Reduce their scale first.')
  return result
}

function topmost(objects: Objects, ids: readonly string[]): string[] {
  const selected = new Set(ids)
  for (const id of selected) lookup(objects, id)
  return [...selected].filter(id => {
    const chain = ancestors(objects, id)
    if (!chain) throw new Error('The folder hierarchy contains a missing parent or a cycle.')
    return !chain.slice(1).some(parent => selected.has(parent.id))
  })
}

function bounded(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum - 1e-7 || value > maximum + 1e-7) throw new Error('This operation would exceed supported transform limits. Reduce the folder scale or move it closer first.')
  return Math.min(maximum, Math.max(minimum, value))
}

function fromMatrix(object: SceneObject, matrix: Matrix4, parentId?: string): SceneObject {
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3()
  matrix.decompose(position, quaternion, scale)
  const euler = new Euler().setFromQuaternion(quaternion, 'XYZ')
  const nextScale = scale.toArray().map(value => bounded(value, .001, 1000)) as Vec3
  if (object.kind === 'group') {
    const uniform = (nextScale[0] + nextScale[1] + nextScale[2]) / 3
    if (nextScale.some(value => Math.abs(value - uniform) > Math.max(1, uniform) * 1e-6)) throw new Error('Folders require uniform scale to keep their children in place.')
    nextScale.fill(uniform)
  }
  const result: SceneObject = {
    ...object, position: position.toArray().map(value => bounded(value, -10000, 10000)) as Vec3,
    rotation: [euler.x, euler.y, euler.z], scale: nextScale,
  }
  if (parentId === undefined) delete result.parentId
  else result.parentId = parentId
  return result
}

/** Move selected roots together; selected descendants travel with their selected ancestor. */
export function reparentObjects(objects: Objects, ids: readonly string[], parentId: string | undefined): SceneObject[] {
  const roots = topmost(objects, ids)
  if (!roots.length) return [...objects]
  if (parentId !== undefined) {
    const parent = lookup(objects, parentId)
    if (parent.kind !== 'group') throw new Error('Move objects into a folder, or choose the scene root.')
    if (isEffectivelyLocked(objects, parentId)) throw new Error(`Unlock “${parent.name}” and its parent folders before moving objects into it.`)
  }
  for (const id of roots) {
    if (parentId !== undefined && getDescendantIds(objects, id).has(parentId)) throw new Error('A folder cannot be moved into itself or one of its descendants.')
    if (lookup(objects, id).parentId !== parentId) assertEditableSubtree(objects, id)
  }
  const inverseParent = parentId === undefined ? new Matrix4() : worldMatrix(objects, parentId).invert()
  const replacements = new Map<string, SceneObject>()
  for (const id of roots) {
    const object = lookup(objects, id)
    if (object.parentId !== parentId) replacements.set(id, fromMatrix(object, inverseParent.clone().multiply(worldMatrix(objects, id)), parentId))
  }
  return objects.map(object => replacements.get(object.id) ?? object)
}

export function createObjectGroup(objects: Objects, ids: readonly string[] = [], name = 'Folder'): { objects: SceneObject[]; selectedId: string } {
  if (objects.length >= MAX_OBJECTS) throw new Error('This scene already has 64 objects. Remove an object before adding a folder.')
  const roots = topmost(objects, ids)
  roots.forEach(id => assertEditableSubtree(objects, id))
  const center = new Vector3()
  for (const id of roots) center.add(new Vector3().setFromMatrixPosition(worldMatrix(objects, id)))
  if (roots.length) center.divideScalar(roots.length)
  const group = createSceneObject('group', name.trim().slice(0, 200) || 'Folder')
  group.position = center.toArray().map(value => bounded(value, -10000, 10000)) as Vec3
  return { objects: reparentObjects([...objects, group], roots, group.id), selectedId: group.id }
}

/** Copies own lock states and shared asset IDs; the copied root can be edited unless its parent is locked. */
export function duplicateObjectTree(objects: Objects, id: string): { objects: SceneObject[]; selectedId: string } {
  const source = lookup(objects, id)
  const descendants = getDescendantIds(objects, id)
  if (objects.length + descendants.size > MAX_OBJECTS) throw new Error('Duplicating this selection would exceed the 64-object scene limit.')
  const ids = new Map([...descendants].map(old => [old, nanoid()]))
  const copies = objects.filter(object => descendants.has(object.id)).map(object => {
    const copy = structuredClone(object)
    copy.id = ids.get(object.id)!
    if (object.id === id) {
      copy.name = `${source.name.slice(0, 195)} copy`
      copy.locked = false
      copy.position[0] = bounded(copy.position[0] + .35, -10000, 10000)
    } else if (copy.parentId !== undefined) copy.parentId = ids.get(copy.parentId)!
    return copy
  })
  return { objects: [...objects, ...copies], selectedId: ids.get(id)! }
}

export function removeObjectTree(objects: Objects, id: string): SceneObject[] {
  assertEditableSubtree(objects, id)
  const removed = getDescendantIds(objects, id)
  return objects.filter(object => !removed.has(object.id))
}

export function ungroupObject(objects: Objects, id: string): SceneObject[] {
  const group = lookup(objects, id)
  if (group.kind !== 'group') throw new Error('Choose a folder to ungroup its contents.')
  assertEditableSubtree(objects, id)
  return reparentObjects(objects, objects.filter(object => object.parentId === id).map(object => object.id), group.parentId).filter(object => object.id !== id)
}
