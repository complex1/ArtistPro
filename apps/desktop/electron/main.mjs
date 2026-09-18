import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  pythonCandidates,
  resolveStudioPaths,
  selectPython,
} from './paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const tapPilot = require('../../tappilot/electron/runtime.cjs')
const studioPaths = resolveStudioPaths({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  electronDir: __dirname,
})

let sidecar = null
let apiBase = 'http://127.0.0.1:8765'
let mainWindow = null
/** Tool windows keyed by route hash, so a second click focuses the open one. */
const toolWindows = new Map()

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 8765
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function waitForHealth(url, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) return
    } catch {
      // Sidecar is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Python sidecar did not become healthy at ${url}`)
}

/** Written next to the vendored wheels by scripts/bundle-python-deps.mjs. */
function bundledPythonVersion() {
  try {
    const manifest = JSON.parse(
      readFileSync(studioPaths.runtimeManifest, 'utf8'),
    )
    return typeof manifest.pythonVersion === 'string'
      ? manifest.pythonVersion
      : null
  } catch {
    return null
  }
}

function probeVersion({ command, args }) {
  const probe = spawnSync(
    command,
    [...args, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'],
    { encoding: 'utf8' },
  )
  if (probe.status !== 0) return null
  return String(probe.stdout).trim() || null
}

function findPython() {
  const requiredVersion = bundledPythonVersion()
  const { python, probed } = selectPython({
    candidates: pythonCandidates({
      isPackaged: app.isPackaged,
      venvPython: studioPaths.venvPython,
      requiredVersion,
    }),
    requiredVersion,
    probeVersion,
  })
  if (python) return python
  const found = probed.length
    ? probed.map((c) => `${c.command} (${c.version})`).join('\n')
    : 'none'
  throw new Error(
    `Artist Studio bundles Python ${requiredVersion} libraries, but no matching Python ${requiredVersion} interpreter was found.\n\n` +
      `Interpreters checked:\n${found}\n\n` +
      `Install Python ${requiredVersion}, or set ARTIST_PYTHON to its full path.`,
  )
}

async function startSidecar() {
  const port = await freePort()
  apiBase = `http://127.0.0.1:${port}`
  const dataRoot = path.join(app.getPath('userData'), 'artist-studio')
  const python = findPython()
  sidecar = spawn(
    python.command,
    [
      ...python.args,
      '-m',
      'uvicorn',
      'backend.host.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: studioPaths.pythonRoot,
      env: {
        ...process.env,
        ARTIST_DATA_ROOT: dataRoot,
        ARTIST_REPO_ROOT: studioPaths.pythonRoot,
        PYTHONPATH: studioPaths.pythonPath,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  sidecar.stdout?.on('data', (chunk) => {
    console.log('[fastapi]', String(chunk).trim())
  })
  let stderr = ''
  sidecar.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000)
    console.error('[fastapi]', String(chunk).trim())
  })
  try {
    await waitForHealth(apiBase)
  } catch (error) {
    throw new Error(
      `${error.message}\n\nCommand: ${python.command} (Python ${python.version})\n\n${stderr.trim()}`,
    )
  }
}

function stopSidecar() {
  if (!sidecar || sidecar.killed) return
  sidecar.kill('SIGTERM')
  sidecar = null
}

function createWindow(hash = '#/') {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#15171e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    const url = new URL(devUrl)
    url.searchParams.set('apiBase', apiBase)
    url.hash = hash
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(studioPaths.distIndex, { query: { apiBase }, hash })
  }
  return win
}

function createHomeWindow() {
  const win = createWindow()
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function openToolWindow(hash) {
  // Only in-app routes may be opened; anything else falls back to home.
  const target = typeof hash === 'string' && hash.startsWith('#/') ? hash : '#/'
  const open = toolWindows.get(target)
  if (open && !open.isDestroyed()) {
    if (open.isMinimized()) open.restore()
    open.focus()
    // The window may have navigated elsewhere since it opened, so send it back.
    const route = JSON.stringify(target)
    void open.webContents.executeJavaScript(
      `if (location.hash !== ${route}) location.hash = ${route}`,
    )
    return true
  }
  const win = createWindow(target)
  toolWindows.set(target, win)
  win.on('closed', () => {
    if (toolWindows.get(target) === win) toolWindows.delete(target)
  })
  return true
}

ipcMain.handle('artist:get-api-base', () => apiBase)
ipcMain.handle('artist:open-window', (_event, hash) => openToolWindow(hash))

app.whenReady().then(async () => {
  try {
    await startSidecar()
  } catch (error) {
    // Without this the window is never created and the app looks like it
    // failed to launch at all.
    dialog.showErrorBox(
      'Artist Studio could not start',
      error.message || String(error),
    )
    stopSidecar()
    app.exit(1)
    return
  }
  await tapPilot.initialize({
    isDev: Boolean(process.env.VITE_DEV_SERVER_URL),
    getWindows: () => BrowserWindow.getAllWindows(),
    phoneDistPath: studioPaths.phoneDistPath,
  })
  createHomeWindow()
})

app.on('window-all-closed', async () => {
  await tapPilot.shutdown()
  stopSidecar()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await tapPilot.shutdown()
  stopSidecar()
})
