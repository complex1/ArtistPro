import { describe, expect, it } from 'vitest'
import security from './security.cjs'

describe('desktop trust boundary', () => {
  it('allows hash navigation only inside the packaged entrypoint', () => {
    const options = { indexPath: '/app/dist/index.html' }
    expect(security.isTrustedRenderer('file:///app/dist/index.html?apiBase=x#/svg', options)).toBe(true)
    for (const url of ['file:///app/other.html', 'https://example.com/', 'data:text/html,hello']) {
      expect(security.isTrustedRenderer(url, options)).toBe(false)
    }
  })
  it('checks the exact development origin and entrypoint', () => {
    const options = { devUrl: 'http://127.0.0.1:5173' }
    expect(security.isTrustedRenderer('http://127.0.0.1:5173/#/paint', options)).toBe(true)
    expect(security.isTrustedRenderer('http://127.0.0.1:51730/', options)).toBe(false)
    expect(security.isTrustedRenderer('http://127.0.0.1:5173/other', options)).toBe(false)
  })
  it('rejects executable URLs and embedded credentials', () => {
    for (const url of ['javascript:alert(1)', 'file:///tmp/script', 'https://user:secret@example.com', 'bad']) {
      expect(security.isSafeExternalUrl(url)).toBe(false)
    }
    expect(security.isSafeExternalUrl('https://github.com/complex1/ArtistPro')).toBe(true)
  })
  it('limits tool windows to known application routes', () => {
    for (const hash of ['#/', '#/paint/playground/brush-1', '#/svg/project%20name', '#/anime-3d']) {
      expect(security.isToolHash(hash)).toBe(true)
    }
    for (const hash of ['https://example.com', '#/unknown', '#/svg/../../other', '#/svg/<script>']) {
      expect(security.isToolHash(hash)).toBe(false)
    }
  })
})
