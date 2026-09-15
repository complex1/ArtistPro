import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

it('writes a complete looping GIF with multiple color frames and per-frame timing', async () => {
  const replies: { type: string; buffer?: ArrayBuffer; message?: string }[] = []
  const worker = {
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
    postMessage: (reply: {
      type: string
      buffer?: ArrayBuffer
      message?: string
    }) => replies.push(reply),
  }
  vi.stubGlobal('self', worker)
  await import('./animationEncoder.worker')
  worker.onmessage!({ data: { type: 'init', width: 2, height: 2 } })
  for (const [color, delay] of [
    [[255, 0, 0, 255], 40],
    [[0, 0, 255, 255], 50],
  ] as const) {
    const rgba = new Uint8ClampedArray([...color, ...color, ...color, ...color])
    worker.onmessage!({ data: { type: 'frame', rgba: rgba.buffer, delay } })
  }
  worker.onmessage!({ data: { type: 'finish' } })
  expect(replies.map((reply) => reply.type)).toEqual([
    'ready',
    'frame',
    'frame',
    'result',
  ])
  const bytes = new Uint8Array(replies.at(-1)!.buffer!)
  expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
  expect(bytes.at(-1)).toBe(0x3b)
  expect(new TextDecoder().decode(bytes)).toContain('NETSCAPE2.0')

  // Read the GIF container independently of the encoder to verify actual stored
  // delays, image descriptors, and palettes (rather than only encoder arguments).
  const paletteSize = (packed: number) => 3 * (1 << ((packed & 7) + 1))
  let offset = 13 + (bytes[10] & 0x80 ? paletteSize(bytes[10]) : 0)
  const delays: number[] = []
  let frames = 0
  const skipBlocks = () => {
    while (bytes[offset]) offset += bytes[offset] + 1
    offset++
  }
  while (offset < bytes.length && bytes[offset] !== 0x3b) {
    const marker = bytes[offset++]
    if (marker === 0x21) {
      const label = bytes[offset++]
      if (label === 0xf9)
        delays.push((bytes[offset + 2] | (bytes[offset + 3] << 8)) * 10)
      skipBlocks()
    } else if (marker === 0x2c) {
      const packed = bytes[offset + 8]
      offset += 9 + (packed & 0x80 ? paletteSize(packed) : 0)
      offset++ // LZW minimum code size.
      skipBlocks()
      frames++
    } else throw new Error(`Unexpected GIF block ${marker}.`)
  }
  expect(frames).toBe(2)
  expect(delays).toEqual([40, 50])
})
