/** Real pixels, encoders, editor input, and IndexedDB in an isolated Chromium profile. */
import { app, BrowserWindow } from 'electron'
import { createServer } from 'vite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runFeedbackChecks } from './feedback-checks.mjs'
import { runInbetweenChecks } from './inbetween-checks.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
app.on('window-all-closed', () => {})
async function run() {
const profile = await mkdtemp(path.join(tmpdir(), 'frame-by-frame-test-'))
app.setPath('userData', profile)
await app.whenReady()
const watchdog = setTimeout(() => { console.error('FrameByFrame browser checks timed out.'); app.exit(1) }, 120_000)
let server, window, exitCode = 0
try {
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false }, logLevel: 'error' })
  await server.listen()
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false } })
  await window.loadURL(server.resolvedUrls.local[0])
  const evaluate = code => window.webContents.executeJavaScript(code)
  console.log('Checking raster output and animation encoders…')
  const results = await evaluate(`(${async function () {
    const { createDocument } = await import('/apps/frame-by-frame/web/model.ts')
    const { FrameRenderer, exportAnimation } = await import('/apps/frame-by-frame/web/raster.ts')
    const { unzipSync } = await import('/node_modules/.vite/deps/fflate.js')
    const results = []
    const check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
    const make = color => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(8, 8, 24, 24)
      return canvas.toDataURL()
    }
    const doc = createDocument('Pixel shot', 64, 64, 12)
    doc.background = null; doc.duration = 4
    const red = make('#ff0000'), blue = make('#0000ff')
    doc.layers[0].cels = [{ id: 'a', start: 0, duration: 2, dataUrl: red, thumbnail: null }, { id: 'b', start: 2, duration: 2, dataUrl: blue, thumbnail: null }]
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
    const renderer = new FrameRenderer()
    const pixel = (x = 16, y = 16) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]
    await renderer.render(doc, 0, canvas)
    check(pixel()[0] === 255 && pixel(0, 0)[3] === 0, 'Composite preserves colored artwork and transparent background')
    await renderer.render(doc, 1, canvas)
    check(pixel()[0] === 255 && pixel()[2] === 0, 'A held drawing stays unchanged across its exposure')
    await renderer.render(doc, 2, canvas)
    check(pixel()[2] === 255 && pixel()[0] === 0, 'Composite switches to the next drawing on the exact frame boundary')
    doc.layers.push({ id: 'overlay', name: 'Overlay', visible: true, locked: false, opacity: .5, cels: [{ id: 'c', start: 0, duration: 4, dataUrl: blue, thumbnail: null }] })
    await renderer.render(doc, 0, canvas)
    check(Math.abs(pixel()[0] - 127) <= 1 && Math.abs(pixel()[2] - 128) <= 1, 'Layers composite in order with independent opacity')
    doc.layers[1].visible = false
    await renderer.render(doc, 0, canvas)
    check(pixel()[0] === 255 && pixel()[2] === 0, 'Hidden layers are absent from exported frames')
    let progress = 0
    const zip = await exportAnimation(doc, 'sequence', new AbortController().signal, value => { progress = value })
    const entries = Object.entries(unzipSync(new Uint8Array(await zip.blob.arrayBuffer()))).sort()
    check(entries.length === 4 && entries.every(([name]) => name.endsWith('.png')) && progress === 1, 'PNG sequence exports one numbered PNG for every frame, including holds')
    for (const index of [0, 1, 2, 3]) {
      const image = await createImageBitmap(new Blob([entries[index][1]], { type: 'image/png' }))
      canvas.getContext('2d').clearRect(0, 0, 64, 64); canvas.getContext('2d').drawImage(image, 0, 0); image.close()
      check(pixel()[index < 2 ? 0 : 2] === 255 && pixel(0, 0)[3] === 0, 'PNG sequence frame ' + (index + 1) + ' preserves timing, color, and alpha')
    }
    const gif = await exportAnimation(doc, 'gif', new AbortController().signal, () => {})
    const decoder = new ImageDecoder({ data: await gif.blob.arrayBuffer(), type: 'image/gif' })
    await decoder.tracks.ready
    check(decoder.tracks.selectedTrack.frameCount === 4, 'Animated GIF contains all four scheduled frames')
    const decoded = await decoder.decode({ frameIndex: 2 })
    canvas.getContext('2d').drawImage(decoded.image, 0, 0); decoded.image.close(); decoder.close()
    check(pixel()[2] > 240 && pixel()[0] < 10 && pixel(0, 0)[0] === 255, 'GIF contains the correct pose and an opaque paper background')
    const video = await exportAnimation(doc, 'video', new AbortController().signal, () => {})
    const url = URL.createObjectURL(video.blob), element = document.createElement('video')
    try {
      element.preload = 'auto'; element.src = url
      await new Promise((resolve, reject) => { element.onloadeddata = resolve; element.onerror = () => reject(new Error('Exported video is not playable')) })
      check(video.blob.size > 100 && element.videoWidth === 64 && Math.abs(element.duration - 4 / 12) < .04, 'Exported video plays at the shot dimensions and intended duration')
    } finally { element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url) }
    const abort = new AbortController()
    let cancelled = false
    try { await exportAnimation(doc, 'sequence', abort.signal, () => abort.abort()) } catch (error) { cancelled = error.name === 'AbortError' }
    check(cancelled, 'Cancelling an export stops processing and rejects with AbortError')
    return results
  }.toString()})()`)

  console.log('Checking editor pointer input, timing, and persistence…')
  // Install only test helpers in this isolated renderer. Mouse input below travels through Electron.
  await evaluate(`(${async function () {
    const { createProject, getProject } = await import('/apps/frame-by-frame/web/library.ts')
    const { AnimationSession } = await import('/apps/frame-by-frame/web/session.ts')
    const { DrawingEngine } = await import('/apps/drawing-canvas/web/engine/engine.ts')
    const originalCommit = AnimationSession.prototype.commit
    AnimationSession.prototype.commit = function (doc) { window.fbfSession = this; return originalCommit.call(this, doc) }
    window.fbfWait = async (condition, label) => {
      for (let attempt = 0; attempt < 250; attempt++) { await new Promise(resolve => setTimeout(resolve, 20)); if (await condition()) return }
      throw new Error('Timed out: ' + label + '; ' + document.body.textContent.slice(0, 600))
    }
    window.fbfClick = label => {
      const button = document.querySelector('[aria-label="' + label + '"]')
      if (!button || button.disabled) throw new Error('Missing or disabled control: ' + label)
      button.click()
    }
    window.fbfPixel = (x = 50, y = 50) => [...document.querySelector('.fbf-raster-layer canvas').getContext('2d').getImageData(x, y, 1, 1).data]
    window.fbfReady = () => document.querySelector('.fbf-raster-layer canvas')?.style.visibility === 'visible'
    window.fbfRecord = await createProject('Browser smoke shot', 128, 128, 12)
    window.fbfGetProject = getProject
    window.fbfOriginalPut = IDBObjectStore.prototype.put
    window.fbfOriginalCreate = DrawingEngine.create
    window.fbfEngine = DrawingEngine
    location.hash = '#/frame-by-frame/' + window.fbfRecord.id
    await window.fbfWait(window.fbfReady, 'drawing desk ready')
  }.toString()})()`)
  async function stroke() {
    const { x, y, zoom } = await evaluate(`(() => { const rect = document.querySelector('.fbf-artboard').getBoundingClientRect(); return { x: rect.left, y: rect.top, zoom: rect.width / 128 } })()`)
    const point = value => ({ x: Math.round(x + value * zoom), y: Math.round(y + 50 * zoom) })
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point(25), button: 'left', clickCount: 1 })
    for (let value = 30; value <= 80; value += 5) window.webContents.sendInputEvent({ type: 'mouseMove', ...point(value), button: 'left' })
    window.webContents.sendInputEvent({ type: 'mouseUp', ...point(80), button: 'left', clickCount: 1 })
    await evaluate(`window.fbfWait(() => window.fbfSession?.document.layers[0].cels[0].dataUrl, 'stroke committed')`)
  }
  await stroke()
  results.push(...await evaluate(`(${async function () {
    const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
    check(fbfPixel()[3] > 200, 'Real pointer input draws a continuous stroke in the animation editor')
    fbfClick('Next frame'); await fbfWait(() => document.querySelector('.fbf-timecode strong').textContent === '0002' && fbfReady(), 'held frame')
    check(fbfPixel()[3] > 200, 'Editor holds artwork on the next frame')
    fbfClick('Split drawing'); await fbfWait(() => fbfSession.document.layers[0].cels.length === 2 && fbfReady(), 'split drawing')
    check(fbfSession.document.layers[0].cels.every(cel => cel.duration === 1), 'Splitting a held drawing produces two independent one-frame cels')
    fbfClick('Undo'); await fbfWait(() => fbfSession.document.layers[0].cels.length === 1 && fbfReady(), 'undo split')
    fbfClick('Duplicate drawing'); await fbfWait(() => fbfSession.document.layers[0].cels.length === 2 && fbfReady(), 'duplicate drawing')
    check(fbfPixel()[3] > 200 && fbfSession.document.layers[0].cels[1].start === 2, 'Duplicate drawing inserts editable pixels after the current hold')
    const clear = [...document.querySelectorAll('button')].find(button => button.textContent === 'Clear drawing'); clear.click()
    await fbfWait(() => fbfPixel()[3] === 0, 'clear duplicate')
    fbfClick('First frame'); await fbfWait(() => fbfReady() && fbfPixel()[3] > 200, 'original intact')
    check(fbfPixel()[3] > 200, 'Editing a duplicate leaves the original drawing intact')
    fbfClick('Undo'); await fbfWait(() => fbfReady(), 'restore duplicate')
    fbfClick('Next frame'); await fbfWait(() => document.querySelector('.fbf-timecode strong').textContent === '0002', 'step two'); fbfClick('Next frame'); await fbfWait(() => document.querySelector('.fbf-timecode strong').textContent === '0003' && fbfReady(), 'duplicate again')
    check(fbfPixel()[3] > 200, 'Undo restores the cleared duplicate')
    fbfClick('New drawing'); await fbfWait(() => fbfSession.document.layers[0].cels.length === 3 && fbfReady(), 'new drawing')
    check(fbfPixel()[3] === 0 && document.querySelectorAll('.fbf-onion').length > 0, 'New drawings start transparent with neighboring onion skins')
    fbfClick('Play animation'); await fbfWait(() => document.querySelector('[aria-label="Pause animation"]'), 'playback starts')
    check(document.querySelectorAll('.fbf-onion').length === 0, 'Onion skins disappear during playback')
    const first = document.querySelector('.fbf-timecode strong').textContent
    await fbfWait(() => document.querySelector('.fbf-timecode strong').textContent !== first, 'playhead advances')
    check(true, 'Playback advances the playhead at the shot frame rate')
    fbfClick('Pause animation'); fbfClick('First frame'); await fbfWait(fbfReady, 'stop playback')
    fbfClick('Save project'); await fbfWait(() => !fbfSession.dirty && !fbfSession.saving, 'save completes')
    check((await fbfGetProject(fbfRecord.id)).document.layers[0].cels.length === 3, 'Autosave/manual save persists artwork and timeline to IndexedDB')
    fbfClick('Back to shots'); await fbfWait(() => document.querySelector('.fbf-home'), 'gallery')
    location.hash = '#/frame-by-frame/' + fbfRecord.id
    await fbfWait(() => fbfReady() && fbfPixel()[3] > 200, 'reopen saved drawing')
    check(fbfPixel()[3] > 200 && document.querySelectorAll('.fbf-cel').length === 3, 'Reopening a saved shot restores pixels and all cel exposures')

    // Force slow decoding, then return to the current cel before the new engine loads.
    fbfEngine.create = async function (doc) { await new Promise(resolve => setTimeout(resolve, 100)); return fbfOriginalCreate.call(this, doc) }
    fbfClick('Next frame'); await new Promise(resolve => setTimeout(resolve, 25)); fbfClick('Next frame')
    await fbfWait(() => !fbfReady(), 'slow decoding begins')
    fbfClick('First frame'); await fbfWait(fbfReady, 'return to current engine')
    check(fbfPixel()[3] > 200, 'Rapid scrubbing back during image decoding restores an editable visible canvas')
    fbfEngine.create = fbfOriginalCreate

    ;[...document.querySelectorAll('.fbf-inspector-tabs button')].find(button => button.textContent === 'Shot').click()
    await fbfWait(() => document.querySelector('[aria-label="Current drawing exposure"]'), 'shot timing settings')
    const exposure = document.querySelector('[aria-label="Current drawing exposure"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(exposure, '3')
    exposure.dispatchEvent(new Event('input', { bubbles: true }))
    await fbfWait(() => fbfSession.document.layers[0].cels[0].duration === 3, 'retime exposure')
    check(fbfSession.document.layers[0].cels[1].start === 3 && fbfSession.document.layers[0].cels[2].start === 5, 'Changing exposure in the inspector shifts later drawings on the track')

    const files = new DataTransfer()
    for (const [name, color] of [['pose10.png', '#0000ff'], ['pose2.png', '#00ff00']]) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 128, 128)
      const blob = await new Promise(resolve => canvas.toBlob(resolve))
      files.items.add(new File([blob], name, { type: 'image/png' }))
    }
    const input = document.querySelector('input[type="file"]'); input.files = files.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await fbfWait(() => !document.querySelector('.fbf-progress-overlay') && fbfReady() && fbfPixel()[1] === 255, 'image sequence import')
    check(fbfSession.document.layers[0].cels.length === 4 && fbfPixel()[2] === 0, 'Image import sorts filenames naturally and replaces the selected drawing')
    fbfClick('Go to frame 4'); await fbfWait(() => fbfReady() && fbfPixel()[2] === 255, 'second imported image')
    check(fbfPixel()[1] === 0 && fbfSession.document.layers[0].cels[2].start === 5, 'Subsequent imported images insert cels and preserve later drawings by rippling')

    IDBObjectStore.prototype.put = function () { throw new DOMException('Test quota exceeded', 'QuotaExceededError') }
    fbfClick('New drawing'); await fbfWait(() => document.querySelector('.fbf-shot-name').textContent.includes('Save failed'), 'failed autosave')
    const unsaved = fbfSession.document.layers[0].cels.length
    location.hash = '#/frame-by-frame'
    await fbfWait(() => location.hash.endsWith(fbfRecord.id) && document.querySelector('[role="alert"]')?.textContent.includes('still open'), 'failed navigation guard')
    check(Boolean(document.querySelector('.fbf-editor')) && fbfSession.document.layers[0].cels.length === unsaved, 'Storage failure keeps the editor and unsaved timeline open when navigating away')
    IDBObjectStore.prototype.put = fbfOriginalPut
    fbfClick('Back to shots'); await fbfWait(() => document.querySelector('.fbf-home'), 'save retry and exit')
    check((await fbfGetProject(fbfRecord.id)).document.layers[0].cels.length === unsaved, 'Retry flushes retained changes before leaving the shot')
    return results
  }.toString()})()`))
  console.log('Checking selection tools and track editing…')
  results.push(...await runFeedbackChecks(window))
  console.log('Checking line-art workers, previews, and insertion…')
  results.push(...await runInbetweenChecks(window))
  for (const result of results) console.log('PASS ' + result)
  console.log(results.length + ' FrameByFrame Chromium checks passed.')
} catch (error) {
  console.error(error); exitCode = 1
} finally {
  clearTimeout(watchdog)
  window?.destroy()
  await server?.close()
  await rm(profile, { recursive: true, force: true }).catch(() => {})
  app.exit(exitCode)
}

}
void run().catch(error => { console.error(error); app.exit(1) })
