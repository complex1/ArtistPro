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
    distIndex: path.join(appRoot, 'dist/index.html'),
    phoneDistPath: path.join(appRoot, 'dist-tappilot-phone'),
    venvPython,
  }
}

export function resolvePythonCommand({
  isPackaged,
  venvPython,
  env = process.env,
  platform = process.platform,
  venvExists,
}) {
  if (env.ARTIST_PYTHON) return { command: env.ARTIST_PYTHON, args: [] }
  if (!isPackaged && venvExists) return { command: venvPython, args: [] }
  if (platform === 'win32') return { command: 'py', args: ['-3'] }
  return { command: 'python3', args: [] }
}
