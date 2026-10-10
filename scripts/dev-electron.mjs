import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { root } from './python.mjs'

const require = createRequire(import.meta.url)
const waitOn = require('wait-on')
await waitOn({ resources: ['http://127.0.0.1:5173'], timeout: 60_000 })
const child = spawn(require('electron'), ['.'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
