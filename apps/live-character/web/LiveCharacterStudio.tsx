import { shortcutBlocked, useShortcuts } from '@artist-studio/ui-component'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bone,
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  Copy,
  Diamond,
  Download,
  Eye,
  EyeOff,
  FileJson,
  Film,
  Grid2X2,
  ImagePlus,
  Layers,
  LockKeyhole,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Undo2,
  UnlockKeyhole,
  X,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { navigate } from '../../desktop/renderer/app/routes'
import { getProject, saveProject, type ProjectRecord } from './library'
import { evaluateDocument, upsertKeyframe, upsertMeshKeyframe } from './engine'
import type { CharacterDocument, Transform, Vec2 } from './model'
import { importCharacterAsset } from './assets'
import { downloadProject, exportAnimation, exportFrame } from './export'
import { CharacterStage } from './CharacterStage'
import { CharacterInspector } from './CharacterInspector'
import { CharacterTimeline } from './CharacterTimeline'
import {
  identityPose,
  type CanvasTool,
  type PoseTarget,
  type Selection,
  type WorkspaceMode,
} from './editorTypes'
import './LiveCharacterStudio.css'

const workflow: { id: WorkspaceMode; label: string; hint: string }[] = [
  {
    id: 'create',
    label: 'Create',
    hint: 'Draw a shape, sketch a filled part, or upload artwork.',
  },
  {
    id: 'assemble',
    label: 'Assemble',
    hint: 'Drag parts into place. Use the handle above a part to rotate it.',
  },
  {
    id: 'mesh',
    label: 'Mesh',
    hint: 'Select a layer, generate its mesh, then drag vertices to shape it.',
  },
  {
    id: 'rig',
    label: 'Rig',
    hint: 'Draw bones, bind meshes, and add controls for your character.',
  },
  {
    id: 'animate',
    label: 'Animate',
    hint: 'Move the playhead, then drag a control. Your pose becomes a keyframe.',
  },
]
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'

export function LiveCharacterEditor({ projectId }: { projectId: string }) {
  return <LiveCharacterLoader key={projectId} projectId={projectId} />
}

function LiveCharacterLoader({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void getProject(projectId)
      .then((record) => {
        if (active) {
          if (record) setProject(record)
          else
            setError(
              'This character project could not be found in this browser.',
            )
        }
      })
      .catch((error) => {
        if (active) setError(messageOf(error))
      })
    return () => {
      active = false
    }
  }, [projectId])
  if (error)
    return (
      <div className="lc-missing">
        <h2>Could not open character</h2>
        <p>{error}</p>
        <button
          className="lc-button"
          onClick={() => navigate({ page: 'live-character-home' })}
        >
          <ArrowLeft size={14} />
          Back to characters
        </button>
      </div>
    )
  if (!project)
    return <div className="studio-loading">Opening Live Character…</div>
  return <LiveCharacterStudio key={project.id} project={project} />
}
function LiveCharacterStudio({ project }: { project: ProjectRecord }) {
  const [doc, setDoc] = useState(project.document)
  const docRef = useRef(doc)
  const history = useRef<{
    past: CharacterDocument[]
    future: CharacterDocument[]
  }>({ past: [], future: [] })
  const [historyVersion, setHistoryVersion] = useState(0)
  const [mode, setMode] = useState<WorkspaceMode>('assemble')
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selection, setSelection] = useState<Selection>(null)
  const [tree, setTree] = useState<'layers' | 'rig'>('layers')
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [color, setColor] = useState('#b7a3f0')
  const [showRig, setShowRig] = useState(false)
  const [showMesh, setShowMesh] = useState(false)
  const [vertex, setVertex] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  const [error, setError] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const savedDoc = useRef(project.document)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const live = useRef(true)
  const setErrorMessage = useCallback(
    (message: string) => setError(message),
    [],
  )
  const posed = useMemo(
    () => (mode === 'animate' ? evaluateDocument(doc, frame) : doc),
    [doc, frame, mode],
  )
  const checkpoint = useCallback(() => {
    const current = docRef.current
    if (history.current.past.at(-1) !== current)
      history.current.past = [...history.current.past.slice(-49), current]
    history.current.future = []
    setHistoryVersion((value) => value + 1)
  }, [])
  const change = useCallback(
    (next: CharacterDocument, recordHistory = true) => {
      if (next === docRef.current) return
      if (recordHistory) checkpoint()
      docRef.current = next
      setDoc(next)
      setSaveStatus('saving')
    },
    [checkpoint],
  )
  const persist = useCallback(
    (document: CharacterDocument) => {
      const task = saveQueue.current
        .catch(() => {})
        .then(() => saveProject({ ...project, document }))
        .then(() => {
          savedDoc.current = document
          if (live.current && docRef.current === document)
            setSaveStatus('saved')
        })
        .catch((error) => {
          if (live.current) {
            setSaveStatus('error')
            setError(messageOf(error))
          }
          throw error
        })
      saveQueue.current = task
      return task
    },
    [project],
  )
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void persist(doc).catch(() => {})
    }, 500)
    return () => window.clearTimeout(timer)
  }, [doc, persist])
  useEffect(() => {
    live.current = true
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (docRef.current !== savedDoc.current) {
        void persist(docRef.current).catch(() => {})
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      live.current = false
      window.removeEventListener('beforeunload', beforeUnload)
      if (docRef.current !== savedDoc.current)
        void persist(docRef.current).catch(() => {})
    }
  }, [persist])
  useEffect(() => {
    if (!playing) return
    let request = 0,
      last = performance.now(),
      current = frame >= doc.duration ? 0 : frame
    const tick = (now: number) => {
      current += ((now - last) / 1000) * doc.fps
      last = now
      if (current > doc.duration) current %= doc.duration
      setFrame(current)
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
    // Playback reads its starting frame once; scrubbing pauses it first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, doc.fps, doc.duration])
  function workspace(next: WorkspaceMode) {
    if (next === 'animate' && mode === 'mesh') setShowMesh(true)
    setMode(next)
    setTool('select')
    setPlaying(false)
    setSelectedKey(null)
    if (next !== 'animate') setFrame(0)
    if (next === 'rig') setTree('rig')
    if (next === 'mesh' || next === 'create' || next === 'assemble')
      setTree('layers')
  }
  function select(next: Selection) {
    if (next && next.type !== 'layer') setShowMesh(false)
    setSelection(next)
    setVertex(0)
    setSelectedKey(null)
  }
  function undo() {
    let previous = history.current.past.pop()
    while (previous === docRef.current) previous = history.current.past.pop()
    if (!previous) return
    history.current.future.push(docRef.current)
    change(previous, false)
    setHistoryVersion((value) => value + 1)
    setPlaying(false)
  }
  function redo() {
    const next = history.current.future.pop()
    if (!next) return
    history.current.past.push(docRef.current)
    change(next, false)
    setHistoryVersion((value) => value + 1)
    setPlaying(false)
  }
  function pose(type: PoseTarget, id: string, value: Transform) {
    if (mode === 'animate') {
      setPlaying(false)
      const existing = doc.keyframes.find(
        (key) =>
          key.targetType === type &&
          key.targetId === id &&
          key.frame === Math.round(frame),
      )
      const next = upsertKeyframe(doc, {
        targetId: id,
        targetType: type,
        frame: Math.round(frame),
        value,
        easing: existing?.easing ?? 'ease-in-out',
      })
      change(next)
      setSelectedKey(
        next.keyframes.find(
          (key) =>
            key.targetType === type &&
            key.targetId === id &&
            key.frame === Math.round(frame),
        )?.id ?? null,
      )
    } else if (type === 'layer')
      change({
        ...doc,
        layers: doc.layers.map((layer) =>
          layer.id === id ? { ...layer, transform: value } : layer,
        ),
      })
    else if (type === 'bone')
      change({
        ...doc,
        bones: doc.bones.map((bone) =>
          bone.id === id
            ? { ...bone, x: value.x, y: value.y, rotation: value.rotation }
            : bone,
        ),
      })
    else
      change({
        ...doc,
        controllers: doc.controllers.map((control) =>
          control.id === id ? { ...control, x: value.x, y: value.y } : control,
        ),
      })
  }
  function meshPose(layerId: string, vertices: Vec2[]) {
    setPlaying(false)
    const next = upsertMeshKeyframe(doc, {
      targetId: layerId,
      vertices,
      frame: Math.round(frame),
      easing:
        doc.keyframes.find(
          (key) =>
            key.targetType === 'mesh' &&
            key.targetId === layerId &&
            key.frame === Math.round(frame),
        )?.easing ?? 'ease-in-out',
    })
    change(next)
    setSelectedKey(
      next.keyframes.find(
        (key) =>
          key.targetType === 'mesh' &&
          key.targetId === layerId &&
          key.frame === Math.round(frame),
      )?.id ?? null,
    )
  }
  function addKey() {
    if (!selection) return
    let target = selection
    const control =
      target.type === 'controller'
        ? posed.controllers.find((control) => control.id === target.id)
        : undefined
    if (control?.kind === 'bone' && control.boneId)
      target = { type: 'bone', id: control.boneId }
    const layer =
      target.type === 'layer'
        ? posed.layers.find((layer) => layer.id === target.id)
        : undefined
    const bone =
      target.type === 'bone'
        ? posed.bones.find((bone) => bone.id === target.id)
        : undefined
    const controller =
      target.type === 'controller'
        ? posed.controllers.find((controller) => controller.id === target.id)
        : undefined
    if (layer?.mesh && showMesh) {
      meshPose(layer.id, layer.mesh.vertices)
      return
    }
    const value =
      layer?.transform ??
      (bone
        ? { ...identityPose(), x: bone.x, y: bone.y, rotation: bone.rotation }
        : controller
          ? { ...identityPose(), x: controller.x, y: controller.y }
          : undefined)
    if (value) pose(target.type, target.id, value)
  }
  function removeSelection() {
    if (selectedKey) {
      change({
        ...doc,
        keyframes: doc.keyframes.filter((key) => key.id !== selectedKey),
      })
      setSelectedKey(null)
      return
    }
    if (!selection) return
    const ids = new Set([selection.id])
    if (selection.type !== 'controller') {
      const items = selection.type === 'layer' ? doc.layers : doc.bones
      let added = true
      while (added) {
        added = false
        for (const item of items)
          if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
            ids.add(item.id)
            added = true
          }
      }
    }
    const removedControls = new Set(
      doc.controllers
        .filter((control) =>
          selection.type === 'controller'
            ? ids.has(control.id)
            : selection.type === 'bone' &&
              control.boneId &&
              ids.has(control.boneId),
        )
        .map((control) => control.id),
    )
    const next = {
      ...doc,
      layers: doc.layers
        .filter((layer) => selection.type !== 'layer' || !ids.has(layer.id))
        .map((layer) => {
          if (selection.type !== 'bone' || !layer.mesh) return layer
          return {
            ...layer,
            mesh: {
              ...layer.mesh,
              weights: layer.mesh.weights.map((weights) => {
                const remaining = Object.entries(weights).filter(
                    ([id]) => !ids.has(id),
                  ),
                  total = remaining.reduce((sum, [, weight]) => sum + weight, 0)
                return Object.fromEntries(
                  remaining.map(([id, weight]) => [
                    id,
                    total ? weight / total : 0,
                  ]),
                )
              }),
            },
          }
        }),
      bones: doc.bones.filter(
        (bone) => selection.type !== 'bone' || !ids.has(bone.id),
      ),
      controllers: doc.controllers.filter(
        (control) => !removedControls.has(control.id),
      ),
      keyframes: doc.keyframes.filter(
        (key) =>
          !(key.targetType === selection.type && ids.has(key.targetId)) &&
          !(
            selection.type === 'layer' &&
            key.targetType === 'mesh' &&
            ids.has(key.targetId)
          ) &&
          !(
            key.targetType === 'controller' && removedControls.has(key.targetId)
          ),
      ),
    }
    change(next)
    setSelection(null)
  }
  function duplicate() {
    const layer =
      selection?.type === 'layer'
        ? doc.layers.find((layer) => layer.id === selection.id)
        : undefined
    if (!layer) return
    const copy = structuredClone(layer)
    copy.id = nanoid()
    copy.name = `${copy.name} copy`
    copy.transform.x += 24
    copy.transform.y += 24
    change({ ...doc, layers: [...doc.layers, copy] })
    select({ type: 'layer', id: copy.id })
  }
  function reorder(offset: number) {
    if (selection?.type !== 'layer') return
    const layers = [...doc.layers],
      index = layers.findIndex((layer) => layer.id === selection.id),
      next = index + offset
    if (index < 0 || next < 0 || next >= layers.length) return
    ;[layers[index], layers[next]] = [layers[next], layers[index]]
    change({ ...doc, layers })
  }
  async function importAssets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!files.length) return
    try {
      const layers = await Promise.all(files.map(importCharacterAsset))
      const current = docRef.current
      layers.forEach((layer, index) => {
        layer.transform.x = current.width / 2 + index * 16
        layer.transform.y = current.height / 2 + index * 16
      })
      change({ ...current, layers: [...current.layers, ...layers] })
      select({ type: 'layer', id: layers.at(-1)!.id })
      workspace('assemble')
    } catch (error) {
      setError(messageOf(error))
    }
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (shortcutBlocked(event) || event.altKey) return
      if (event.repeat && !['ArrowLeft', 'ArrowRight', '[', ']'].includes(event.key)) { event.preventDefault(); return }
      const target = event.target as HTMLElement
      if (
        target.closest('input,textarea,select,[contenteditable="true"]') ||
        exportOpen
      )
        return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void persist(docRef.current).catch(() => {})
      } else if (event.code === 'Space') {
        event.preventDefault()
        if (mode !== 'animate') workspace('animate')
        setPlaying((value) => !value)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removeSelection()
      } else if (event.key === 'Escape') {
        setTool('select')
        select(null)
      } else if (event.key.toLowerCase() === 'v') setTool('select')
      else if (event.key.toLowerCase() === 'b') {
        workspace('rig')
        setTool('bone')
      } else if (event.key.toLowerCase() === 'p') {
        workspace('create')
        setTool('draw')
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  })
  async function runExport(kind: 'project' | 'png' | 'gif') {
    setExporting(true)
    setExportProgress(0)
    setPlaying(false)
    setError('')
    try {
      if (kind === 'project') downloadProject(doc)
      else if (kind === 'png') await exportFrame(doc, frame)
      else await exportAnimation(doc, setExportProgress)
      setExportOpen(false)
    } catch (error) {
      setError(messageOf(error))
    } finally {
      setExporting(false)
    }
  }
  function chooseTool(next: CanvasTool) {
    if (next === 'bone') workspace('rig')
    else if (next !== 'select') workspace('create')
    setTool(next)
  }
  const selectedName =
    selection?.type === 'layer'
      ? doc.layers.find((layer) => layer.id === selection.id)?.name
      : selection?.type === 'bone'
        ? doc.bones.find((bone) => bone.id === selection.id)?.name
        : doc.controllers.find((control) => control.id === selection?.id)?.name
  const depth = (
    items: { id: string; parentId: string | null }[],
    id: string,
  ) => {
    let current = items.find((item) => item.id === id),
      n = 0
    const visited = new Set<string>()
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id)
      n++
      current = items.find((item) => item.id === current?.parentId)
    }
    return Math.min(n, 4)
  }
  const parentFirst = <T extends { id: string; parentId: string | null }>(
    items: T[],
  ): T[] => {
    const result: T[] = [],
      visit = (parentId: string | null) => {
        for (const item of items.filter((item) => item.parentId === parentId)) {
          result.push(item)
          visit(item.id)
        }
      }
    visit(null)
    return result
  }
  void historyVersion
  useShortcuts([{ keys: 'Mod+Shift+e', label: 'Export character', run: () => setExportOpen(true) }, { keys: 'Mod+y', label: 'Redo', run: redo }])

  return (
    <div className="lc-studio">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
        multiple
        hidden
        onChange={(event) => void importAssets(event)}
      />
      <header className="lc-topbar">
        <button
          className="lc-icon-button"
          title="Back to characters"
          aria-label="Back to characters"
          onClick={() => {
            void persist(docRef.current)
              .then(() => navigate({ page: 'live-character-home' }))
              .catch(() => {})
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="lc-brand-icon">
          <CircleDot size={21} />
        </div>
        <div className="lc-brand">
          <strong>Live Character</strong>
          <span>ARTIST PRO</span>
        </div>
        <div className="lc-header-divider" />
        <input
          className="lc-project-name"
          aria-label="Project name"
          maxLength={200}
          value={doc.name}
          onChange={(event) => change({ ...doc, name: event.target.value })}
        />
        <span
          className={`lc-save-status ${saveStatus}`}
          title="Saved in this browser"
        >
          {saveStatus === 'saved' ? (
            <Check size={12} />
          ) : saveStatus === 'error' ? (
            <Save size={12} />
          ) : (
            <span className="lc-saving-dot" />
          )}
          {saveStatus === 'saved'
            ? 'Saved'
            : saveStatus === 'saving'
              ? 'Saving…'
              : 'Save failed'}
        </span>
        <div className="lc-header-actions">
          <button
            className="lc-icon-button"
            disabled={!history.current.past.length}
            aria-label="Undo"
            title="Undo (⌘Z)"
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="lc-icon-button"
            disabled={!history.current.future.length}
            aria-label="Redo"
            title="Redo (⌘⇧Z)"
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <button
            className="lc-button"
            onClick={() => {
              workspace('animate')
              setPlaying(true)
            }}
          >
            <Play size={13} />
            Preview
          </button>
          <button
            className="lc-button lc-primary"
            onClick={() => setExportOpen(true)}
          >
            <Download size={14} />
            Export
            <ChevronDown size={12} />
          </button>
        </div>
      </header>
      <nav className="lc-workflow" aria-label="Character workflow">
        <div className="lc-workflow-steps">
          {workflow.map((step, index) => (
            <button
              key={step.id}
              className={mode === step.id ? 'is-active' : ''}
              onClick={() => workspace(step.id)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {step.label}
            </button>
          ))}
          <button onClick={() => setExportOpen(true)}>
            <span>06</span>Export
          </button>
        </div>
        <span className="lc-stage-label">2D CHARACTER STUDIO</span>
      </nav>
      {error && (
        <div className="lc-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="lc-editor-body">
        <aside className="lc-sidebar">
          <div className="lc-sidebar-tabs">
            <button
              className={tree === 'layers' ? 'is-active' : ''}
              onClick={() => setTree('layers')}
            >
              <Layers size={13} />
              Layers<span>{doc.layers.length}</span>
            </button>
            <button
              className={tree === 'rig' ? 'is-active' : ''}
              onClick={() => {
                setTree('rig')
                setShowRig(true)
              }}
            >
              <Bone size={13} />
              Rig<span>{doc.bones.length}</span>
            </button>
          </div>
          <div className="lc-tree-heading">
            <span>
              {tree === 'layers' ? 'CHARACTER PARTS' : 'SKELETON & CONTROLS'}
            </span>
            <button
              aria-label={
                tree === 'layers' ? 'Upload character parts' : 'Draw bone'
              }
              title={tree === 'layers' ? 'Upload character parts' : 'Draw bone'}
              onClick={() =>
                tree === 'layers'
                  ? inputRef.current?.click()
                  : chooseTool('bone')
              }
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="lc-layer-list">
            {tree === 'layers' &&
              parentFirst([...doc.layers].reverse()).map((layer) => (
                <div
                  className={`lc-layer-row ${selection?.id === layer.id ? 'is-selected' : ''} ${!layer.visible ? 'is-hidden' : ''}`}
                  key={layer.id}
                >
                  <button
                    className="lc-layer-select"
                    style={{
                      paddingLeft: 12 + depth(doc.layers, layer.id) * 12,
                    }}
                    onClick={() => select({ type: 'layer', id: layer.id })}
                  >
                    <span
                      className={`lc-layer-swatch ${layer.kind === 'ellipse' ? 'is-round' : ''}`}
                      style={{ background: layer.fill }}
                    >
                      {layer.kind === 'image' ? <ImagePlus size={11} /> : null}
                    </span>
                    <span>{layer.name}</span>
                    {layer.mesh && <Grid2X2 size={10} className="lc-muted" />}
                  </button>
                  <button
                    className="lc-row-action"
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                    onClick={() =>
                      change({
                        ...doc,
                        layers: doc.layers.map((item) =>
                          item.id === layer.id
                            ? { ...item, visible: !item.visible }
                            : item,
                        ),
                      })
                    }
                  >
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    className="lc-row-action"
                    title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                    aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                    onClick={() =>
                      change({
                        ...doc,
                        layers: doc.layers.map((item) =>
                          item.id === layer.id
                            ? { ...item, locked: !item.locked }
                            : item,
                        ),
                      })
                    }
                  >
                    {layer.locked ? (
                      <LockKeyhole size={11} />
                    ) : (
                      <UnlockKeyhole size={11} />
                    )}
                  </button>
                </div>
              ))}
            {tree === 'rig' && (
              <>
                {parentFirst(doc.bones).map((bone) => (
                  <button
                    className={`lc-rig-row ${selection?.id === bone.id ? 'is-selected' : ''}`}
                    style={{ paddingLeft: 14 + depth(doc.bones, bone.id) * 13 }}
                    key={bone.id}
                    onClick={() => select({ type: 'bone', id: bone.id })}
                  >
                    <Bone size={13} />
                    <span>{bone.name}</span>
                  </button>
                ))}
                {doc.controllers.length > 0 && (
                  <div className="lc-tree-subheading">CONTROLLERS</div>
                )}
                {doc.controllers.map((control) => (
                  <button
                    className={`lc-rig-row ${selection?.id === control.id ? 'is-selected' : ''}`}
                    key={control.id}
                    onClick={() =>
                      select({ type: 'controller', id: control.id })
                    }
                  >
                    <CircleDot size={13} />
                    <span>{control.name}</span>
                    {control.kind === 'ik' && <small>IK</small>}
                  </button>
                ))}
              </>
            )}
            {((tree === 'layers' && !doc.layers.length) ||
              (tree === 'rig' && !doc.bones.length)) && (
              <p className="lc-empty-tree">
                {tree === 'layers'
                  ? 'Your character parts will appear here. Draw or upload your first part.'
                  : 'Draw the first bone on the canvas. Select a bone to extend its chain.'}
              </p>
            )}
          </div>
          <div className="lc-layer-actions">
            <button
              title="Move layer forward"
              aria-label="Move layer forward"
              disabled={selection?.type !== 'layer'}
              onClick={() => reorder(1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              title="Move layer backward"
              aria-label="Move layer backward"
              disabled={selection?.type !== 'layer'}
              onClick={() => reorder(-1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              title="Duplicate layer"
              aria-label="Duplicate layer"
              disabled={selection?.type !== 'layer'}
              onClick={duplicate}
            >
              <Copy size={13} />
            </button>
            <button
              title="Delete selected item and children (undo available)"
              aria-label="Delete selected item"
              disabled={!selection}
              onClick={removeSelection}
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="lc-library-tip">
            <div>
              <span className="lc-status-dot" />
              Made to move
            </div>
            <p>Separate parts give your character room to come to life.</p>
            <button
              className="lc-button lc-full"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={14} />
              Upload artwork
            </button>
            <small>PNG, JPG, WebP, GIF & SVG</small>
          </div>
        </aside>
        <main className="lc-canvas-panel">
          <div className="lc-canvas-topline">
            <span>
              <span className="lc-status-dot" />
              {mode === 'animate' ? 'Animation preview' : 'Character canvas'}
            </span>
            <span>
              {doc.width} × {doc.height}
            </span>
          </div>
          <div className="lc-canvas-wrap">
            <div className="lc-canvas-tools">
              {(
                [
                  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
                  { id: 'draw', icon: Pencil, label: 'Draw filled part (P)' },
                  { id: 'rectangle', icon: Square, label: 'Rectangle' },
                  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
                  { id: 'bone', icon: Bone, label: 'Draw bone (B)' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={tool === item.id ? 'is-active' : ''}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => chooseTool(item.id)}
                >
                  <item.icon size={17} />
                </button>
              ))}
              <span className="lc-tool-divider" />
              <button
                aria-label="Upload artwork"
                title="Upload artwork"
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus size={17} />
              </button>
              <input
                type="color"
                aria-label="Drawing color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
            <CharacterStage
              document={doc}
              posed={posed}
              mode={mode}
              tool={tool}
              selection={selection}
              onSelect={select}
              onChange={change}
              onCheckpoint={() => {
                setPlaying(false)
                checkpoint()
              }}
              frame={frame}
              color={color}
              zoom={zoom}
              showRig={showRig}
              showMesh={showMesh}
              onError={setErrorMessage}
              selectedVertex={vertex}
              onVertexSelect={setVertex}
            />
            <div className="lc-view-controls">
              <button
                className={showMesh ? 'is-active' : ''}
                aria-label={
                  mode === 'animate'
                    ? 'Animate mesh points'
                    : 'Toggle mesh overlay'
                }
                aria-pressed={showMesh}
                title={
                  mode === 'animate'
                    ? 'Animate mesh points'
                    : 'Toggle mesh overlay'
                }
                onClick={() => setShowMesh((value) => !value)}
              >
                <Grid2X2 size={14} />
              </button>
              <button
                className={showRig ? 'is-active' : ''}
                aria-label="Toggle rig overlay"
                title="Toggle rig overlay"
                onClick={() => setShowRig((value) => !value)}
              >
                <Bone size={14} />
              </button>
              <span />
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((value) => Math.max(0.3, value - 0.15))}
              >
                <Minus size={13} />
              </button>
              <button
                className="lc-zoom-value"
                aria-label="Reset zoom"
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                aria-label="Zoom in"
                onClick={() => setZoom((value) => Math.min(3, value + 0.15))}
              >
                <Plus size={13} />
              </button>
              <button
                aria-label="Fit canvas"
                title="Fit canvas"
                onClick={() => setZoom(1)}
              >
                <Maximize size={13} />
              </button>
            </div>
          </div>
          <div className="lc-canvas-status">
            <span>
              {mode === 'animate' && showMesh
                ? 'Select a mesh layer, move the playhead, then drag its points to record a mesh pose.'
                : workflow.find((step) => step.id === mode)?.hint}
            </span>
            <span>{selectedName ?? 'No selection'}</span>
          </div>
        </main>
        <CharacterInspector
          document={doc}
          posed={posed}
          selection={selection}
          mode={mode}
          onChange={change}
          onPose={pose}
          onSelect={select}
          vertex={vertex}
          onVertexChange={setVertex}
          meshEditing={showMesh}
          onMeshEditing={setShowMesh}
          onMeshPose={meshPose}
        />
      </div>
      {mode === 'animate' ? (
        <CharacterTimeline
          document={doc}
          frame={frame}
          playing={playing}
          onFrame={setFrame}
          onPlaying={setPlaying}
          selection={selection}
          onSelect={(next) => {
            select(next)
            setShowMesh(false)
          }}
          meshEditing={showMesh}
          onSelectMesh={(layerId) => {
            select({ type: 'layer', id: layerId })
            setShowMesh(true)
            setTree('layers')
          }}
          onChange={change}
          onCheckpoint={checkpoint}
          onAddKey={addKey}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
        />
      ) : (
        <footer className="lc-bottom-bar">
          <span>
            <Layers size={12} />
            {doc.layers.length} parts<span>·</span>
            <Bone size={12} />
            {doc.bones.length} bones<span>·</span>
            <Diamond size={11} />
            {doc.keyframes.length} keys
          </span>
          <button onClick={() => workspace('animate')}>
            Open animation timeline
            <Play size={12} />
          </button>
        </footer>
      )}
      {exportOpen && (
        <div
          className="lc-modal-backdrop"
          onClick={() => {
            if (!exporting) setExportOpen(false)
          }}
        >
          <section
            className="lc-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lc-export-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="lc-modal-close"
              aria-label="Close export"
              disabled={exporting}
              onClick={() => setExportOpen(false)}
            >
              <X size={17} />
            </button>
            <span className="lc-modal-eyebrow">
              TAKE YOUR CHARACTER WITH YOU
            </span>
            <h2 id="lc-export-title">Ready for its next stage.</h2>
            <p>
              Export your character or bring its animation into your next
              project.
            </p>
            <button
              className="lc-export-option"
              disabled={exporting}
              onClick={() => void runExport('project')}
            >
              <FileJson size={24} />
              <span>
                <strong>Character project</strong>
                <small>Editable artwork, meshes, rig & animation · JSON</small>
              </span>
              <Download size={16} />
            </button>
            <button
              className="lc-export-option"
              disabled={exporting}
              onClick={() => void runExport('png')}
            >
              <ImagePlus size={24} />
              <span>
                <strong>Current frame</strong>
                <small>Frame {Math.round(frame)} · transparent PNG</small>
              </span>
              <Download size={16} />
            </button>
            <button
              className="lc-export-option"
              disabled={exporting}
              onClick={() => void runExport('gif')}
            >
              <Film size={24} />
              <span>
                <strong>Animated GIF</strong>
                <small>
                  {(doc.duration / doc.fps).toFixed(1)} seconds · white
                  background · up to 800 px / 240 frames
                </small>
              </span>
              <Download size={16} />
            </button>
            {exporting && (
              <div className="lc-export-progress" role="status">
                Exporting… {Math.round(exportProgress * 100)}%
                <progress max={1} value={exportProgress} />
              </div>
            )}
            <div role="status" className="lc-export-error">
              {error}
            </div>
            <small className="lc-export-note">
              Projects are saved in this browser. Download the JSON file to back
              up or move your character.
            </small>
          </section>
        </div>
      )}
    </div>
  )
}
