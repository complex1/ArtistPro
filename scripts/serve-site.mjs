import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { root } from './python.mjs'

const directory = path.join(root, 'dist-site')
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let filename = path.resolve(directory, '.' + pathname)
    if (filename !== directory && !filename.startsWith(directory + path.sep)) throw new Error('Path outside website')
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html')
    response.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream')
    response.end(await readFile(filename))
  } catch { response.writeHead(404); response.end('Not found') }
})
server.listen(Number(process.env.PORT || 4174), '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}/`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
