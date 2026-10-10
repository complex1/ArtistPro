import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const venvPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

export function systemPython() {
  if (process.env.ARTIST_PYTHON) return { command: process.env.ARTIST_PYTHON, args: [] }
  return process.platform === 'win32' ? { command: 'py', args: ['-3'] } : { command: 'python3', args: [] }
}

export function runPython(args, { system = false, ...options } = {}) {
  const python = !system && existsSync(venvPython) ? { command: venvPython, args: [] } : systemPython()
  const result = spawnSync(python.command, [...python.args, ...args], {
    cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONPATH: root }, ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Python command failed (${result.status ?? result.signal})`)
  return result
}
