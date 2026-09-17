import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'build/python-deps')
const venvPip = path.join(
  root,
  process.platform === 'win32' ? '.venv/Scripts/pip.exe' : '.venv/bin/pip',
)

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

const pip = existsSync(venvPip)
  ? [venvPip]
  : [process.platform === 'win32' ? 'py' : 'python3', ...(process.platform === 'win32' ? ['-3', '-m', 'pip'] : ['-m', 'pip'])]

const result = spawnSync(
  pip[0],
  [
    ...pip.slice(1),
    'install',
    '--disable-pip-version-check',
    '--upgrade',
    '--target',
    dest,
    'fastapi',
    'uvicorn[standard]',
  ],
  { cwd: root, stdio: 'inherit' },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
