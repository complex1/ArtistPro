import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RUNTIME_MANIFEST_NAME } from '../apps/desktop/electron/paths.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'build/python-deps')
const isWindows = process.platform === 'win32'
const venvPython = path.join(
  root,
  isWindows ? '.venv/Scripts/python.exe' : '.venv/bin/python',
)

const python = existsSync(venvPython)
  ? { command: venvPython, args: [] }
  : { command: isWindows ? 'py' : 'python3', args: isWindows ? ['-3'] : [] }

function run(args, options = {}) {
  return spawnSync(python.command, [...python.args, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  })
}

const probe = run(['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'])
if (probe.status !== 0) {
  console.error(`Could not run ${python.command}`)
  process.exit(probe.status ?? 1)
}
const pythonVersion = probe.stdout.trim()

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

const install = run(
  [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--upgrade',
    '--target',
    dest,
    'fastapi',
    'uvicorn[standard]',
  ],
  { stdio: 'inherit', encoding: undefined },
)

if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

// The wheels are compiled for this interpreter, so the app has to find the
// same minor version at runtime.
writeFileSync(
  path.join(dest, RUNTIME_MANIFEST_NAME),
  `${JSON.stringify({ pythonVersion }, null, 2)}\n`,
)
console.log(`Bundled Python ${pythonVersion} dependencies into ${dest}`)
