/** Preserve installed production package notices alongside the release source. */
import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, runPython } from './python.mjs'
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const inventory = [], missing = [], visited = new Set()
const noticeName = /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i
// These packages omit standalone notices. Supplement known, reviewed versions.
const supplemental = {
  '@iconify-json/lucide@1.2.129': 'Lucide-LICENSE.txt',
  '@iconify-json/mdi@1.2.3': 'MaterialDesign-LICENSE.txt',
  'cookie-signature@1.0.7': 'cookie-signature-LICENSE.txt',
}
async function notices(directory, relative = '') {
  const result = []
  for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.join(relative, item.name)
    if (item.isFile() && (relative || noticeName.test(item.name))) result.push(name)
    else if (item.isDirectory() && /^(licen[cs]es?|notices?)$/i.test(item.name)) result.push(...await notices(directory, name))
  }
  return result
}
for (const [location, pkg] of Object.entries(lock.packages)) {
  if (!location || pkg.dev || pkg.link || !location.includes('node_modules/')) continue
  const name = location.split('node_modules/').at(-1), id = `${name}@${pkg.version}`
  const record = { name, version: pkg.version, license: pkg.license || 'Review upstream license', path: location }
  inventory.push(record)
  if (visited.has(id)) continue
  visited.add(id)
  const files = await notices(path.join(root, location))
  if (!files.length) {
    if (supplemental[id]) {
      await readFile(path.join(root, 'docs/licenses/upstream', supplemental[id]))
      record.supplementalNotice = 'docs/licenses/upstream/' + supplemental[id]
    } else missing.push(record)
    continue
  }
  for (const file of files) {
    const target = path.join(root, 'docs/licenses/npm', id.replaceAll('/', '_'), file)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(root, location, file), target)
  }
}
await writeFile(path.join(root, 'docs/third-party-licenses.json'), JSON.stringify(inventory, null, 2) + '\n')
await writeFile(path.join(root, 'docs/licenses/npm-review.json'), JSON.stringify(missing, null, 2) + '\n')
runPython(['scripts/collect-python-licenses.py'])
console.log(`Preserved production npm notices; ${inventory.length} inventory entries, ${missing.length} packages need upstream notice review.`)
