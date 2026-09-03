import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEV_PORTS = [5173, 5174]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const venvPython = path.join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with ${signal}`))
        return
      }
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

function pythonBin() {
  return process.platform === 'win32' ? 'py' : 'python3'
}

async function ensureNodeModules() {
  if (existsSync(path.join(root, 'node_modules'))) return
  console.log('Installing npm packages…')
  await run('npm', ['install'])
}

async function ensurePython() {
  if (existsSync(venvPython)) return
  console.log('Setting up the Python sidecar…')
  const createArgs =
    process.platform === 'win32'
      ? ['-3', '-m', 'venv', '.venv']
      : ['-m', 'venv', '.venv']
  await run(pythonBin(), createArgs)
  await run(venvPython, [
    '-m',
    'pip',
    'install',
    'fastapi',
    'uvicorn[standard]',
    'pytest',
    'httpx',
  ])
}

/**
 * Vite uses strictPort, so a dev server left over from an earlier session
 * would abort the whole startup instead of picking another port.
 */
function freeDevPorts() {
  if (process.platform === 'win32') return
  for (const port of DEV_PORTS) {
    const lookup = spawnSync('lsof', ['-ti', `tcp:${port}`], {
      encoding: 'utf8',
    })
    const pids = (lookup.stdout || '')
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
    for (const pid of pids) {
      console.log(`Stopping process ${pid} still listening on ${port}…`)
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
  }
}

await ensureNodeModules()
await ensurePython()
freeDevPorts()
await run('npm', ['run', 'dev'])
