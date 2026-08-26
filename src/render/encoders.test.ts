import { describe, expect, it, vi } from 'vitest'
import type { VideoCodec } from 'mediabunny'
import { unzipSync } from 'fflate'
import { frameFilename, ImageSequenceEncoder } from './imageSequence'
import { selectVideoFormat } from './videoEncoder'

describe('output encoders', () => {
  it('uses deterministic one-based image sequence filenames', () => {
    expect(frameFilename(0)).toBe('frame_000001.png')
    expect(frameFilename(41)).toBe('frame_000042.png')
    expect(frameFilename(999_999)).toBe('frame_1000000.png')
  })

  it('writes PNG frames into the ZIP in deterministic order', async () => {
    const canvas = {
      toBlob(callback: BlobCallback) {
        callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
      },
    } as unknown as HTMLCanvasElement
    const encoder = new ImageSequenceEncoder()
    await encoder.add(canvas, 0)
    await encoder.add(canvas, 1)
    const archive = unzipSync(new Uint8Array(await (await encoder.finish()).arrayBuffer()))

    expect(Object.keys(archive)).toEqual([
      'frame_000001.png',
      'frame_000002.png',
    ])
    expect(Array.from(archive['frame_000001.png'] ?? [])).toEqual([1, 2, 3])
  })

  it('prefers AVC in MP4 when available', async () => {
    const probe = vi.fn(async (codecs: VideoCodec[]) => codecs[0] ?? null)
    await expect(selectVideoFormat(1280, 720, probe)).resolves.toEqual({
      codec: 'avc',
      extension: 'mp4',
      mimeType: 'video/mp4',
    })
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('falls back to WebM when AVC is unavailable', async () => {
    const probe = vi.fn(async (codecs: VideoCodec[]) =>
      codecs.includes('avc') ? null : 'vp9' as const,
    )
    await expect(selectVideoFormat(801, 601, probe)).resolves.toEqual({
      codec: 'vp9',
      extension: 'webm',
      mimeType: 'video/webm',
    })
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('returns null when no preferred codec can be encoded', async () => {
    await expect(
      selectVideoFormat(1280, 720, async () => null),
    ).resolves.toBeNull()
  })
})
