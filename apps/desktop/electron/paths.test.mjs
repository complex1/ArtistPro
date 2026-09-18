import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  pythonCandidates,
  resolveStudioPaths,
  selectPython,
} from './paths.mjs'

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

describe('pythonCandidates', () => {
  const commands = (options) =>
    pythonCandidates({ env: {}, platform: 'darwin', ...options }).map(
      (candidate) => [candidate.command, ...candidate.args].join(' '),
    )

  it('prefers ARTIST_PYTHON, then the repo venv when unpackaged', () => {
    expect(
      commands({
        isPackaged: false,
        venvPython: '/repo/.venv/bin/python',
        env: { ARTIST_PYTHON: '/custom/python' },
      }).slice(0, 2),
    ).toEqual(['/custom/python', '/repo/.venv/bin/python'])
  })

  it('skips the repo venv when packaged', () => {
    expect(
      commands({ isPackaged: true, venvPython: '/asar/.venv/bin/python' }),
    ).not.toContain('/asar/.venv/bin/python')
  })

  it('probes absolute install dirs because Finder gives apps a minimal PATH', () => {
    expect(
      commands({ isPackaged: true, requiredVersion: '3.14' }),
    ).toEqual([
      '/opt/homebrew/bin/python3.14',
      '/usr/local/bin/python3.14',
      '/usr/bin/python3.14',
      'python3.14',
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
    ])
  })

  it('asks the Windows launcher for the bundled version first', () => {
    expect(
      commands({ isPackaged: true, platform: 'win32', requiredVersion: '3.14' }),
    ).toEqual(['py -3.14', 'py -3', 'python'])
  })
})

describe('selectPython', () => {
  const candidates = [
    { command: '/usr/bin/python3', args: [] },
    { command: '/opt/homebrew/bin/python3', args: [] },
  ]
  const versions = {
    '/usr/bin/python3': '3.9',
    '/opt/homebrew/bin/python3': '3.14',
  }
  const probeVersion = ({ command }) => versions[command] ?? null

  it('skips interpreters that cannot run the bundled wheels', () => {
    const { python } = selectPython({
      candidates,
      requiredVersion: '3.14',
      probeVersion,
    })
    expect(python).toEqual({
      command: '/opt/homebrew/bin/python3',
      args: [],
      version: '3.14',
    })
  })

  it('reports what it found when nothing matches', () => {
    const { python, probed } = selectPython({
      candidates,
      requiredVersion: '3.13',
      probeVersion,
    })
    expect(python).toBeNull()
    expect(probed.map((c) => c.version)).toEqual(['3.9', '3.14'])
  })

  it('takes the first working interpreter when no version is required', () => {
    const { python } = selectPython({ candidates, probeVersion })
    expect(python?.command).toBe('/usr/bin/python3')
  })
})
