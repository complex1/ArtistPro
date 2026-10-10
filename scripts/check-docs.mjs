import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { root } from './python.mjs'

const errors = [], checked = new Set()
async function exists(filename, context) {
  try { await stat(filename); checked.add(filename) } catch { errors.push(`${context}: missing ${path.relative(root, filename)}`) }
}
async function walk(directory, extension) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'build', 'release', 'dist', 'dist-tappilot-phone'].includes(entry.name)) continue
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(filename, extension))
    else if (filename.endsWith(extension)) files.push(filename)
  }
  return files
}
const markdown = [path.join(root, 'README.md'), path.join(root, 'CONTRIBUTING.md'), path.join(root, 'SECURITY.md'), ...(await walk(path.join(root, 'docs'), '.md')), ...(await walk(path.join(root, 'apps'), 'README.md')), path.join(root, 'website/README.md')]
for (const filename of markdown) {
  const source = await readFile(filename, 'utf8')
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1]
    if (/^(https?:|mailto:|#|data:)/.test(href)) continue
    const target = decodeURIComponent(href.split('#')[0])
    if (target) await exists(path.resolve(path.dirname(filename), target), path.relative(root, filename))
  }
}
const catalog = JSON.parse(await readFile(path.join(root, 'website/tools.json'), 'utf8'))
for (const tool of catalog) {
  await exists(path.join(root, 'apps', tool.id, 'README.md'), tool.name)
  for (const capture of ['home', 'editor']) await exists(path.join(root, 'docs/screenshots', tool.id, capture + '.png'), tool.name)
}
const site = path.join(root, 'dist-site')
for (const filename of await walk(site, '.html')) {
  const source = await readFile(filename, 'utf8')
  if (/{{[A-Z_]+}}/.test(source)) errors.push('Unexpanded website token: ' + filename)
  for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1]
    if (/^(https?:|mailto:|#|data:)/.test(href)) continue
    const target = decodeURIComponent(href.split('#')[0])
    if (target) await exists(path.resolve(path.dirname(filename), target), path.relative(root, filename))
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log(`Verified ${markdown.length} Markdown files, all nine app guides/captures, and ${checked.size} local link/asset targets`)
