import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(process.argv[2] || 'release')
const filenames = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && /\.(dmg|zip|exe|AppImage|deb)$/.test(entry.name)).map(entry => entry.name).sort()
if (!filenames.length) throw new Error('No installer artifacts found in ' + directory)
const lines = []
for (const filename of filenames) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(directory, filename))) hash.update(chunk)
  lines.push(`${hash.digest('hex')}  ${filename}`)
}
await writeFile(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(`Wrote SHA256SUMS.txt for ${filenames.length} artifacts`)
