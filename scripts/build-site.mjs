import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './python.mjs'

const source = path.join(root, 'website'), dest = path.join(root, 'dist-site')
const url = new URL(process.env.SITE_URL || 'https://complex1.github.io/ArtistPro/')
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('SITE_URL must be HTTP(S)')
const siteUrl = url.href.replace(/\/?$/, '/')
const tools = JSON.parse(await readFile(path.join(source, 'tools.json'), 'utf8'))
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const manifests = []
for (const directory of await readdir(path.join(root, 'apps'))) {
  try { manifests.push(JSON.parse(await readFile(path.join(root, 'apps', directory, 'tool.json'), 'utf8'))) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
if (tools.length !== manifests.length || manifests.some(manifest => !tools.some(tool => tool.id === manifest.id))) throw new Error('Website catalog must match every registered tool')
await rm(dest, { recursive: true, force: true })
await mkdir(path.join(dest, 'assets'), { recursive: true })
await cp(path.join(root, 'docs/screenshots'), path.join(dest, 'screenshots'), { recursive: true })
await cp(path.join(root, 'public/artist-studio.svg'), path.join(dest, 'assets/artist-studio.svg'))
await cp(path.join(root, 'docs/licenses/Inter-OFL.txt'), path.join(dest, 'assets/Inter-OFL.txt'))
for (const weight of [400, 500, 600, 700]) await cp(path.join(root, `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`), path.join(dest, `assets/inter-${weight}.woff2`))
for (const filename of ['styles.css', 'app.js', 'tools.json']) await cp(path.join(source, filename), path.join(dest, filename))
const template = await readFile(path.join(source, 'index.html'), 'utf8')
const buttons = tools.map((tool, i) => `<button type="button" data-tool="${escape(tool.id)}" aria-pressed="${i === 0}">${escape(tool.name)}</button>`).join('')
const links = tools.map(tool => `<a href="tools/${escape(tool.id)}/"><strong>${escape(tool.name)}</strong><span aria-hidden="true">↗</span><small>${escape(tool.tagline)}</small></a>`).join('')
await writeFile(path.join(dest, 'index.html'), template.replaceAll('{{SITE_URL}}', escape(siteUrl)).replace('{{TOOL_BUTTONS}}', buttons).replace('{{TOOL_LINKS}}', links))
for (const tool of tools) {
  // Fail before shipping an empty or missing product screenshot.
  const png = await readFile(path.join(dest, 'screenshots', tool.id, 'editor.png'))
  if (png.length < 5000 || png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Invalid tool screenshot: ' + tool.id)
  const directory = path.join(dest, 'tools', tool.id)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(tool.name)} — Artist Studio</title><meta name="description" content="${escape(tool.description)}"><link rel="canonical" href="${escape(siteUrl)}tools/${tool.id}/"><link rel="icon" href="../../assets/artist-studio.svg"><link rel="stylesheet" href="../../styles.css"></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="../../"><img src="../../assets/artist-studio.svg" width="35" height="35" alt="">Artist Studio</a><a class="nav-github" href="https://github.com/complex1/ArtistPro">View on GitHub ↗</a></header><main id="main" class="tool-detail wrap"><a class="text-link" href="../../#tools">← All the tools</a><h1>${escape(tool.name)}</h1><p class="lede">${escape(tool.description)}</p><img class="detail-image" src="../../screenshots/${tool.id}/editor.png" width="1440" height="1000" alt="${escape(tool.name)} editing workspace"><div class="detail-columns"><section><span class="eyebrow">WHAT YOU CAN MAKE</span><h2>${escape(tool.tagline)}</h2><ul>${tool.features.map(feature => `<li>${escape(feature)}</li>`).join('')}</ul><p><b>Exports:</b> ${escape(tool.formats)}</p></section><section><span class="eyebrow">YOUR FIRST SESSION</span><h2>Start here.</h2><p>${escape(tool.start)}</p><p><b>Current scope:</b> ${escape(tool.limit)}</p><a class="text-link" href="https://github.com/complex1/ArtistPro/tree/HEAD/apps/${tool.id}">Read the full tool guide ↗</a></section></div><p style="margin-top:40px"><a class="button primary" href="../../#get-started">Get started with Artist Studio ↗</a></p></main><footer class="site-footer wrap"><span>Artist Studio · MIT licensed</span><a href="../../">Back to the studio ↗</a></footer></body></html>`)
}
await writeFile(path.join(dest, '.nojekyll'), '')
await writeFile(path.join(dest, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n`)
await writeFile(path.join(dest, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...tools.map(tool => `tools/${tool.id}/`)].map(page => `<url><loc>${escape(siteUrl + page)}</loc></url>`).join('')}</urlset>\n`)
console.log(`Built landing page and ${tools.length} tool pages in dist-site/ (${siteUrl})`)
