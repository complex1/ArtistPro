import * as THREE from 'three'
import type { SceneObject, Vec3 } from './types'

export interface RigJoint {
  node: THREE.Object3D
  rest: THREE.Quaternion
}

export interface StageObject {
  root: THREE.Group
  joints: Map<string, RigJoint>
}

export const BUILT_IN_JOINTS = [
  'hips', 'chest', 'head',
  'leftUpperArm', 'leftForearm', 'leftHand', 'rightUpperArm', 'rightForearm', 'rightHand',
  'leftThigh', 'leftShin', 'leftFoot', 'rightThigh', 'rightShin', 'rightFoot',
] as const

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D,
  position: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
  const result = new THREE.Mesh(geometry, material)
  result.position.fromArray(position)
  result.scale.fromArray(scale)
  result.castShadow = true
  result.receiveShadow = true
  parent.add(result)
  return result
}

/** Neutral figure faces +Z. Limb segments point down their local Y axes. */
export function createFigure(color: string): StageObject {
  const root = new THREE.Group()
  const joints = new Map<string, RigJoint>()
  const body = new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: .04 })
  const ball = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.62), roughness: .72 })
  const face = new THREE.MeshStandardMaterial({ color: '#33434b', roughness: .8 })
  const sphere = new THREE.SphereGeometry(1, 24, 16)
  function joint(name: string, parent: THREE.Object3D, position: Vec3, radius = .046) {
    const node = new THREE.Group()
    node.position.fromArray(position)
    node.userData.jointName = name
    node.name = name
    parent.add(node)
    joints.set(name, { node, rest: node.quaternion.clone() })
    mesh(sphere, ball, node, [0, 0, 0], [radius, radius, radius])
    return node
  }
  function segment(parent: THREE.Object3D, length: number, radius: number) {
    return mesh(new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), 6, 16), body, parent, [0, -length / 2, 0])
  }
  const hips = joint('hips', root, [0, .94, 0], .065)
  mesh(sphere, body, hips, [0, .035, 0], [.175, .135, .115])
  const chest = joint('chest', hips, [0, .25, 0], .055)
  mesh(sphere, body, chest, [0, .065, 0], [.215, .225, .125])
  mesh(new THREE.CylinderGeometry(.065, .075, .10, 20), body, chest, [0, .24, 0])
  const head = joint('head', chest, [0, .36, 0], .055)
  mesh(sphere, body, head, [0, .055, 0], [.115, .155, .108])
  // A quiet facial guide makes the direction of the head clear in a drawing reference.
  mesh(sphere, face, head, [-.039, .075, .096], [.011, .009, .006])
  mesh(sphere, face, head, [.039, .075, .096], [.011, .009, .006])
  mesh(sphere, body, head, [0, .038, .109], [.020, .032, .019])
  for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
    const upperArm = joint(`${side}UpperArm`, chest, [sign * .235, .19, 0], .063)
    segment(upperArm, .29, .055)
    const forearm = joint(`${side}Forearm`, upperArm, [0, -.29, 0], .047)
    segment(forearm, .27, .045)
    const hand = joint(`${side}Hand`, forearm, [0, -.27, 0], .033)
    mesh(sphere, body, hand, [0, -.063, 0], [.047, .075, .028])
    const thumb = mesh(sphere, body, hand, [-sign * .042, -.047, .005], [.018, .041, .02])
    thumb.rotation.z = -sign * .4
    const thigh = joint(`${side}Thigh`, hips, [sign * .105, -.015, 0], .064)
    segment(thigh, .40, .077)
    const shin = joint(`${side}Shin`, thigh, [0, -.40, 0], .054)
    segment(shin, .40, .057)
    const foot = joint(`${side}Foot`, shin, [0, -.40, 0], .043)
    mesh(sphere, body, foot, [0, -.064, .055], [.063, .050, .125])
  }
  return { root, joints }
}

export function createProp(kind: SceneObject['kind'], color: string): StageObject {
  const root = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color, roughness: .73, metalness: .02 })
  const cube = new THREE.BoxGeometry(1, 1, 1)
  if (kind === 'chair') {
    mesh(cube, material, root, [0, .48, 0], [.48, .065, .48])
    mesh(cube, material, root, [0, .77, -.205], [.48, .53, .055])
    for (const x of [-.185, .185]) for (const z of [-.185, .185]) {
      mesh(cube, material, root, [x, .23, z], [.045, .46, .045])
    }
  } else if (kind === 'sphere') {
    mesh(new THREE.SphereGeometry(.35, 32, 24), material, root, [0, .35, 0])
  } else if (kind === 'cylinder') {
    mesh(new THREE.CylinderGeometry(.30, .30, .7, 32), material, root, [0, .35, 0])
  } else if (kind === 'platform') {
    mesh(cube, material, root, [0, .09, 0], [1.6, .18, 1.2])
  } else {
    mesh(cube, material, root, [0, .35, 0], [.7, .7, .7])
  }
  return { root, joints: new Map() }
}

export function applyPose(object: StageObject, pose: Record<string, Vec3>) {
  for (const [name, joint] of object.joints) {
    joint.node.quaternion.copy(joint.rest)
    const rotation = pose[name]
    if (rotation) joint.node.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)))
  }
  object.root.updateMatrixWorld(true)
}

export function readPose(object: StageObject): Record<string, Vec3> {
  return Object.fromEntries([...object.joints].map(([name, joint]) => {
    const delta = joint.rest.clone().invert().multiply(joint.node.quaternion)
    const rotation = new THREE.Euler().setFromQuaternion(delta, 'XYZ')
    return [name, [rotation.x, rotation.y, rotation.z] as Vec3]
  }))
}

/** Analytic two-bone IK. Reach is clamped; the model is never stretched. */
export function solveTwoBoneIK(upper: THREE.Object3D, middle: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  upper.updateWorldMatrix(true, true)
  const a = upper.getWorldPosition(new THREE.Vector3())
  const b = middle.getWorldPosition(new THREE.Vector3())
  const c = end.getWorldPosition(new THREE.Vector3())
  const length1 = a.distanceTo(b), length2 = b.distanceTo(c)
  if (length1 < 1e-6 || length2 < 1e-6) return
  const direction = target.clone().sub(a)
  if (direction.lengthSq() < 1e-10) direction.set(0, -1, 0)
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(length1 - length2) + .001, length1 + length2 - .001)
  direction.normalize()
  const bend = pole.clone().sub(a).addScaledVector(direction, -pole.clone().sub(a).dot(direction))
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(direction, -direction.z)
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(direction, -direction.x)
  bend.normalize()
  const along = (length1 * length1 - length2 * length2 + distance * distance) / (2 * distance)
  const height = Math.sqrt(Math.max(0, length1 * length1 - along * along))
  const desiredB = a.clone().addScaledVector(direction, along).addScaledVector(bend, height)
  const desiredC = a.clone().addScaledVector(direction, distance)
  rotateWorldDirection(upper, b.clone().sub(a), desiredB.clone().sub(a))
  upper.updateWorldMatrix(true, true)
  const updatedB = middle.getWorldPosition(new THREE.Vector3())
  const updatedC = end.getWorldPosition(new THREE.Vector3())
  rotateWorldDirection(middle, updatedC.sub(updatedB), desiredC.sub(updatedB))
  upper.updateWorldMatrix(true, true)
}

function rotateWorldDirection(node: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return
  const worldRotation = node.getWorldQuaternion(new THREE.Quaternion())
  worldRotation.premultiply(new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()))
  const parentRotation = node.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  node.quaternion.copy(parentRotation.invert().multiply(worldRotation))
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    geometries.add(node.geometry)
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  geometries.forEach(item => item.dispose())
  materials.forEach(item => item.dispose())
  textures.forEach(item => item.dispose())
}
