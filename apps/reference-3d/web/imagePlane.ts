import * as THREE from 'three'
import type { SceneAsset } from './types'
import type { StageObject } from './rig'

/** Keep the original aspect ratio with the longest edge at two scene units. */
export function imagePlaneSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error('The image has invalid dimensions.')
  const scale = 2 / Math.max(width, height)
  return { width: width * scale, height: height * scale }
}

export async function loadImagePlane(asset: SceneAsset): Promise<StageObject> {
  if (!asset.image || !asset.dataUrl.startsWith('data:image/png;base64,')) throw new Error('This image must be an embedded PNG.')
  const size = imagePlaneSize(asset.image.width, asset.image.height)
  // A fresh texture for every instance keeps duplicate deletion and disposal independent.
  const texture = await new THREE.TextureLoader().loadAsync(asset.dataUrl)
  if (texture.image.width !== asset.image.width || texture.image.height !== asset.image.height) {
    texture.dispose()
    throw new Error('The image dimensions do not match the saved asset.')
  }
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: .01,
    depthWrite: true,
    toneMapped: false,
  })
  // The image is a reference card: lighting should not tint it or cast a rectangular shadow.
  material.forceSinglePass = true
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.width, size.height), material)
  plane.name = 'Image reference plane'
  plane.position.y = size.height / 2
  plane.castShadow = false
  plane.receiveShadow = false
  const root = new THREE.Group()
  root.add(plane)
  return { root, joints: new Map() }
}
