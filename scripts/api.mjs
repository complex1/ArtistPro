import { runPython } from './python.mjs'

const action = process.argv[2]
if (action === 'setup') {
  runPython(['-m', 'venv', '.venv'], { system: true })
  runPython(['-m', 'pip', 'install', '-r', 'requirements-dev.txt'])
} else if (action === 'test') {
  runPython(['-m', 'pytest', ...process.argv.slice(3)])
} else if (action === 'serve') {
  runPython(['-m', 'uvicorn', 'backend.host.main:app', '--host', '127.0.0.1', '--port', '8765', ...process.argv.slice(3)])
} else {
  throw new Error('Use api.mjs setup, test, or serve')
}
