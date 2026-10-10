import * as THREE from 'three'
import type { Vec3 } from './types'

/** Bounds for rendered geometry only; hidden branches never influence framing or placement. */
export function getVisibleBounds(root: THREE.Object3D, precise = false): THREE.Box3 {
  const result = new THREE.Box3()
  for (let ancestor: THREE.Object3D | null = root; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return result
  root.updateWorldMatrix(true, false)
  // SkinnedMesh refreshes its bind inverse in updateMatrixWorld, not updateWorldMatrix.
  root.updateMatrixWorld(true)
  const vertex = new THREE.Vector3()
  const box = new THREE.Box3()
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    if (materials.every(material => !material.visible)) return
    const geometry = node.geometry
    const positions = geometry.getAttribute('position')
    if (precise && positions && !(node instanceof THREE.InstancedMesh)) {
      for (let index = 0; index < positions.count; index++) {
        if (node instanceof THREE.Mesh) node.getVertexPosition(index, vertex)
        else vertex.fromBufferAttribute(positions, index)
        result.expandByPoint(vertex.applyMatrix4(node.matrixWorld))
      }
    } else {
      if (node instanceof THREE.InstancedMesh || node instanceof THREE.SkinnedMesh) {
        node.computeBoundingBox()
        if (node.boundingBox) box.copy(node.boundingBox)
        else return
      } else {
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (geometry.boundingBox) box.copy(geometry.boundingBox)
        else return
      }
      result.union(box.applyMatrix4(node.matrixWorld))
    }
  })
  return result
}

/** Move vertically in world space, then express the result in the parent's coordinates. */
export function getFloorPosition(root: THREE.Object3D, clearance = 0): Vec3 | null {
  const bounds = getVisibleBounds(root, true)
  if (bounds.isEmpty()) return null
  const world = root.getWorldPosition(new THREE.Vector3())
  world.y += clearance - bounds.min.y
  const local = root.parent ? root.parent.worldToLocal(world) : world
  return local.toArray() as Vec3
}
