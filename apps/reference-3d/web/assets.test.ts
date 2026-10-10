import { describe, expect, it } from 'vitest'
import { validateGlb } from './assets'

function glb(json: object) {
  const encoded = new TextEncoder().encode(JSON.stringify(json))
  const padded = Math.ceil(encoded.length / 4) * 4
  const result = new Uint8Array(20 + padded).fill(32)
  const view = new DataView(result.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, result.length, true)
  view.setUint32(12, padded, true)
  view.setUint32(16, 0x4e4f534a, true)
  result.set(encoded, 20)
  return result.buffer
}

describe('GLB import boundaries', () => {
  it('accepts binary and embedded resources', () => {
    expect(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 36 }], images: [{ uri: 'data:image/png;base64,abc' }] }))).not.toThrow()
  })
  it('blocks remote and relative resources before a loader can fetch them', () => {
    for (const uri of ['https://example.com/texture.png', '../texture.png', 'file:///tmp/model.bin']) {
      expect(() => validateGlb(glb({ images: [{ uri }] }))).toThrow('external files')
      expect(() => validateGlb(glb({ buffers: [{ uri }] }))).toThrow('external files')
    }
  })
  it('reports unsupported compression and malformed files', () => {
    expect(() => validateGlb(glb({ extensionsRequired: ['KHR_draco_mesh_compression'] }))).toThrow('compressed')
    expect(() => validateGlb(new ArrayBuffer(12))).toThrow('valid GLB')
    const wrongLength = glb({ asset: { version: '2.0' } })
    new DataView(wrongLength).setUint32(8, 999, true)
    expect(() => validateGlb(wrongLength)).toThrow('glTF 2.0')
  })
})
