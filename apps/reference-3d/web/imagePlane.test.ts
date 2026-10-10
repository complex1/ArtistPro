import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { imagePlaneSize, loadImagePlane } from './imagePlane'
import { disposeObject } from './rig'
import type { SceneAsset } from './types'

afterEach(() => vi.restoreAllMocks())

const asset: SceneAsset = { id: 'image', name: 'Reference', dataUrl: 'data:image/png;base64,aGVsbG8=', bones: [], image: { width: 400, height: 200 } }
const decodedTexture = (width: number, height: number) => new THREE.Texture({ width, height } as HTMLImageElement)

describe('image reference planes', () => {
  it('preserves wide and tall image proportions', () => {
    expect(imagePlaneSize(400, 200)).toEqual({ width: 2, height: 1 })
    expect(imagePlaneSize(300, 600)).toEqual({ width: 1, height: 2 })
    expect(() => imagePlaneSize(0, 1)).toThrow('dimensions')
  })

  it('rests on the floor, stays unlit, and preserves transparent cutouts', async () => {
    const texture = decodedTexture(400, 200)
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture)
    const { root, joints } = await loadImagePlane(asset)
    const bounds = new THREE.Box3().setFromObject(root)
    const plane = root.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
    expect(bounds.min.y).toBe(0)
    expect(bounds.max.y).toBe(1)
    expect(joints.size).toBe(0)
    expect(plane.material.type).toBe('MeshBasicMaterial')
    expect(plane.material.transparent).toBe(true)
    expect(plane.material.alphaTest).toBe(.01)
    expect(plane.material.side).toBe(THREE.DoubleSide)
    expect(plane.material.toneMapped).toBe(false)
    expect(plane.castShadow).toBe(false)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
  })

  it('loads independent textures so disposing a duplicate preserves the other image', async () => {
    const firstTexture = decodedTexture(400, 200)
    const secondTexture = decodedTexture(400, 200)
    const firstDispose = vi.spyOn(firstTexture, 'dispose')
    const secondDispose = vi.spyOn(secondTexture, 'dispose')
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValueOnce(firstTexture).mockResolvedValueOnce(secondTexture)
    const first = await loadImagePlane(asset)
    const second = await loadImagePlane(asset)
    disposeObject(first.root)
    expect(firstDispose).toHaveBeenCalledOnce()
    expect(secondDispose).not.toHaveBeenCalled()
    expect((second.root.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.map).toBe(secondTexture)
  })

  it('rejects wrong image dimensions and releases the decoded texture', async () => {
    const texture = decodedTexture(1, 1)
    const dispose = vi.spyOn(texture, 'dispose')
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture)
    await expect(loadImagePlane(asset)).rejects.toThrow('dimensions')
    expect(dispose).toHaveBeenCalledOnce()
  })
})
