import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const require = createRequire(import.meta.url)
const tapPilot = require('../../tappilot/electron/runtime.cjs')

let sidecar = null
let apiBase = 'http://127.0.0.1:8765'
let mainWindow = null

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

async function startSidecar() {
  const port = await freePort()
  apiBase = `http://127.0.0.1:${port}`
  const dataRoot = path.join(app.getPath('userData'), 'artist-studio')
  const venvPython = path.join(repoRoot, '.venv/bin/python')
  const python =
    process.env.ARTIST_PYTHON ||
    (existsSync(venvPython) ? venvPython : 'python3')
  sidecar = spawn(
    python,
    [
      '-m',
      'uvicorn',
      'backend.host.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ARTIST_DATA_ROOT: dataRoot,
        ARTIST_REPO_ROOT: repoRoot,
        PYTHONPATH: repoRoot,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  sidecar.stdout?.on('data', (chunk) => {
    console.log('[fastapi]', String(chunk).trim())
  })
  sidecar.stderr?.on('data', (chunk) => {
    console.error('[fastapi]', String(chunk).trim())
  })
  await waitForHealth(apiBase)
}

function stopSidecar() {
  if (!sidecar || sidecar.killed) return
  sidecar.kill('SIGTERM')
  sidecar = null
}

function createWindow() {
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
    void win.loadURL(url.toString())
  } else {
    const index = path.join(repoRoot, 'dist/index.html')
    void win.loadFile(index, { query: { apiBase } })
  }
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

ipcMain.handle('artist:get-api-base', () => apiBase)

app.whenReady().then(async () => {
  await startSidecar()
  await tapPilot.initialize({
    isDev: Boolean(process.env.VITE_DEV_SERVER_URL),
    getMainWindow: () => mainWindow,
    phoneDistPath: path.join(repoRoot, 'dist-tappilot-phone'),
  })
  createWindow()
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
