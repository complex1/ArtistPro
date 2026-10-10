import { useCallback, useEffect, useRef, useState } from 'react'
import { saveProject } from './library'
import { validateDocument } from './model'
import type { AnimeDocument, ProjectRecord } from './types'

export function useProjectHistory(record: ProjectRecord) {
  const [document, setDocument] = useState(record.document)
  const current = useRef(record.document)
  const past = useRef<AnimeDocument[]>([])
  const future = useRef<AnimeDocument[]>([])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const [saveError, setSaveError] = useState('')
  const revision = useRef(0)
  const mounted = useRef(true)
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const persistence = useRef<'saved' | 'saving' | 'failed'>('saved')
  const permittedNavigation = useRef(false)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const persist = useCallback((next: AnimeDocument) => {
    const token = ++revision.current
    persistence.current = 'saving'
    setSaveState('saving')
    setSaveError('')
    // Ordered writes prevent a slow older snapshot from overwriting a newer edit.
    queue.current = queue.current.catch(() => false).then(async () => {
      try {
        await saveProject({ ...record, document: next })
        if (token === revision.current) {
          persistence.current = 'saved'
          if (mounted.current) setSaveState('saved')
        }
        return true
      } catch (error) {
        if (mounted.current && token === revision.current) {
          persistence.current = 'failed'
          setSaveState('failed')
          setSaveError(error instanceof Error ? error.message : 'Browser storage could not save this shot.')
        }
        return false
      }
    })
    return queue.current
  }, [record])

  const install = useCallback((next: AnimeDocument) => {
    current.current = next
    setDocument(next)
    setHistoryVersion(value => value + 1)
    void persist(next)
  }, [persist])

  const commit = useCallback((change: (value: AnimeDocument) => AnimeDocument) => {
    const next = validateDocument(change(current.current))
    if (JSON.stringify(next) === JSON.stringify(current.current)) return
    past.current.push(current.current)
    if (past.current.length > 40) past.current.shift()
    future.current = []
    install(next)
  }, [install])

  const undo = useCallback(() => {
    const next = past.current.pop()
    if (!next) return
    future.current.push(current.current)
    install(next)
  }, [install])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(current.current)
    install(next)
  }, [install])
  const flush = useCallback(async () => {
    for (;;) {
      const pending = queue.current
      const saved = await pending
      if (pending === queue.current) return saved
    }
  }, [])
  const saveNow = useCallback(() => { void persist(current.current); return flush() }, [persist, flush])
  const allowNavigation = useCallback(() => { permittedNavigation.current = true }, [])

  useEffect(() => {
    const ownHash = window.location.hash
    let navigation = 0
    const guard = (event: Event) => {
      const destination = window.location.hash
      if (destination === ownHash || permittedNavigation.current || persistence.current === 'saved') return
      event.preventDefault()
      window.history.replaceState(window.history.state, '', ownHash)
      const token = ++navigation
      void flush().then(saved => {
        if (saved && mounted.current && token === navigation) {
          permittedNavigation.current = true
          window.location.hash = destination
        }
      })
    }
    window.addEventListener('artist-studio:before-route-change', guard)
    return () => { navigation++; window.removeEventListener('artist-studio:before-route-change', guard) }
  }, [flush])

  useEffect(() => {
    if (saveState === 'saved') return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [saveState])

  void historyVersion
  return { document, commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, saveState, saveError, saveNow, allowNavigation }
}
