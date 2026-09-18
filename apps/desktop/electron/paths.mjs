import path from 'node:path'

/**
 * Resolves Studio file locations for both `electron .` and a packaged app.
 * Packaged layout matches electron-builder: renderer in the asar, Python sources
 * in extraResources/python (Python cannot import from asar).
 */
export function resolveStudioPaths({
  isPackaged,
  appPath,
  resourcesPath,
  electronDir,
  platform = process.platform,
}) {
  const appRoot = isPackaged ? appPath : path.resolve(electronDir, '../../..')
  const pythonRoot = isPackaged
    ? path.join(resourcesPath, 'python')
    : appRoot
  const venvPython = path.join(
    appRoot,
    platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  )
  const delimiter = platform === 'win32' ? ';' : ':'
  return {
    appRoot,
    pythonRoot,
    pythonPath: [pythonRoot, path.join(pythonRoot, 'site-packages')].join(
      delimiter,
    ),
    runtimeManifest: path.join(
      pythonRoot,
      'site-packages',
      RUNTIME_MANIFEST_NAME,
    ),
    distIndex: path.join(appRoot, 'dist/index.html'),
    phoneDistPath: path.join(appRoot, 'dist-tappilot-phone'),
    venvPython,
  }
}

export const RUNTIME_MANIFEST_NAME = 'artist-python-runtime.json'

/** Finder starts apps with PATH=/usr/bin:/bin:/usr/sbin:/sbin, so look here too. */
const UNIX_PYTHON_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']

export function pythonCandidates({
  isPackaged,
  venvPython,
  requiredVersion,
  env = process.env,
  platform = process.platform,
}) {
  const candidates = []
  const add = (command, args = []) => {
    if (!command) return
    const seen = candidates.some(
      (c) => c.command === command && c.args.join(' ') === args.join(' '),
    )
    if (!seen) candidates.push({ command, args })
  }

  if (env.ARTIST_PYTHON) add(env.ARTIST_PYTHON)
  if (!isPackaged) add(venvPython)

  if (platform === 'win32') {
    if (requiredVersion) add('py', [`-${requiredVersion}`])
    add('py', ['-3'])
    add('python')
    return candidates
  }

  if (requiredVersion) {
    for (const dir of UNIX_PYTHON_DIRS) {
      add(path.join(dir, `python${requiredVersion}`))
    }
    add(`python${requiredVersion}`)
  }
  for (const dir of UNIX_PYTHON_DIRS) add(path.join(dir, 'python3'))
  add('python3')
  return candidates
}

/**
 * The bundled wheels are compiled for one CPython minor version, so an
 * interpreter that merely exists is not enough — it has to match.
 */
export function selectPython({ candidates, requiredVersion, probeVersion }) {
  const probed = []
  let fallback = null
  for (const candidate of candidates) {
    const version = probeVersion(candidate)
    if (!version) continue
    probed.push({ ...candidate, version })
    if (!requiredVersion || version === requiredVersion) {
      return { python: { ...candidate, version }, probed }
    }
    if (!fallback) fallback = { ...candidate, version }
  }
  return { python: requiredVersion ? null : fallback, probed }
}
