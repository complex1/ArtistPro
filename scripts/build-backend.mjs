import { root, runPython } from './python.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// Build on the same OS and architecture as the Electron target.
execFileSync(process.execPath, ['scripts/collect-licenses.mjs'], { cwd: root, stdio: 'inherit' })
runPython(['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--name', 'artist-backend',
  '--distpath', 'build/backend-runtime', '--workpath', 'build/pyinstaller', '--specpath', 'build',
  '--collect-submodules', 'uvicorn', '--hidden-import', 'backend.host.main', 'scripts/backend-entry.py'],
  { env: { ...process.env, PYTHONPATH: root, PYINSTALLER_CONFIG_DIR: path.join(root, 'build/pyinstaller-config') } })
mkdirSync('build/backend-runtime', { recursive: true })
writeFileSync('build/backend-runtime/runtime.json', JSON.stringify({ platform: process.platform, arch: process.arch, bundledInterpreter: true }, null, 2) + '\n')
