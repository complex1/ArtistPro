import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePythonCommand, resolveStudioPaths } from './paths.mjs'

describe('resolveStudioPaths', () => {
  it('points at the repo when unpackaged', () => {
    const electronDir = path.join('/repo', 'apps', 'desktop', 'electron')
    const paths = resolveStudioPaths({
      isPackaged: false,
      appPath: '/unused',
      resourcesPath: '/unused',
      electronDir,
      platform: 'darwin',
    })
    expect(paths.appRoot).toBe(path.resolve('/repo'))
    expect(paths.pythonRoot).toBe(path.resolve('/repo'))
    expect(paths.pythonPath).toBe(
      `${path.resolve('/repo')}:${path.join(path.resolve('/repo'), 'site-packages')}`,
    )
    expect(paths.distIndex).toBe(path.join(path.resolve('/repo'), 'dist/index.html'))
    expect(paths.phoneDistPath).toBe(
      path.join(path.resolve('/repo'), 'dist-tappilot-phone'),
    )
    expect(paths.venvPython).toBe(path.join(path.resolve('/repo'), '.venv/bin/python'))
  })

  it('uses asar app path and extraResources python when packaged', () => {
    const paths = resolveStudioPaths({
      isPackaged: true,
      appPath: '/App.app/Contents/Resources/app.asar',
      resourcesPath: '/App.app/Contents/Resources',
      electronDir: '/App.app/Contents/Resources/app.asar/apps/desktop/electron',
      platform: 'win32',
    })
    expect(paths.appRoot).toBe('/App.app/Contents/Resources/app.asar')
    expect(paths.pythonRoot).toBe('/App.app/Contents/Resources/python')
    expect(paths.pythonPath).toBe(
      `/App.app/Contents/Resources/python;${path.join('/App.app/Contents/Resources/python', 'site-packages')}`,
    )
    expect(paths.distIndex).toBe(
      '/App.app/Contents/Resources/app.asar/dist/index.html',
    )
    expect(paths.venvPython).toBe(
      path.join(
        '/App.app/Contents/Resources/app.asar',
        '.venv/Scripts/python.exe',
      ),
    )
  })
})

describe('resolvePythonCommand', () => {
  it('prefers ARTIST_PYTHON', () => {
    expect(
      resolvePythonCommand({
        isPackaged: false,
        venvPython: '/repo/.venv/bin/python',
        env: { ARTIST_PYTHON: '/custom/python' },
        venvExists: true,
      }),
    ).toEqual({ command: '/custom/python', args: [] })
  })

  it('uses the venv only when unpackaged', () => {
    expect(
      resolvePythonCommand({
        isPackaged: false,
        venvPython: '/repo/.venv/bin/python',
        env: {},
        venvExists: true,
      }),
    ).toEqual({ command: '/repo/.venv/bin/python', args: [] })
    expect(
      resolvePythonCommand({
        isPackaged: true,
        venvPython: '/asar/.venv/bin/python',
        env: {},
        platform: 'darwin',
        venvExists: true,
      }),
    ).toEqual({ command: 'python3', args: [] })
  })

  it('uses the Windows launcher when no venv is available', () => {
    expect(
      resolvePythonCommand({
        isPackaged: true,
        venvPython: 'C:\\app\\.venv\\Scripts\\python.exe',
        env: {},
        platform: 'win32',
        venvExists: false,
      }),
    ).toEqual({ command: 'py', args: ['-3'] })
  })
})
