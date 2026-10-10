import * as THREE from 'three'
import type { JointName, Pose, Vec3 } from './types'

export const RIG_JOINTS: JointName[] = [
  'hips', 'spine', 'head', 'leftUpperArm', 'leftForearm', 'leftHand',
  'rightUpperArm', 'rightForearm', 'rightHand', 'leftThigh', 'leftShin',
  'leftFoot', 'rightThigh', 'rightShin', 'rightFoot',
]

export interface RigJoint { node: THREE.Group; rest: THREE.Quaternion }
interface MaterialPair { toon: THREE.MeshToonMaterial; smooth: THREE.MeshStandardMaterial }
export interface AnimeRig {
  root: THREE.Group
  joints: Record<JointName, RigJoint>
  outlines: THREE.Mesh[]
  surfaces: { mesh: THREE.Mesh; materials: MaterialPair }[]
  jacket: MaterialPair
  gradient: THREE.DataTexture
}

/** Original procedural character. Faces +Z, local limb segments point down -Y. */
export function createAnimeRig(): AnimeRig {
  const root = new THREE.Group()
  root.name = 'Artist Studio starter character'
  const joints = {} as Record<JointName, RigJoint>
  const outlines: THREE.Mesh[] = []
  const surfaces: AnimeRig['surfaces'] = []
  const gradient = new THREE.DataTexture(new Uint8Array([92, 255]), 2, 1, THREE.RedFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  const material = (color: string): MaterialPair => ({
    toon: new THREE.MeshToonMaterial({ color, gradientMap: gradient }),
    smooth: new THREE.MeshStandardMaterial({ color, roughness: .78 }),
  })
  const skin = material('#f1c3a5')
  const jacket = material('#7697d1')
  const trim = material('#ece8df')
  const pants = material('#323c54')
  const hair = material('#333143')
  const iris = material('#50484f')
  const eyeWhite = material('#fff9ef')
  const outline = new THREE.MeshBasicMaterial({ color: '#252330', side: THREE.BackSide })
  const sphere = new THREE.SphereGeometry(1, 24, 16)
  const box = new THREE.BoxGeometry(1, 1, 1)
  function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, pair: MaterialPair,
    position: Vec3, scale: Vec3 = [1, 1, 1], ink = true) {
    const mesh = new THREE.Mesh(geometry, pair.toon)
    mesh.position.fromArray(position)
    mesh.scale.fromArray(scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    surfaces.push({ mesh, materials: pair })
    if (ink) {
      const hull = new THREE.Mesh(geometry, outline)
      hull.scale.setScalar(1.035)
      hull.name = 'Outline'
      hull.userData.outline = true
      mesh.add(hull)
      outlines.push(hull)
    }
    return mesh
  }
  function joint(name: JointName, parent: THREE.Object3D, at: Vec3) {
    const node = new THREE.Group()
    node.name = name
    node.position.fromArray(at)
    parent.add(node)
    joints[name] = { node, rest: node.quaternion.clone() }
    return node
  }
  const hips = joint('hips', root, [0, 1.02, 0])
  add(hips, sphere, pants, [0, -.015, 0], [.19, .145, .135])
  const spine = joint('spine', hips, [0, .23, 0])
  add(spine, new THREE.CylinderGeometry(.21, .16, .43, 12), jacket, [0, .055, 0], [1, 1, .65])
  add(spine, new THREE.CylinderGeometry(.17, .17, .055, 12), trim, [0, -.155, 0], [1, 1, .67])
  add(spine, box, trim, [0, .042, .142], [.025, .36, .016], false)
  add(spine, new THREE.CylinderGeometry(.074, .085, .1, 16), skin, [0, .32, 0])
  const collarLeft = add(spine, box, trim, [.071, .253, .06], [.1, .065, .18])
  collarLeft.rotation.z = -.22
  const collarRight = add(spine, box, trim, [-.071, .253, .06], [.1, .065, .18])
  collarRight.rotation.z = .22
  const head = joint('head', spine, [0, .4, 0])
  add(head, sphere, skin, [0, .09, 0], [.177, .212, .165])
  // Facial forms and asymmetrical sculpted hair make the starter rig legible from every angle.
  add(head, sphere, hair, [0, .195, -.023], [.19, .16, .174])
  for (const side of [-1, 1]) {
    add(head, sphere, skin, [side * .17, .075, 0], [.032, .047, .029])
    add(head, sphere, eyeWhite, [side * .069, .106, .148], [.043, .052, .018], false)
    add(head, sphere, iris, [side * .067, .105, .164], [.022, .036, .008], false)
    add(head, sphere, eyeWhite, [side * .061, .12, .173], [.007, .011, .003], false)
    const brow = add(head, box, hair, [side * .069, .17, .146], [.073, .012, .012], false)
    brow.rotation.z = side * -.1
    const sideburn = add(head, new THREE.ConeGeometry(.06, .21, 4), hair,
      [side * .153, .111, .061], [.75, 1, .85])
    sideburn.rotation.z = side * -.18 + Math.PI
  }
  for (let i = 0; i < 5; i++) {
    const bang = add(head, new THREE.ConeGeometry(.07, .18 + (i % 2) * .035, 4), hair,
      [(i - 2) * .065, .208, .128], [1, 1, .55])
    bang.rotation.z = Math.PI + .16 * (i - 1)
  }
  add(head, sphere, skin, [0, .075, .167], [.021, .024, .022], false)
  add(head, sphere, iris, [0, .006, .153], [.034, .004, .004], false)
  for (const [side, sign] of [['left', 1], ['right', -1]] as const) {
    const upper = joint(`${side}UpperArm`, spine, [sign * .234, .205, 0])
    add(upper, new THREE.CapsuleGeometry(.073, .2, 5, 12), jacket, [0, -.135, 0])
    const forearm = joint(`${side}Forearm`, upper, [0, -.3, 0])
    add(forearm, new THREE.CapsuleGeometry(.054, .185, 5, 12), skin, [0, -.135, 0])
    add(forearm, new THREE.CylinderGeometry(.064, .064, .045, 14), trim, [0, -.025, 0])
    const hand = joint(`${side}Hand`, forearm, [0, -.27, 0])
    add(hand, sphere, skin, [0, -.065, .006], [.05, .075, .03])
    const thumb = add(hand, sphere, skin, [-sign * .044, -.047, .01], [.019, .043, .021])
    thumb.rotation.z = -sign * .4
    const thigh = joint(`${side}Thigh`, hips, [sign * .105, -.055, 0])
    add(thigh, new THREE.CapsuleGeometry(.085, .26, 5, 12), pants, [0, -.2, 0])
    const shin = joint(`${side}Shin`, thigh, [0, -.425, 0])
    add(shin, new THREE.CapsuleGeometry(.064, .28, 5, 12), pants, [0, -.19, 0])
    const foot = joint(`${side}Foot`, shin, [0, -.4, 0])
    add(foot, sphere, trim, [0, -.063, .046], [.08, .071, .148])
    add(foot, box, pants, [0, -.115, .047], [.156, .034, .262])
  }
  return { root, joints, outlines, surfaces, jacket, gradient }
}

export function setRigAppearance(rig: AnimeRig, color: string, toon: boolean, outlines: boolean) {
  rig.jacket.toon.color.set(color)
  rig.jacket.smooth.color.set(color)
  for (const surface of rig.surfaces) surface.mesh.material = toon ? surface.materials.toon : surface.materials.smooth
  for (const outline of rig.outlines) outline.visible = outlines
}

export function applyRigPose(rig: AnimeRig, pose: Pose) {
  const rotation = new THREE.Euler()
  const delta = new THREE.Quaternion()
  for (const name of RIG_JOINTS) {
    const joint = rig.joints[name]
    const angles = pose[name] ?? [0, 0, 0]
    rotation.set(...angles.map(THREE.MathUtils.degToRad) as Vec3, 'XYZ')
    joint.node.quaternion.copy(joint.rest).multiply(delta.setFromEuler(rotation))
  }
  rig.root.updateMatrixWorld(true)
}

export function readRigPose(rig: AnimeRig): Pose {
  const pose = {} as Pose
  for (const name of RIG_JOINTS) {
    const joint = rig.joints[name]
    const rotation = new THREE.Euler().setFromQuaternion(joint.rest.clone().invert().multiply(joint.node.quaternion), 'XYZ')
    pose[name] = [rotation.x, rotation.y, rotation.z].map(value => Math.round(THREE.MathUtils.radToDeg(value) * 10000) / 10000 || 0) as Vec3
  }
  return pose
}

export function getIKChain(rig: AnimeRig, name: JointName) {
  const side = name.startsWith('left') ? 'left' : 'right'
  if (name.endsWith('Hand')) return {
    upper: rig.joints[`${side}UpperArm`].node, middle: rig.joints[`${side}Forearm`].node,
    end: rig.joints[`${side}Hand`].node,
  }
  if (name.endsWith('Foot')) return {
    upper: rig.joints[`${side}Thigh`].node, middle: rig.joints[`${side}Shin`].node,
    end: rig.joints[`${side}Foot`].node,
  }
  return null
}

/** Analytic two-bone solve in world coordinates. Clamps unreachable goals without stretching. */
export function solveTwoBoneIK(upper: THREE.Object3D, middle: THREE.Object3D, end: THREE.Object3D,
  target: THREE.Vector3, pole: THREE.Vector3) {
  upper.updateWorldMatrix(true, true)
  const a = upper.getWorldPosition(new THREE.Vector3())
  const b = middle.getWorldPosition(new THREE.Vector3())
  const c = end.getWorldPosition(new THREE.Vector3())
  const first = a.distanceTo(b), second = b.distanceTo(c)
  if (first < 1e-7 || second < 1e-7 || !target.toArray().every(Number.isFinite)) return
  const axis = target.clone().sub(a)
  const requested = axis.length()
  if (requested < 1e-7) axis.copy(c).sub(a)
  if (axis.lengthSq() < 1e-10) axis.set(0, -1, 0)
  axis.normalize()
  const distance = THREE.MathUtils.clamp(requested, Math.abs(first - second) + 1e-5, first + second - 1e-5)
  const bend = pole.clone().sub(a)
  bend.addScaledVector(axis, -bend.dot(axis))
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(axis.x) < .8 ? 1 : 0, Math.abs(axis.x) < .8 ? 0 : 1, 0)
    bend.addScaledVector(axis, -bend.dot(axis))
  }
  bend.normalize()
  const projected = (first * first - second * second + distance * distance) / (2 * distance)
  const offset = Math.sqrt(Math.max(0, first * first - projected * projected))
  const elbow = a.clone().addScaledVector(axis, projected).addScaledVector(bend, offset)
  const goal = a.clone().addScaledVector(axis, distance)
  alignWorld(upper, b.clone().sub(a), elbow.clone().sub(a))
  upper.updateWorldMatrix(true, true)
  const newB = middle.getWorldPosition(new THREE.Vector3())
  const newC = end.getWorldPosition(new THREE.Vector3())
  alignWorld(middle, newC.sub(newB), goal.sub(newB))
  upper.updateWorldMatrix(true, true)
}

function alignWorld(node: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return
  const current = node.getWorldQuaternion(new THREE.Quaternion())
  const world = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(current)
  const parent = node.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  node.quaternion.copy(parent.invert().multiply(world))
}

export function disposeTree(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      geometry.add(node.geometry)
      for (const item of Array.isArray(node.material) ? node.material : [node.material]) materials.add(item)
    }
  })
  geometry.forEach(item => item.dispose())
  materials.forEach(item => item.dispose())
}

export function disposeRig(rig: AnimeRig) {
  disposeTree(rig.root)
  const materials = new Set<THREE.Material>()
  for (const surface of rig.surfaces) { materials.add(surface.materials.toon); materials.add(surface.materials.smooth) }
  materials.forEach(item => item.dispose())
  rig.gradient.dispose()
}
