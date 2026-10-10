import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { systemPython } from './python.mjs'

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
      shell: process.platform === 'win32' && command === 'npm',
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

async function ensureNodeModules() {
  if (existsSync(path.join(root, 'node_modules'))) return
  console.log('Installing npm packages…')
  await run('npm', ['ci'])
}

async function ensurePython() {
  if (existsSync(venvPython)) return
  console.log('Setting up the Python sidecar…')
  const python = systemPython()
  await run(python.command, [...python.args, '-m', 'venv', '.venv'])
  await run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements-dev.txt'])
}

await ensureNodeModules()
await ensurePython()
await run('npm', ['run', 'dev'])
