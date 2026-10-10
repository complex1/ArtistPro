import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { root } from './python.mjs'

const resources = process.argv[2] ? path.resolve(process.argv[2]) : null
const repoRoot = resources ? path.join(resources, 'python') : root
const executable = path.join(resources || path.join(root, 'build'), 'backend-runtime/artist-backend', process.platform === 'win32' ? 'artist-backend.exe' : 'artist-backend')
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const data = await mkdtemp(path.join(tmpdir(), 'artist-frozen-backend-'))
let output = ''
const child = spawn(executable, ['--port', String(port)], {
  cwd: data, env: { ...process.env, PATH: '', PYTHONPATH: '', ARTIST_DATA_ROOT: data, ARTIST_REPO_ROOT: repoRoot }, stdio: ['ignore', 'pipe', 'pipe'],
})
child.on('error', error => { output += error.message })
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
try {
  const base = `http://127.0.0.1:${port}`
  let healthy = false
  for (let i = 0; i < 150; i++) {
    try { healthy = (await fetch(base + '/health')).ok } catch {}
    if (healthy || child.exitCode !== null) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!healthy) throw new Error('Frozen backend failed to start:\n' + output)
  const tools = await (await fetch(base + '/v1/tools')).json()
  if (tools.tools.length !== 9) throw new Error('Frozen backend did not load all nine manifests')
  for (const id of ['svg-tool', 'animated-paint', 'cel']) {
    const response = await fetch(base + `/v1/apps/${id}/projects`)
    if (!response.ok || !Array.isArray(await response.json())) throw new Error('Frozen plugin failed: ' + id)
  }
  console.log('PASS frozen backend starts without Python on PATH and loads all manifests and three API plugins')
} finally {
  child.kill()
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve))
  await rm(data, { recursive: true, force: true })
}
