/** Real UI smoke tests and documentation captures; never touches personal projects. */
import { app, BrowserWindow } from 'electron'
import { createServer as createViteServer } from 'vite'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { root, venvPython } from './python.mjs'
import { verifySvgClock } from './svg-clock-smoke.mjs'

const require = createRequire(import.meta.url)
const screenshots = process.argv.includes('--screenshots')
const reportPath = process.env.ARTIST_QA_REPORT || path.join(root, 'build/qa/suite-browser.json')
let profile
app.on('window-all-closed', () => {})
let window, server, backend
const results = [], errors = []
const watchdog = setTimeout(() => { console.error('Suite smoke tests timed out'); app.exit(1) }, 180_000)

async function freePort() {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  return port
}
const evaluate = code => window.webContents.executeJavaScript(code)
const wait = async (expression, label) => {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (await evaluate(`Promise.resolve(${expression}).then(Boolean)`)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${label}; ${await evaluate('document.body.innerText.slice(-1200)')}`)
}
async function click(text) {
  await evaluate(`(() => {
    const node = [...document.querySelectorAll('button')].find(n => n.textContent.trim().includes(${JSON.stringify(text)}) || n.getAttribute('aria-label') === ${JSON.stringify(text)});
    if (!node || node.disabled) throw new Error('Unavailable control: ' + ${JSON.stringify(text)});
    node.click();
  })()`)
}
function check(condition, label) {
  if (!condition) throw new Error(label)
  results.push(label); console.log('PASS ' + label)
}
async function capture(id, name) {
  if (!screenshots) return
  await evaluate('document.fonts.ready')
  await new Promise(resolve => setTimeout(resolve, 350))
  const folder = path.join(root, 'docs/screenshots', id)
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, name + '.png'), (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG())
}
async function stroke(selector, offset = 0) {
  const rect = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
  const x = Math.round(rect.x + rect.w * .3), y = Math.round(rect.y + rect.h * .45 + offset)
  window.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 20; i++) {
    window.webContents.sendInputEvent({ type: 'mouseMove', x: x + i * 12, y: y + Math.round(Math.sin(i / 3) * 40), button: 'left' })
    await new Promise(resolve => setTimeout(resolve, 16))
  }
  window.webContents.sendInputEvent({ type: 'mouseUp', x: x + 240, y: y + Math.round(Math.sin(20 / 3) * 40), button: 'left', clickCount: 1 })
}

async function run() {
try {
  profile = await mkdtemp(path.join(tmpdir(), 'artist-suite-'))
  app.setPath('userData', profile)
  await mkdir(path.join(profile, 'appData'))
  app.setPath('appData', path.join(profile, 'appData'))
  await app.whenReady()
  const port = await freePort()
  backend = spawn(venvPython, ['-m', 'uvicorn', 'backend.host.main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: { ...process.env, PYTHONPATH: root, ARTIST_DATA_ROOT: path.join(profile, 'api'), ARTIST_REPO_ROOT: root }, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let backendError = ''
  backend.stderr.on('data', chunk => { backendError += chunk })
  backend.on('error', error => { backendError += error.message })
  const apiBase = `http://127.0.0.1:${port}`
  let healthy = false
  for (let i = 0; i < 100; i++) {
    try { healthy = (await fetch(apiBase + '/health')).ok } catch {}
    if (healthy) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  check(healthy, 'Isolated backend starts: ' + (healthy ? 'healthy' : backendError))
  server = await createViteServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false }, logLevel: 'error' })
  await server.listen()
  const url = server.resolvedUrls.local[0] + '?apiBase=' + encodeURIComponent(apiBase)
  const runtime = require('../apps/tappilot/electron/runtime.cjs')
  await runtime.initialize({ isDev: true, getWindows: () => [window].filter(Boolean), validateSender: event => {
    if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Unexpected sender')
  } })
  window = new BrowserWindow({ show: false, width: 1440, height: 1000, useContentSize: true, webPreferences: { preload: path.join(root, 'apps/desktop/electron/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  window.webContents.on('render-process-gone', (_event, detail) => errors.push('Renderer exited: ' + detail.reason))
  window.webContents.on('console-message', ({ level, message }) => { if (level === 'error') { errors.push(message); console.error('Renderer: ' + message) } })
  await window.loadURL(url + '#/')
  await wait("document.querySelector('.home-tool-card')", 'suite home')
  check(await evaluate("document.title === 'Artist Studio' && document.querySelectorAll('.home-tool-card').length === 9"), 'Home lists all nine tools under Artist Studio')
  await capture('desktop', 'home')

  // Rasterize the project-owned vector mark for desktop packaging.
  if (screenshots) {
    const svg = await readFile(path.join(root, 'public/artist-studio.svg'), 'utf8')
    const icon = await evaluate(`(async () => { const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(${JSON.stringify(svg)}); await image.decode(); const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; canvas.getContext('2d').drawImage(image, 0, 0, 512, 512); return canvas.toDataURL('image/png').split(',')[1]; })()`)
    await writeFile(path.join(root, 'public/artist-studio.png'), Buffer.from(icon, 'base64'))
  }

  const tools = [
    { id: 'svg-tool', route: 'svg', home: '.lp-root, .lp-shell', create: 'Create canvas', editor: '.app-shell', library: '/apps/svg-tool/web/projects/library.ts' },
    { id: 'animated-paint', route: 'paint', home: '.lp-root, .lp-shell', create: 'Create canvas', editor: '.paint-workspace', library: '/apps/animated-paint/web/paint/v2/library.ts', get: 'getPaintProjectV2' },
    { id: 'cel', route: 'cel', home: '.lp-root, .lp-shell', create: 'Create project', editor: '.cel-empty', library: '/apps/cel/web/projects/library.ts' },
    { id: 'drawing-canvas', route: 'drawing-canvas', home: '.dc-home-shell', create: 'Create canvas', editor: '.dc-workspace', library: '/apps/drawing-canvas/web/library.ts' },
    { id: 'frame-by-frame', route: 'frame-by-frame', home: '.fbf-home', create: 'Explore a bouncing ball study', editor: '.fbf-editor', library: '/apps/frame-by-frame/web/library.ts' },
    { id: 'live-character', route: 'live-character', home: '.lch-shell', create: 'Try a starter rig', editor: '.lc-editor-body', library: '/apps/live-character/web/library.ts' },
    { id: 'reference-3d', route: 'reference-3d', home: '.ref-home', create: 'Create scene', editor: '.ref-workspace', library: '/apps/reference-3d/web/library.ts' },
    { id: 'anime-3d', route: 'anime-3d', home: '.an-home', create: 'Try First wave', editor: '.an-editor', library: '/apps/anime-3d/web/library.ts' },
  ]
  for (const tool of tools) {
    await window.loadURL(url + '#/' + tool.route)
    await wait(`document.querySelector(${JSON.stringify(tool.home)})`, tool.id + ' home')
    check(await evaluate('document.title.includes(' + JSON.stringify('Artist Studio') + ')'), tool.id + ' home opens')
    await capture(tool.id, 'home')
    await click(tool.create)
    await wait(`location.hash.split('/').length >= 3 && document.querySelector(${JSON.stringify(tool.editor)})`, tool.id + ' editor')
    const id = await evaluate("decodeURIComponent(location.hash.split('/').at(-1))")
    const get = `((await import(${JSON.stringify(tool.library)})).${tool.get || 'getProject'}(${JSON.stringify(id)}))`
    check(await evaluate(`(async () => Boolean((await ${get})?.document))()`), tool.id + ' project creation commits to storage')
    if (tool.id === 'svg-tool') {
      await evaluate(`(async () => {
        const { useEditorStore } = await import('/apps/svg-tool/web/store/editorStore.ts');
        const { importSvgText } = await import('/apps/svg-tool/web/model/svgImport.ts');
        useEditorStore.getState().addNodes(importSvgText('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect x="100" y="90" width="520" height="390" rx="70" fill="#b8ed84"/><circle cx="440" cy="235" r="85" fill="#f0ad73"/><path d="M150 410 Q300 140 570 405" fill="none" stroke="#243d31" stroke-width="30"/></svg>'));
      })()`)
      await wait(`(async () => (await ${get}).document.children.length >= 3)()`, 'SVG autosave')
      check(true, 'SVG edits autosave through the local API')
      await verifySvgClock(evaluate, wait, check)
    }
    if (tool.id === 'animated-paint') {
      await wait("document.querySelector('canvas[aria-label=\"Living paint canvas\"]')", 'paint canvas')
      await wait("!document.querySelector('.paint-workspace').inert", 'paint input ready')
      await stroke('canvas[aria-label=\"Living paint canvas\"]', 0)
      await wait(`(async () => (await ${get}).document.layers.some(layer => layer.strokes?.length > 0))()`, 'paint stroke saved')
      check(true, 'Animated Paint pointer strokes autosave')
    }
    if (tool.id === 'cel') {
      await evaluate(`(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const c = canvas.getContext('2d'); c.fillStyle = '#f4e9d3'; c.fillRect(0,0,320,240); c.fillStyle = '#85a892'; c.fillRect(50,50,200,140); c.fillStyle = '#263c32'; c.fillRect(80,110,30,30); c.fillRect(190,110,30,30);
        const blob = await new Promise(resolve => canvas.toBlob(resolve)); const files = new DataTransfer(); files.items.add(new File([blob], 'original-demo.png', { type: 'image/png' }));
        const input = document.querySelector('.cel-file'); input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await wait("[...document.querySelectorAll('button')].some(n => n.textContent.trim() === 'SVG' && !n.disabled)", 'Cel vector trace')
      check(true, 'Cel uploads and traces a real PNG with enabled SVG export')
    }
    if (tool.id === 'drawing-canvas') {
      await wait("document.querySelector('canvas[aria-label=\"Drawing canvas\"]')", 'drawing canvas ready')
      await stroke('canvas[aria-label=\"Drawing canvas\"]', 0)
      await wait(`(async () => (await ${get}).document.layers.some(layer => layer.dataUrl))()`, 'drawing saved')
      check(true, 'Drawing Canvas pointer strokes commit to storage')
    }
    await capture(tool.id, 'editor')
    const saved = await evaluate(`(async () => JSON.stringify((await ${get}).document))()`)
    if (screenshots) {
      await mkdir(path.join(root, 'docs/samples'), { recursive: true })
      await writeFile(path.join(root, 'docs/samples', tool.id + '.json'), JSON.stringify(JSON.parse(saved), null, 2) + '\n')
    }
    await window.reload()
    await wait(`document.querySelector(${JSON.stringify(tool.id === 'cel' ? '.cel-layout' : tool.editor)})`, tool.id + ' reopened')
    check(await evaluate(`(async () => JSON.stringify((await ${get}).document) === ${JSON.stringify(saved)})()`), tool.id + ' survives renderer reload')
  }
  await window.loadURL(url + '#/paint/playground')
  await wait("document.querySelector('.brush-library-page')", 'brush library')
  await wait("document.querySelector('.brush-card-preview')", 'brush preview cards')
  await evaluate("document.querySelector('.brush-card-preview').click()")
  await wait("document.querySelector('.brush-editor-page')", 'brush playground')
  check(true, 'Brush playground opens with the live procedural editor')
  await capture('animated-paint', 'playground')
  await window.loadURL(url + '#/tappilot')
  await wait("[...document.querySelectorAll('div')].some(n => n.shadowRoot?.querySelector('.home-command-center'))", 'TapPilot home')
  await capture('tappilot', 'home')
  check((await evaluate('window.tapPilot.listProfiles()')).length === 0, 'TapPilot starts with an isolated empty profile store')
  await evaluate("[...document.querySelectorAll('div')].find(n => n.shadowRoot?.querySelector('.template-use')).shadowRoot.querySelector('.template-use').click()")
  await wait("[...document.querySelectorAll('div')].some(n => n.shadowRoot?.querySelector('.editor-root'))", 'TapPilot editor')
  const profiles = await evaluate('window.tapPilot.listProfiles()')
  check(profiles.length === 1 && !profiles[0].published, 'TapPilot creates an unpublished starter deck through real IPC')
  await capture('tappilot', 'editor')
  await window.reload()
  await wait("[...document.querySelectorAll('div')].some(n => n.shadowRoot?.querySelector('.home-command-center'))", 'TapPilot reload')
  check((await evaluate('window.tapPilot.listProfiles()')).length === 1, 'TapPilot profiles survive renderer reload')
  check(!(await evaluate('window.tapPilot.getServerInfo()')).running, 'TapPilot LAN server stays off until explicitly started')
  await runtime.shutdown()
  check(errors.length === 0, 'No renderer crashes or console errors: ' + errors.join('; '))
  console.log(`${results.length} suite browser checks passed.`)
} catch (error) {
  console.error(error)
  errors.push(String(error))
  if (window && !window.isDestroyed()) await writeFile(path.join(tmpdir(), 'artist-suite-failure.png'), (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG())
  process.exitCode = 1
} finally {
  clearTimeout(watchdog)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify({ date: new Date().toISOString(), platform: process.platform, arch: process.arch, screenshots, passed: results, errors }, null, 2) + '\n')
  window?.destroy()
  await server?.close()
  if (backend) { backend.kill(); await new Promise(resolve => { if (backend.exitCode !== null) resolve(); else backend.once('exit', resolve) }) }
  await require('../apps/tappilot/electron/runtime.cjs').shutdown().catch(() => {})
  await rm(profile, { recursive: true, force: true })
  app.exit(process.exitCode || 0)
}

}
void run().catch(error => { console.error(error); app.exit(1) })
