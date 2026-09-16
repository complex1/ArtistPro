import { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectLaunchpad } from '@artist-studio/ui-component'
import { ARTBOARD_PRESETS } from '@artist-studio/utils'
import { navigate } from '../app/routes'
import {
  createPaintProjectV2,
  deletePaintProjectV2,
  listPaintProjectsV2,
  importLegacyPaintProjects,
  type PaintProjectSummary,
} from './v2/library'

export function PaintHome() {
  const [projects, setProjects] = useState<PaintProjectSummary[]>([])
  const [name, setName] = useState('Untitled')
  const [size, setSize] = useState('800x600')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const requestRef = useRef(0)
  const creatingRef = useRef(false)
  const deletingRef = useRef(new Set<string>())
  const legacyImportRef = useRef<Promise<string | null> | null>(null)

  const preset = ARTBOARD_PRESETS.find(item => item.id === size) ?? ARTBOARD_PRESETS[0]

  const loadProjects = useCallback(() => {
    const request = ++requestRef.current
    // Share migration during Strict Mode effect replay and allow a failed import
    // to be retried without preventing the current library from loading.
    legacyImportRef.current ??= importLegacyPaintProjects()
      .then(() => null)
      .catch((reason: unknown) => {
        legacyImportRef.current = null
        const detail = reason instanceof Error ? reason.message : 'The local project service is unavailable.'
        return `Some older projects could not be imported. ${detail}`
      })
    const pendingProjects = legacyImportRef.current.then(importWarning =>
      listPaintProjectsV2().then(next => ({ next, importWarning })),
    )
    return pendingProjects.then(({ next, importWarning }) => {
      if (!mountedRef.current || request !== requestRef.current) return
      setProjects(next)
      setError(importWarning)
    }).catch((reason: unknown) => {
      if (mountedRef.current && request === requestRef.current) {
        setError(reason instanceof Error ? reason.message : 'Could not load projects.')
      }
    }).finally(() => {
      if (mountedRef.current && request === requestRef.current) setLoading(false)
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadProjects()
    return () => {
      mountedRef.current = false
      requestRef.current += 1
    }
  }, [loadProjects])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    return loadProjects()
  }, [loadProjects])

  const openNew = async () => {
    if (creatingRef.current || !mountedRef.current) return
    creatingRef.current = true
    setCreating(true)
    setCreateError(null)
    try {
      const project = await createPaintProjectV2(name, preset.width, preset.height)
      if (mountedRef.current) navigate({ page: 'paint-editor', projectId: project.id })
    } catch (reason: unknown) {
      if (mountedRef.current) {
        setCreateError(reason instanceof Error ? reason.message : 'Could not create the project.')
      }
    } finally {
      creatingRef.current = false
      if (mountedRef.current) setCreating(false)
    }
  }

  const removeProject = async (project: { id: string; name: string }) => {
    if (deletingRef.current.has(project.id) || !mountedRef.current) return
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return
    deletingRef.current.add(project.id)
    try {
      await deletePaintProjectV2(project.id)
      if (mountedRef.current) await refresh()
    } catch (reason: unknown) {
      if (mountedRef.current) {
        const detail = reason instanceof Error ? ` ${reason.message}` : ''
        setError(`Could not delete “${project.name}”.${detail}`)
      }
    } finally {
      deletingRef.current.delete(project.id)
    }
  }

  return (
    <ProjectLaunchpad
      tool="paint"
      projects={projects}
      loading={loading}
      error={error}
      name={name}
      onNameChange={setName}
      size={size}
      onSizeChange={setSize}
      presets={ARTBOARD_PRESETS}
      creating={creating}
      createError={createError}
      onCreate={() => { void openNew() }}
      onOpen={(projectId: string) => navigate({ page: 'paint-editor', projectId })}
      onDelete={(project: { id: string; name: string }) => { void removeProject(project) }}
      onBack={() => navigate({ page: 'home' })}
      onRefresh={() => { void refresh() }}
      onPlayground={() => navigate({ page: 'paint-playground' })}
    />
  )
}
