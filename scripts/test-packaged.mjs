/** Launch the real packaged host with an isolated profile; use its Node inspector
 * only while this local release test runs. No application data is reused. */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const executable = process.argv[2] && path.resolve(process.argv[2])
if (!executable) throw new Error('Usage: node scripts/test-packaged.mjs <packaged executable>')
const profile = await mkdtemp(path.join(tmpdir(), 'artist-package-'))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
let output = '', connection, nextId = 0, contextId
const pending = new Map(), checks = []
const child = spawn(executable, [`--inspect=127.0.0.1:${port}`], {
  env: { ...process.env, ARTIST_PROFILE_DIR: profile, PATH: process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32') : '/usr/bin:/bin', PYTHONPATH: '', VITE_DEV_SERVER_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.on('error', error => { output += String(error) })
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function check(ok, label) {
  if (!ok) throw new Error(label)
  checks.push(label); console.log('PASS ' + label)
}
async function request(method, params = {}) {
  const id = ++nextId
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Inspector evaluation timed out')) }, 25_000)
    pending.set(id, { method, resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    connection.send(JSON.stringify({ id, method, params }))
  })
  return result
}
async function evaluate(expression) {
  const result = await request('Runtime.evaluate', { expression, contextId, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result?.value
}
async function wait(expression, label) {
  for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error('Timed out: ' + label)
}
const renderer = expression => evaluate(`qa.electron.BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(expression)})`)
try {
  let debuggerUrl
  for (let i = 0; i < 150; i++) {
    try { debuggerUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())[0]?.webSocketDebuggerUrl } catch {}
    if (debuggerUrl || child.exitCode !== null) break
    await delay(100)
  }
  if (!debuggerUrl) throw new Error('Packaged inspector unavailable:\n' + output)
  connection = new WebSocket(debuggerUrl)
  await new Promise((resolve, reject) => { connection.once('open', resolve); connection.once('error', reject) })
  connection.on('message', message => {
    const response = JSON.parse(String(message)); const request = pending.get(response.id)
    if (response.method === 'Runtime.executionContextCreated') { contextId = response.params.context.id; if (process.env.ARTIST_QA_DEBUG) console.log(JSON.stringify(response)) }
    if (!request) return
    pending.delete(response.id)
    if (response.error) request.reject(new Error(request.method + ': ' + response.error.message)); else request.resolve(response.result)
  })
  await request('Runtime.enable')
  for (let i = 0; i < 100 && !contextId; i++) await delay(100)
  if (!contextId) throw new Error('Packaged main context did not initialize')
  // Electron's main-process module is built into this executable.
  await evaluate(`globalThis.qa = { electron: process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron'), errors: [] }; true`)
  check(await evaluate('qa.electron.app.isPackaged'), 'Actual packaged Electron host is running')
  check(await evaluate(`qa.electron.app.getPath('userData') === ${JSON.stringify(profile)}`), 'Packaged host uses an isolated profile')
  await wait('qa.electron.BrowserWindow.getAllWindows().length === 1 && !qa.electron.BrowserWindow.getAllWindows()[0].webContents.isLoading()', 'packaged home load')
  await evaluate(`qa.electron.BrowserWindow.getAllWindows()[0].webContents.on('console-message', ({level, message}) => { if (level === 'error') qa.errors.push(message) }); true`)
  check(await renderer("document.title === 'Artist Studio' && document.querySelectorAll('.home-tool-card').length === 9"), 'Built file renderer lists nine tools')
  const apiBase = await renderer('window.artistStudio.getApiBase()')
  const tools = await (await fetch(apiBase + '/v1/tools')).json()
  check(tools.tools.length === 9, 'Packaged frozen backend serves nine manifests without system Python')
  for (const id of ['svg-tool','animated-paint','cel']) check((await fetch(apiBase + `/v1/apps/${id}/projects`)).ok, 'Packaged API plugin responds: ' + id)
  check((await renderer('window.tapPilot.listProfiles()')).length === 0, 'Packaged TapPilot preload and validated IPC work')
  check(!(await renderer('window.tapPilot.getServerInfo()')).running, 'Packaged LAN control stays off')
  const directory = path.resolve('docs/screenshots/desktop')
  await mkdir(directory, { recursive: true })
  const png = await evaluate(`(async () => (await qa.electron.BrowserWindow.getAllWindows()[0].webContents.capturePage()).resize({width:1440}).toPNG().toString('base64'))()`)
  await writeFile(path.join(directory, 'packaged-home.png'), Buffer.from(png, 'base64'))
  for (const [route, selector] of [
    ['svg', '.lp-root, .lp-shell'], ['paint', '.lp-root, .lp-shell'], ['cel', '.lp-root, .lp-shell'],
    ['drawing-canvas', '.dc-home-shell'], ['frame-by-frame', '.fbf-home'], ['live-character', '.lch-shell'],
    ['reference-3d', '.ref-home'], ['anime-3d', '.an-home'], ['tappilot', '.tappilot-studio'],
  ]) {
    await renderer(`location.hash = ${JSON.stringify('#/' + route)}; true`)
    const ready = route === 'tappilot' ? "[...document.querySelectorAll('div')].some(n => n.shadowRoot?.querySelector('.home-command-center'))" : `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    await wait(`qa.electron.BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(ready)})`, route)
    check(true, 'Packaged tool home opens: ' + route)
  }
  check((await evaluate('qa.errors')).length === 0, 'No packaged renderer console errors')
  await renderer("window.artistStudio.openToolWindow('#/drawing-canvas')")
  await wait('qa.electron.BrowserWindow.getAllWindows().length === 2 && qa.electron.BrowserWindow.getAllWindows().every(w=>!w.webContents.isLoading())', 'native tool window')
  check(true, 'Validated IPC opens a separate native tool window')
  if (process.platform === 'darwin') {
    await evaluate('qa.electron.BrowserWindow.getAllWindows().forEach(w=>w.close()); true')
    await wait('qa.electron.BrowserWindow.getAllWindows().length === 0', 'native window close')
    check((await fetch(apiBase + '/health')).ok, 'Closing every macOS window keeps the backend alive')
    await evaluate("qa.electron.app.emit('activate'); true")
    await wait('qa.electron.BrowserWindow.getAllWindows().length === 1 && !qa.electron.BrowserWindow.getAllWindows()[0].webContents.isLoading()', 'Dock reopen')
    check(await renderer("document.querySelectorAll('.home-tool-card').length === 9"), 'macOS activation reopens the built home')
  }
  await evaluate('qa.electron.app.quit(); true')
  connection.close(); connection = null
  for (let i = 0; i < 100 && child.exitCode === null; i++) await delay(100)
  check(child.exitCode === 0, 'Packaged app quits cleanly')
  let sidecarStopped = false
  try { await fetch(apiBase + '/health') } catch { sidecarStopped = true }
  check(sidecarStopped, 'Quit stops the owned backend')
  console.log(`${checks.length} packaged application checks passed.`)
} catch (error) {
  console.error(error); console.error(output.slice(-4000)); process.exitCode = 1
} finally {
  if (connection?.readyState === WebSocket.OPEN && child.exitCode === null) {
    await evaluate('qa?.electron.app.quit(); true').catch(() => {})
    for (let i = 0; i < 30 && child.exitCode === null; i++) await delay(100)
  }
  connection?.close()
  if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)) }
  await mkdir('build/qa', { recursive: true })
  await writeFile('build/qa/packaged.json', JSON.stringify({ date: new Date().toISOString(), platform: process.platform, arch: process.arch, passed: checks, ok: !process.exitCode }, null, 2) + '\n')
  await rm(profile, { recursive: true, force: true })
}
