/** Real Chromium controls, WebGL drawing/export, and isolated IndexedDB persistence. */
import { app, BrowserWindow } from 'electron'
import { createServer } from 'vite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
app.on('window-all-closed', () => {})

async function run() {
  const profile = await mkdtemp(path.join(tmpdir(), 'anime-3d-test-'))
  app.setPath('userData', profile)
  await app.whenReady()
  const watchdog = setTimeout(() => { console.error('Anime 3D browser checks timed out.'); app.exit(1) }, 90_000)
  let server, window, exitCode = 0
  try {
    server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false }, logLevel: 'error' })
    await server.listen()
    window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { backgroundThrottling: false } })
    await window.loadURL(server.resolvedUrls.local[0] + '#/anime-3d')
    const evaluate = code => window.webContents.executeJavaScript(code)
    const results = []

    console.log('Checking shot creation, current-frame posing, held keys, and undo…')
    results.push(...await evaluate(`(${async function () {
      window.anWait = async (condition, label) => {
        const deadline = performance.now() + 10_000
        while (performance.now() < deadline) {
          if (await condition()) return
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        throw new Error('Timed out: ' + label + '; ' + document.body.textContent.slice(-1800))
      }
      window.anTick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      window.anClick = (label, selector = 'button') => {
        const node = [...document.querySelectorAll(selector)].find(node => node.textContent.trim() === label || node.getAttribute('aria-label') === label)
        if (!node || node.disabled) throw new Error('Missing or disabled control: ' + label)
        node.click()
      }
      window.anSetValue = (node, value) => {
        if (!node) throw new Error('Missing input')
        const type = node instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
        Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(node, value)
        node.dispatchEvent(new Event(type === HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
      }
      window.anSave = async () => { await anTick(); anClick('Save now'); await anTick(); await anWait(() => document.querySelector('.an-save-state.saved'), 'shot saved') }
      window.anScrub = async frame => { document.querySelector('[data-frame="' + frame + '"]').click(); await anTick() }
      window.anLibrary = await import('/apps/anime-3d/web/library.ts')
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      await anWait(() => document.querySelector('.an-home'), 'Anime 3D home')
      anSetValue(document.querySelector('.an-hero input'), 'Browser wave')
      await anTick(); anClick('New shot')
      await anWait(() => document.querySelector('.an-viewport-wrap canvas'), '3D editor canvas')
      await anTick()
      window.anProjectId = decodeURIComponent(location.hash.split('/').at(-1))
      window.anGet = async () => (await anLibrary.getProject(anProjectId)).document
      const canvas = document.querySelector('.an-viewport-wrap canvas')
      check(document.title === 'Anime 3D — Artist Studio' && canvas.width > 200 && canvas.height > 200, 'New shot opens a real WebGL canvas with the Anime 3D window title')
      check((await anGet()).keys.length === 1, 'A newly created shot starts with a single frame-1 pose')
      await anScrub(9); anClick('Wave', '.an-pose-presets button'); await anSave()
      check((await anGet()).keys.some(key => key.frame === 9 && key.pose.leftUpperArm[2] === 145), 'Applying Wave auto-keys the whole character at the selected frame 9')
      anSetValue(document.querySelector('.an-inspector select'), 'leftUpperArm'); await anTick()
      const z = () => Number(document.querySelectorAll('.an-three-fields input')[2].value)
      await anScrub(8); check(z() === 0, 'Frame 8 keeps the initial pose before the next key')
      await anScrub(9); check(z() === 145, 'Frame 9 displays its keyed joint rotation')
      await anScrub(16); check(z() === 145, 'Frame 16 holds the frame-9 pose without interpolation')
      anClick('Undo'); await anSave()
      check((await anGet()).keys.length === 1 && z() === 0, 'Undo removes the new key and restores the previous held pose')
      anClick('Redo'); await anSave()
      check((await anGet()).keys.length === 2 && z() === 145, 'Redo restores both the pose key and the visible held pose')
      return results
    }.toString()})()`))

    console.log('Checking ordered autosaves and failed-save navigation protection…')
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      await anScrub(9)
      const before = JSON.stringify((await anGet()).keys)
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('artist-studio-anime-3d', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      let release = false
      const transaction = database.transaction('projects', 'readwrite')
      const completed = new Promise((resolve, reject) => {
        transaction.oncomplete = resolve
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error ?? new Error('Test transaction aborted'))
      })
      const keepAlive = () => {
        const request = transaction.objectStore('projects').get(anProjectId)
        request.onsuccess = () => { if (!release) keepAlive() }
      }
      keepAlive()
      try {
        anClick('Turn', '.an-pose-presets button')
        await anWait(() => document.querySelector('.an-save-state.saving'), 'pending autosave')
        anClick('Undo'); await anTick()
      } finally {
        release = true
        await completed
        database.close()
      }
      await anWait(() => document.querySelector('.an-save-state.saved'), 'ordered autosaves completed')
      check(JSON.stringify((await anGet()).keys) === before, 'Undo during a blocked autosave persists the newest restored pose after queued writes complete')

      const originalPut = IDBObjectStore.prototype.put
      try {
        IDBObjectStore.prototype.put = function () { throw new DOMException('Storage quota reached in browser smoke test', 'QuotaExceededError') }
        anClick('Turn', '.an-pose-presets button')
        await anWait(() => document.querySelector('.an-save-state.failed'), 'failed-save feedback')
        check(document.querySelector('[role="alert"]').textContent.includes('current shot is still open'), 'A failed save shows recovery actions while preserving the editable shot')
        const ownHash = location.hash
        location.hash = '#/anime-3d'
        await anWait(() => location.hash === ownHash, 'failed navigation restored')
        check(Boolean(document.querySelector('.an-editor')) && Boolean(document.querySelector('.an-save-state.failed')), 'Hash navigation cannot discard a shot after a failed save')
      } finally { IDBObjectStore.prototype.put = originalPut }
      anClick('Retry save'); await anTick()
      await anWait(() => document.querySelector('.an-save-state.saved'), 'save retry')
      check((await anGet()).keys.find(key => key.frame === 9).pose.leftHand[1] === -40, 'Retry save commits the retained pose after storage recovers')
      anClick('Draw', '.an-workflows button'); await anTick()
      return results
    }.toString()})()`))

    console.log('Checking real pointer strokes in world space…')
    const bounds = await evaluate(`(() => { const r = document.querySelector('.an-viewport-wrap canvas').getBoundingClientRect(); return { x: Math.round(r.left + r.width * .22), y: Math.round(r.top + r.height * .4) } })()`)
    window.webContents.sendInputEvent({ type: 'mouseMove', ...bounds })
    window.webContents.sendInputEvent({ type: 'mouseDown', ...bounds, button: 'left', clickCount: 1 })
    await evaluate('anTick()')
    for (let i = 1; i <= 8; i++) {
      window.webContents.sendInputEvent({ type: 'mouseMove', x: bounds.x + i * 12, y: bounds.y + i * 5, button: 'left' })
      await evaluate('anTick()')
    }
    window.webContents.sendInputEvent({ type: 'mouseUp', x: bounds.x + 96, y: bounds.y + 40, button: 'left', clickCount: 1 })
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      await anWait(() => document.querySelector('.an-stroke-list button'), 'committed pointer stroke')
      await anSave()
      const stroke = (await anGet()).strokes[0]
      check(stroke.points.length >= 3 && stroke.points.every(point => point.length === 3 && point.every(Number.isFinite) && Math.abs(point[2]) < .000001), 'Pointer drawing creates finite 3D vertices on the chosen front plane')
      check(Math.abs(stroke.points[0][0] - stroke.points.at(-1)[0]) > .1 && stroke.width > 0, 'The persisted world stroke retains the actual drag path and brush width')
      anClick('Undo'); await anSave()
      check((await anGet()).strokes.length === 0, 'Undo removes a complete drawn stroke as one operation')
      anClick('Redo'); await anSave()
      check(JSON.stringify((await anGet()).strokes[0]) === JSON.stringify(stroke), 'Redo restores the original world-space stroke without resampling')
      return results
    }.toString()})()`))

    console.log('Checking camera capture, helper-free PNG pixels, and project reopen…')
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      anClick('Camera', '.an-workflows button'); await anTick()
      const initialCamera = JSON.stringify((await anGet()).camera)
      anClick('Front', '.an-camera-presets button'); await anTick(); await anSave()
      check(JSON.stringify((await anGet()).camera) === initialCamera, 'Changing an Explore angle leaves the saved shot camera untouched')
      anClick('Use this view for shot'); await anSave()
      const capturedCamera = JSON.stringify((await anGet()).camera)
      check(capturedCamera !== initialCamera && document.querySelector('.an-view-switch .active')?.textContent.includes('Shot preview'), 'Capture saves the current Explore camera and switches to shot preview')
      anClick('Side', '.an-camera-presets button'); await anTick(); await anSave()
      check(JSON.stringify((await anGet()).camera) === capturedCamera, 'Exploring again preserves the captured output composition')
      anClick('Render', '.an-workflows button'); await anTick()
      const toggle = label => {
        const control = [...document.querySelectorAll('.an-toggle')].find(node => node.textContent.trim() === label)?.querySelector('input')
        if (!control) throw new Error('Missing toggle ' + label)
        control.click()
      }
      toggle('Ground in render'); await anTick()
      toggle('Transparent background'); await anSave()

      const originalClick = HTMLAnchorElement.prototype.click
      let exported
      HTMLAnchorElement.prototype.click = function () { if (this.download) exported = { href: this.href, filename: this.download }; else originalClick.call(this) }
      try {
        const render = async () => {
          exported = undefined
          anClick('Export PNG'); await anWait(() => document.querySelector('.an-dialog[open]'), 'export dialog')
          anClick('Render & download'); await anWait(() => exported, 'PNG download')
          const blob = await (await fetch(exported.href)).blob()
          const bitmap = await createImageBitmap(blob)
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
          const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close()
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))].map(byte => byte.toString(16).padStart(2, '0')).join('')
          const output = { width: canvas.width, height: canvas.height, pixels, hash, filename: exported.filename }
          anClick('Back to shot'); await anTick()
          return output
        }
        const first = await render()
        let opaque = 0, transparent = 0, colored = 0
        for (let i = 0; i < first.pixels.length; i += 4) {
          if (first.pixels[i + 3] > 200) opaque++
          if (first.pixels[i + 3] === 0) transparent++
          if (first.pixels[i + 3] > 200 && Math.max(...first.pixels.slice(i, i + 3)) - Math.min(...first.pixels.slice(i, i + 3)) > 20) colored++
        }
        check(first.width === 1280 && first.height === 720 && first.filename === 'Browser wave-frame-09.png', 'The export dialog downloads a named PNG at the promised 1280 × 720 size')
        check(opaque > 2000 && colored > 1000 && transparent > first.width * first.height * .75 && first.pixels[3] === 0 && first.pixels.at(-1) === 0, 'Real PNG pixels contain the colored rig and a transparent background without viewport guides')
        anClick('Camera', '.an-workflows button'); await anTick()
        anClick('Top', '.an-camera-presets button'); await anTick()
        const second = await render()
        check(first.hash === second.hash, 'Exploring a different angle leaves exported shot pixels identical')
      } finally { HTMLAnchorElement.prototype.click = originalClick }

      await anSave()
      const saved = JSON.stringify(await anGet())
      anClick('Studio'); await anWait(() => document.querySelector('.an-home'), 'return to studio')
      await anWait(() => document.querySelector('.an-project-open'), 'saved project gallery card')
      check(document.querySelector('.an-project-open strong').textContent === 'Browser wave', 'The locally saved shot appears in the studio gallery')
      document.querySelector('.an-project-open').click()
      await anWait(() => document.querySelector('.an-viewport-wrap canvas'), 'reopened 3D editor')
      await anTick()
      check(JSON.stringify(await anGet()) === saved && document.querySelector('[aria-label="Shot name"]').value === 'Browser wave', 'Reopening preserves pose keys, drawing vertices, output settings, and shot camera exactly')
      return results
    }.toString()})()`))

    for (const result of results) console.log('PASS ' + result)
    console.log(results.length + ' Anime 3D Chromium checks passed.')
  } catch (error) {
    console.error(error); exitCode = 1
    if (window && !window.isDestroyed()) {
      const screenshot = path.join(tmpdir(), 'anime-3d-browser-failure.png')
      await writeFile(screenshot, (await window.webContents.capturePage()).toPNG()).catch(() => {})
      console.error('Failure screenshot: ' + screenshot)
    }
  } finally {
    clearTimeout(watchdog)
    window?.destroy()
    await server?.close()
    await rm(profile, { recursive: true, force: true }).catch(() => {})
    app.exit(exitCode)
  }
}

void run().catch(error => { console.error(error); app.exit(1) })
