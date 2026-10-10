import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const tests = ['scripts/suite-browser.mjs', ...['drawing-canvas', 'frame-by-frame', 'reference-3d', 'anime-3d'].map(id => `apps/${id}/test/browser-smoke.mjs`)]
for (const test of tests) {
  const result = spawnSync(require('electron'), [...(process.env.CI && process.platform === 'linux' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), test], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
