import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeft,
  ArrowDownToLine,
  Box,
  Camera,
  Check,
  ChevronDown,
  Circle,
  CornerUpLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  Folder,
  FolderPlus,
  Grid3X3,
  Hand,
  Image,
  Layers,
  Lock,
  Maximize,
  Move,
  Orbit,
  PersonStanding,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scan,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useShortcuts } from '@artist-studio/ui-component'
import { getProject, saveProject, type ProjectRecord } from './library'
import {
  createSceneObject,
  FIGURE_JOINTS,
  mirrorPose,
  POSE_PRESETS,
  cameraView,
  validateDocument,
} from './model'
import { SceneStage, type SceneStageHandle } from './SceneStage'
import { boneLabel, importGlb } from './assets'
import { importImagePlane } from './imageAssets'
import {
  createObjectGroup,
  duplicateObjectTree,
  getDescendantIds,
  hasLockedDescendant,
  isEffectivelyLocked,
  isEffectivelyVisible,
  removeObjectTree,
  reparentObjects,
  ungroupObject,
} from './groups'
import { sendToDrawingCanvas } from './drawingHandoff'
import { REFERENCE_SHORTCUTS, type ReferenceShortcutId } from './shortcuts'
import type {
  NavigationMode,
  ObjectKind,
  SceneAsset,
  SceneDocument,
  SceneObject,
  TransformMode,
  Vec3,
  WorkspaceMode,
} from './types'
import './reference.css'

const MODES: {
  id: WorkspaceMode
  label: string
  icon: LucideIcon
  hint: string
}[] = [
  {
    id: 'arrange',
    label: 'Arrange',
    icon: Move,
    hint: 'Select a subject. Move, rotate, or scale it into place.',
  },
  {
    id: 'pose',
    label: 'Pose',
    icon: PersonStanding,
    hint: 'Select a joint to rotate. Move a hand or foot to bend its limb.',
  },
  {
    id: 'camera',
    label: 'Camera',
    icon: Camera,
    hint: 'Explore freely, then set the shot camera from your view.',
  },
  {
    id: 'light',
    label: 'Light',
    icon: Sun,
    hint: 'Shape your reference with light, shadow, and atmosphere.',
  },
]
const ASSETS: {
  kind: ObjectKind
  label: string
  icon: LucideIcon
  description: string
}[] = [
  {
    kind: 'figure',
    label: 'Drawing figure',
    icon: PersonStanding,
    description: 'Articulated mannequin',
  },
  { kind: 'chair', label: 'Chair', icon: Box, description: 'A place to sit' },
  { kind: 'cube', label: 'Cube', icon: Box, description: 'Block out a scene' },
  {
    kind: 'sphere',
    label: 'Sphere',
    icon: Circle,
    description: 'Study light and form',
  },
  {
    kind: 'cylinder',
    label: 'Cylinder',
    icon: Layers,
    description: 'A simple volume',
  },
  {
    kind: 'platform',
    label: 'Platform',
    icon: Grid3X3,
    description: 'Give subjects a stage',
  },
]
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.'
const radians = (v: number) => (v * Math.PI) / 180
const degrees = (v: number) => Math.round(((v * 180) / Math.PI) * 10) / 10
const shortcutKeys = (id: ReferenceShortcutId) =>
  REFERENCE_SHORTCUTS.find((shortcut) => shortcut.id === id)!.keys.replace(
    'Mod',
    'Ctrl/⌘',
  )
const shortcutTitle = (id: ReferenceShortcutId) =>
  `${REFERENCE_SHORTCUTS.find((shortcut) => shortcut.id === id)!.label} (${shortcutKeys(id)})`
function download(data: Blob | string, filename: string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const a = window.document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1500)
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'scene'
}
function folderPath(objects: SceneObject[], object: SceneObject): string {
  const parent = objects.find((item) => item.id === object.parentId)
  return parent
    ? `${folderPath(objects, parent)} / ${object.name}`
    : object.name
}

function SceneTree({
  objects,
  selectedIds,
  onSelect,
  onPatch,
  onMove,
}: {
  objects: SceneObject[]
  selectedIds: Set<string>
  onSelect: (id: string, multiple: boolean) => void
  onPatch: (id: string, patch: Partial<SceneObject>) => void
  onMove: (ids: string[], parentId?: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const sceneDragType = 'application/x-reference-3d-objects'
  const readDrop = (transfer: DataTransfer, parentId?: string) => {
    try {
      const ids: unknown = JSON.parse(transfer.getData(sceneDragType))
      if (
        Array.isArray(ids) &&
        ids.length &&
        ids.every((id) => typeof id === 'string')
      )
        onMove(ids, parentId)
    } catch {
      /* Ignore data from outside the scene tree. */
    }
    setDropTarget(null)
  }
  const rootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(sceneDragType)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget('scene-root')
  }
  const rootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(sceneDragType)) return
    event.preventDefault()
    event.stopPropagation()
    readDrop(event.dataTransfer)
  }
  const rows = (parentId?: string, depth = 0): ReactNode =>
    objects
      .filter((object) => object.parentId === parentId)
      .map((object) => {
        const isFolder = object.kind === 'group'
        const inheritedLock =
          !!object.parentId && isEffectivelyLocked(objects, object.parentId)
        const locked = isEffectivelyLocked(objects, object.id)
        const visible = isEffectivelyVisible(objects, object.id)
        const children = objects.filter((item) => item.parentId === object.id)
        return (
          <div key={object.id}>
            <div
              className={`ref-scene-row ${selectedIds.has(object.id) ? 'selected' : ''} ${!visible ? 'hidden' : ''} ${dropTarget === object.id ? 'drop-target' : ''}`}
              data-object-id={object.id}
              style={{ paddingLeft: 4 + depth * 13 }}
              draggable={!locked}
              onDragStart={(event) => {
                event.stopPropagation()
                const ids = selectedIds.has(object.id)
                  ? [...selectedIds]
                  : [object.id]
                event.dataTransfer.setData(sceneDragType, JSON.stringify(ids))
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                event.stopPropagation()
                if (
                  !isFolder ||
                  locked ||
                  !event.dataTransfer.types.includes(sceneDragType)
                )
                  return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTarget(object.id)
              }}
              onDragLeave={() => setDropTarget(null)}
              onDragEnd={() => setDropTarget(null)}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setDropTarget(null)
                if (!isFolder || locked) return
                readDrop(event.dataTransfer, object.id)
                setCollapsed((current) => {
                  const next = new Set(current)
                  next.delete(object.id)
                  return next
                })
              }}
            >
              {isFolder ? (
                <button
                  className="ref-folder-toggle"
                  aria-label={`${collapsed.has(object.id) ? 'Expand' : 'Collapse'} ${object.name}`}
                  aria-expanded={!collapsed.has(object.id)}
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current)
                      if (next.has(object.id)) next.delete(object.id)
                      else next.add(object.id)
                      return next
                    })
                  }
                >
                  <ChevronDown
                    size={12}
                    className={collapsed.has(object.id) ? 'collapsed' : ''}
                  />
                </button>
              ) : (
                <span className="ref-tree-spacer" />
              )}
              <button
                className="ref-scene-select"
                aria-pressed={selectedIds.has(object.id)}
                onClick={(event) =>
                  onSelect(object.id, event.metaKey || event.ctrlKey)
                }
              >
                {isFolder ? (
                  <Folder size={16} />
                ) : object.kind === 'figure' ? (
                  <PersonStanding size={16} />
                ) : object.kind === 'image' ? (
                  <Image size={16} />
                ) : (
                  <Box size={16} />
                )}
                <span>{object.name}</span>
              </button>
              {isFolder && (
                <small
                  className="ref-folder-count"
                  title={`${children.length} direct children`}
                >
                  {children.length}
                </small>
              )}
              {object.parentId && (
                <ToolButton
                  title={`Move ${object.name} out of folder`}
                  shortcut={shortcutKeys('moveOut')}
                  disabled={
                    locked ||
                    (isFolder && hasLockedDescendant(objects, object.id))
                  }
                  onClick={() =>
                    onMove(
                      [object.id],
                      objects.find((parent) => parent.id === object.parentId)
                        ?.parentId,
                    )
                  }
                >
                  <CornerUpLeft size={13} />
                </ToolButton>
              )}
              <ToolButton
                title={`${object.visible ? 'Hide' : 'Show'} ${object.name}`}
                shortcut={
                  selectedIds.size === 1 && selectedIds.has(object.id)
                    ? shortcutKeys('toggleVisibility')
                    : undefined
                }
                onClick={() => onPatch(object.id, { visible: !object.visible })}
              >
                {visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </ToolButton>
              <ToolButton
                title={
                  inheritedLock
                    ? `Locked by folder: ${object.name}`
                    : `${object.locked ? 'Unlock' : 'Lock'} ${object.name}`
                }
                disabled={inheritedLock}
                shortcut={
                  selectedIds.size === 1 && selectedIds.has(object.id)
                    ? shortcutKeys('toggleLock')
                    : undefined
                }
                onClick={() => onPatch(object.id, { locked: !object.locked })}
              >
                {locked ? <Lock size={12} /> : <Unlock size={12} />}
              </ToolButton>
            </div>
            {isFolder &&
              !collapsed.has(object.id) &&
              rows(object.id, depth + 1)}
          </div>
        )
      })
  return (
    <div
      className="ref-scene-tree"
      aria-label="Scene hierarchy"
      onDragOver={(event) => {
        if (event.target === event.currentTarget) rootDragOver(event)
      }}
      onDrop={(event) => {
        if (event.target === event.currentTarget) rootDrop(event)
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDropTarget(null)
      }}
    >
      <div
        className={`ref-scene-root ${dropTarget === 'scene-root' ? 'drop-target' : ''}`}
        role="group"
        aria-label="Move to scene root"
        onDragOver={rootDragOver}
        onDrop={rootDrop}
      >
        <CornerUpLeft size={15} />
        <span>
          Scene root<small>Drop here to move outside all folders</small>
        </span>
      </div>
      {rows()}
      <div
        className={`ref-scene-root-space ${dropTarget === 'scene-root' ? 'drop-target' : ''}`}
        aria-label="Scene root drop area"
        onDragOver={rootDragOver}
        onDrop={rootDrop}
      />
    </div>
  )
}
function ToolButton({
  title,
  shortcut,
  children,
  active,
  onClick,
  disabled,
}: {
  title: string
  shortcut?: string
  children: ReactNode
  active?: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className={`ref-icon-button${active ? ' active' : ''}`}
      title={shortcut ? `${title} (${shortcut})` : title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
function Section({
  title,
  children,
  extra,
}: {
  title: string
  children: ReactNode
  extra?: ReactNode
}) {
  return (
    <section className="ref-inspector-section">
      <div className="ref-panel-heading">
        <h3>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}
function NumberField({
  label,
  value,
  onChange,
  min = -1000,
  max = 1000,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const [draft, setDraft] = useState({
    source: value,
    text: String(value),
    dirty: false,
  })
  const text =
    draft.source === value
      ? draft.text
      : String(Math.round(value * 1000) / 1000)
  const commit = () => {
    // Reparenting can produce precise local coordinates; merely focusing a
    // rounded display value must not change the underlying scene transform.
    if (!draft.dirty || draft.source !== value) return
    const number = Number(text)
    if (text.trim() && Number.isFinite(number)) {
      const next = Math.min(max, Math.max(min, number))
      setDraft({ source: next, text: String(next), dirty: false })
      if (next !== value) onChange(next)
    } else setDraft({ source: value, text: String(value), dirty: false })
  }
  return (
    <label className="ref-number">
      <span>{label}</span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          setDraft({ source: value, text: e.target.value, dirty: true })
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </label>
  )
}
function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="ref-range">
      <span>
        {label}
        <output>
          {Math.round(value * 100) / 100}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
function VectorFields({
  label,
  value,
  onChange,
  angular = false,
  positive = false,
}: {
  label: string
  value: Vec3
  onChange: (v: Vec3) => void
  angular?: boolean
  positive?: boolean
}) {
  return (
    <div className="ref-vector">
      <span className="ref-field-caption">{label}</span>
      <div>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            value={angular ? degrees(value[i]) : value[i]}
            min={positive ? 0.001 : angular ? -1440 : -10000}
            max={angular ? 1440 : positive ? 1000 : 10000}
            step={angular ? 5 : 0.1}
            onChange={(n) => {
              const next: Vec3 = [...value]
              next[i] = angular ? radians(n) : n
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="ref-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
function PoseGlyph({ pose }: { pose: Record<string, Vec3> }) {
  const projected = (
    angle: Vec3 | undefined,
    length: number,
    side = 1,
  ): [number, number] => {
    const [x, , z] = angle ?? [0, 0, 0]
    return [
      Math.sin(z) * length + Math.sin(-x) * length * 0.43 * side,
      Math.cos(x) * Math.cos(z) * length,
    ]
  }
  const limb = (
    x: number,
    y: number,
    upper: string,
    lower: string,
    side: number,
  ) => {
    const a = projected(pose[upper], 17, side)
    const u = pose[upper] ?? [0, 0, 0]
    const l = pose[lower] ?? [0, 0, 0]
    const b = projected([u[0] + l[0], u[1] + l[1], u[2] + l[2]], 16, side)
    return `M${x} ${y}l${a[0]} ${a[1]}l${b[0]} ${b[1]}`
  }
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <path d="M12 84h72" stroke="currentColor" opacity=".13" />
      <g
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M48 30v23" strokeWidth="9" />
        <path d={limb(40, 32, 'leftUpperArm', 'leftForearm', 1)} />
        <path d={limb(56, 32, 'rightUpperArm', 'rightForearm', -1)} />
        <path d={limb(43, 54, 'leftThigh', 'leftShin', 1)} />
        <path d={limb(53, 54, 'rightThigh', 'rightShin', -1)} />
      </g>
      <ellipse cx="48" cy="20" rx="7" ry="9" fill="currentColor" />
      <g fill="var(--panel)">
        <circle cx="40" cy="32" r="2" />
        <circle cx="56" cy="32" r="2" />
      </g>
    </svg>
  )
}

export function ReferenceEditor({ projectId }: { projectId: string }) {
  return <ReferenceLoader key={projectId} projectId={projectId} />
}

function ReferenceLoader({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectRecord | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void getProject(projectId)
      .then((p) => {
        if (active) {
          if (p) setRecord(p)
          else setError('This scene could not be found on this device.')
        }
      })
      .catch((e) => {
        if (active) setError(message(e))
      })
    return () => {
      active = false
    }
  }, [projectId])
  if (!record)
    return (
      <div className="ref-loading ref-theme">
        <Box size={32} />
        <h2>{error || 'Opening your scene…'}</h2>
        {error && (
          <button
            className="ref-button"
            onClick={() => {
              window.location.hash = '#/reference-3d'
            }}
          >
            <ArrowLeft size={14} /> Back to scenes
          </button>
        )}
      </div>
    )
  return <ReferenceWorkspace key={record.id} initial={record} />
}

function ReferenceWorkspace({ initial }: { initial: ProjectRecord }) {
  const [doc, setDoc] = useState(initial.document)
  const docRef = useRef(doc)
  const recordRef = useRef(initial)
  const savedRef = useRef(initial.document)
  const stage = useRef<SceneStageHandle>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    doc.objects[0]?.id ?? null,
  )
  const [additionalSelection, setAdditionalSelection] = useState<string[]>([])
  const [selectedBone, setSelectedBone] = useState<string | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>('arrange')
  const [transform, setTransform] = useState<TransformMode>('translate')
  const [navigation, setNavigation] = useState<NavigationMode>('orbit')
  const [tab, setTab] = useState<'assets' | 'scene'>('assets')
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState(true)
  const [status, setStatus] = useState<
    'saved' | 'saving' | 'unsaved' | 'error'
  >('saved')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<{
    asset: SceneAsset
    object: SceneObject
  } | null>(null)
  const [poseName, setPoseName] = useState('My pose')
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const history = useRef<{ past: SceneDocument[]; future: SceneDocument[] }>({
    past: [],
    future: [],
  })
  const [historyFlags, setHistoryFlags] = useState({ undo: false, redo: false })
  const grouping = useRef({ key: '', time: 0 })
  const savingQueue = useRef<Promise<unknown>>(Promise.resolve())
  const pendingWrites = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const selectedIds = new Set(
    [selectedId, ...additionalSelection].filter(
      (id): id is string =>
        !!id && doc.objects.some((object) => object.id === id),
    ),
  )
  const multiSelected = selectedIds.size > 1
  const selected = multiSelected
    ? undefined
    : doc.objects.find((object) => object.id === selectedId)
  const asset = selected?.assetId
    ? doc.assets.find((a) => a.id === selected.assetId)
    : undefined
  const inheritedLock =
    !!selected?.parentId && isEffectivelyLocked(doc.objects, selected.parentId)
  const editable = selected && !isEffectivelyLocked(doc.objects, selected.id)
  const subtreeLocked =
    !!selected &&
    selected.kind === 'group' &&
    hasLockedDescendant(doc.objects, selected.id)
  const transformable = editable && !subtreeLocked
  const descendantIds = selected
    ? getDescendantIds(doc.objects, selected.id)
    : new Set<string>()
  const joints =
    selected?.kind === 'figure'
      ? FIGURE_JOINTS
      : (asset?.bones ?? []).map((id) => ({ id, label: boneLabel(id) }))
  const joint = joints.find((j) => j.id === selectedBone)
  const canMoveJoint =
    selected?.kind === 'figure' &&
    !!selectedBone &&
    /(Hand|Foot)$/.test(selectedBone)
  const effectiveTransform =
    mode === 'pose' && !canMoveJoint ? 'rotate' : transform
  const hasModal = outputOpen || !!pendingImport
  useEffect(() => {
    if (!hasModal) return
    const previousFocus = window.document.activeElement as HTMLElement | null
    const dialog = window.document.querySelector<HTMLElement>('.ref-modal')
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled)',
        ) ?? [],
      )
    controls()[0]?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        setOutputOpen(false)
        setPendingImport(null)
      }
      if (e.key !== 'Tab') return
      const items = controls(),
        first = items[0],
        last = items.at(-1)
      if (e.shiftKey && window.document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && window.document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', trap)
    return () => {
      window.removeEventListener('keydown', trap)
      previousFocus?.focus()
    }
  }, [hasModal, busy])

  const edit = useCallback(
    (update: (current: SceneDocument) => SceneDocument, key = '') => {
      const current = docRef.current
      const next = update(current)
      if (next === current) return
      const now = Date.now()
      if (
        !key ||
        grouping.current.key !== key ||
        now - grouping.current.time > 700
      ) {
        history.current.past.push(current)
        if (history.current.past.length > 50) history.current.past.shift()
      }
      history.current.future = []
      grouping.current = { key, time: now }
      setHistoryFlags({ undo: history.current.past.length > 0, redo: false })
      docRef.current = next
      setDoc(next)
      setStatus('unsaved')
    },
    [],
  )
  const patchObject = useCallback(
    (id: string, patch: Partial<SceneObject>, key = '') => {
      edit(
        (current) => ({
          ...current,
          objects: current.objects.map((o) =>
            o.id === id ? { ...o, ...patch } : o,
          ),
        }),
        key,
      )
    },
    [edit],
  )
  const undo = useCallback((redo = false) => {
    const stack = redo ? history.current.future : history.current.past
    const previous = stack.pop()
    if (!previous) return
    ;(redo ? history.current.past : history.current.future).push(docRef.current)
    setHistoryFlags({
      undo: history.current.past.length > 0,
      redo: history.current.future.length > 0,
    })
    grouping.current = { key: '', time: 0 }
    docRef.current = previous
    setDoc(previous)
    setAdditionalSelection([])
    setSelectedId((current) =>
      previous.objects.some((object) => object.id === current) ? current : null,
    )
    setStatus('unsaved')
  }, [])
  const persist = useCallback((snapshot = docRef.current) => {
    pendingWrites.current++
    if (alive.current) setStatus('saving')
    const work = savingQueue.current
      .catch(() => {})
      .then(async () => {
        const result = await saveProject({
          ...recordRef.current,
          document: snapshot,
        })
        recordRef.current = result
        savedRef.current = snapshot
        if (alive.current)
          setStatus(docRef.current === snapshot ? 'saved' : 'unsaved')
        return result
      })
    savingQueue.current = work
    return work
      .catch((e) => {
        if (alive.current) {
          setStatus('error')
          setError(`Could not save: ${message(e)}`)
        }
        throw e
      })
      .finally(() => {
        pendingWrites.current--
      })
  }, [])
  useEffect(() => {
    // An older write may finish after undo restores an earlier saved document.
    // Re-arm when that write leaves the current document unsaved as well.
    if (status !== 'unsaved') return
    const timer = window.setTimeout(() => {
      void persist(doc).catch(() => {})
    }, 650)
    return () => clearTimeout(timer)
  }, [doc, persist, status])
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingWrites.current || docRef.current !== savedRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    // Read the latest document on exit, not the snapshot from when this effect mounted.
    const flushLatest = () => {
      if (pendingWrites.current || docRef.current !== savedRef.current)
        void persist().catch(() => {})
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      flushLatest()
    }
  }, [persist])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  const removeSelected = useCallback(() => {
    const object = docRef.current.objects.find((o) => o.id === selectedId)
    if (
      !object ||
      additionalSelection.length ||
      isEffectivelyLocked(docRef.current.objects, object.id)
    )
      return
    try {
      edit((current) => {
        const objects = removeObjectTree(current.objects, object.id)
        const referenced = new Set([
          ...objects.map((o) => o.assetId),
          ...current.savedPoses.map((p) => p.assetId),
        ])
        return {
          ...current,
          objects,
          assets: current.assets.filter((a) => referenced.has(a.id)),
        }
      })
    } catch (e) {
      setError(message(e))
      return
    }
    setSelectedId(null)
    setAdditionalSelection([])
    setSelectedBone(null)
  }, [edit, selectedId, additionalSelection])

  function chooseMode(next: WorkspaceMode) {
    setMode(next)
    if (next === 'pose') {
      setTransform('translate')
      setSelectedBone(
        selected?.kind === 'figure' ? 'leftHand' : (joints[0]?.id ?? null),
      )
      setShelf(true)
    } else setSelectedBone(null)
  }
  function selectObject(id: string | null, bone: string | null = null) {
    setSelectedId(id)
    setAdditionalSelection([])
    setSelectedBone(bone)
  }
  function selectTreeObject(id: string, multiple: boolean) {
    if (!multiple) {
      selectObject(id)
      if (
        mode === 'pose' &&
        doc.objects.find((object) => object.id === id)?.kind === 'group'
      )
        setMode('arrange')
      return
    }
    const ids = new Set(selectedIds)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    const [first, ...rest] = ids
    setSelectedId(first ?? null)
    setAdditionalSelection(rest)
    setSelectedBone(null)
    setMode('arrange')
  }
  function createFolder(withSelection = false) {
    try {
      const names = new Set(docRef.current.objects.map((object) => object.name))
      let name = 'Folder'
      for (let number = 2; names.has(name); number++) name = `Folder ${number}`
      const result = createObjectGroup(
        docRef.current.objects,
        withSelection ? [...selectedIds] : [],
        name,
      )
      edit((current) => ({ ...current, objects: result.objects }))
      selectObject(result.selectedId)
      setMode('arrange')
      setTab('scene')
    } catch (e) {
      setError(message(e))
    }
  }
  function moveToFolder(ids: string[], parentId?: string) {
    try {
      const objects = reparentObjects(docRef.current.objects, ids, parentId)
      edit((current) => ({ ...current, objects }))
      setNotice(
        parentId
          ? 'Moved into folder. Scene placement preserved.'
          : 'Moved to scene root. Scene placement preserved.',
      )
    } catch (e) {
      setError(message(e))
    }
  }
  function ungroup() {
    if (!selected) return
    try {
      const objects = ungroupObject(docRef.current.objects, selected.id)
      edit((current) => ({ ...current, objects }))
      selectObject(selected.parentId ?? null)
      setNotice('Folder removed. Its contents stay in place.')
    } catch (e) {
      setError(message(e))
    }
  }
  function addObject(kind: ObjectKind) {
    if (docRef.current.objects.length >= 64) {
      setError(
        'This scene already has 64 objects. Remove an object before adding another.',
      )
      return
    }
    const object = createSceneObject(kind)
    const count = docRef.current.objects.filter((o) => o.kind === kind).length
    if (count) {
      object.name = `${object.name} ${count + 1}`
      object.position = [
        (count % 4) * 0.8,
        object.position[1],
        -Math.floor(count / 4) * 0.8,
      ]
    }
    edit((current) => ({ ...current, objects: [...current.objects, object] }))
    selectObject(object.id)
    setMode('arrange')
    setTab('scene')
  }
  function duplicate() {
    if (!selected) return
    try {
      const result = duplicateObjectTree(docRef.current.objects, selected.id)
      edit((current) => ({ ...current, objects: result.objects }))
      selectObject(result.selectedId)
    } catch (e) {
      setError(message(e))
    }
  }
  function applyPose(pose: Record<string, Vec3>) {
    if (editable) patchObject(selected.id, { pose: structuredClone(pose) })
  }
  function savePose() {
    if (!selected || !joints.length) return
    if (doc.savedPoses.length >= 64) {
      setError('The scene already contains 64 saved poses.')
      return
    }
    edit((current) => ({
      ...current,
      savedPoses: [
        ...current.savedPoses,
        {
          id: nanoid(),
          name: poseName.trim() || 'My pose',
          pose: structuredClone(selected.pose),
          ...(selected.assetId ? { assetId: selected.assetId } : {}),
        },
      ],
    }))
    setNotice('Pose added to your library.')
  }
  async function loadGlb(file: File) {
    setBusy(true)
    setError('')
    try {
      setPendingImport(await importGlb(file))
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  async function loadImage(file: File) {
    setBusy(true)
    setError('')
    try {
      setPendingImport(await importImagePlane(file))
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  function confirmImport() {
    if (!pendingImport) return
    if (doc.objects.length >= 64) {
      setError('Remove an object before importing another.')
      return
    }
    try {
      const candidate = validateDocument({
        ...docRef.current,
        assets: [...docRef.current.assets, pendingImport.asset],
        objects: [
          ...docRef.current.objects,
          {
            ...pendingImport.object,
            name:
              pendingImport.object.name.trim() ||
              (pendingImport.asset.image ? 'Image plane' : 'Imported model'),
          },
        ],
      })
      edit(() => candidate)
      selectObject(pendingImport.object.id)
      setTab('scene')
      setMode('arrange')
      setPendingImport(null)
    } catch (e) {
      setError(message(e))
    }
  }
  async function output(toDrawing = false) {
    if (!stage.current || busy) return
    setBusy(true)
    setError('')
    try {
      await persist()
      const png = await stage.current.exportPng()
      if (toDrawing) {
        const id = await sendToDrawingCanvas(
          png,
          doc.name,
          doc.width,
          doc.height,
        )
        window.location.assign(`#/drawing-canvas/${encodeURIComponent(id)}`)
      } else {
        download(png, `${safeName(doc.name)}.png`)
        setNotice('Camera image exported.')
        setOutputOpen(false)
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  function setShot() {
    const camera = stage.current?.captureCamera()
    if (camera) {
      edit((d) => ({ ...d, camera }))
      setNotice('Shot camera updated from your view.')
    }
  }
  async function leave() {
    try {
      await persist()
      window.location.hash = '#/reference-3d'
    } catch {
      /* stay with unsaved work */
    }
  }
  function shortcutEnabled(id: ReferenceShortcutId): boolean {
    if (busy || hasModal) return false
    switch (id) {
      case 'undo':
        return historyFlags.undo
      case 'redo':
      case 'redoAlternate':
        return historyFlags.redo
      case 'duplicate':
        return !!selected && doc.objects.length + descendantIds.size <= 64
      case 'group':
        return (
          selectedIds.size > 0 &&
          doc.objects.length < 64 &&
          [...selectedIds].every(
            (id) =>
              !isEffectivelyLocked(doc.objects, id) &&
              !hasLockedDescendant(doc.objects, id),
          )
        )
      case 'newFolder':
        return doc.objects.length < 64
      case 'ungroup':
        return !!transformable && selected?.kind === 'group'
      case 'moveOut':
        return !!transformable && !!selected?.parentId
      case 'delete':
      case 'deleteAlternate':
      case 'floor':
        return !!transformable
      case 'toggleVisibility':
        return !!selected
      case 'toggleLock':
        return !!selected && !inheritedLock
      case 'selectAll':
        return doc.objects.length > 0
      case 'translate':
        return mode !== 'pose' || !joints.length || canMoveJoint
      case 'scale':
        return mode !== 'pose' || !joints.length
      default:
        return true
    }
  }
  function runShortcut(id: ReferenceShortcutId) {
    // Read the live stage, since starting a gizmo drag does not re-render React.
    // The stage handles Escape first and restores the gesture's initial state.
    if (stage.current?.isTransforming() || !shortcutEnabled(id)) return
    switch (id) {
      case 'undo':
        undo()
        break
      case 'redo':
      case 'redoAlternate':
        undo(true)
        break
      case 'save':
        void persist().catch(() => {})
        break
      case 'duplicate':
        duplicate()
        break
      case 'group':
        createFolder(true)
        break
      case 'newFolder':
        createFolder()
        break
      case 'ungroup':
        ungroup()
        break
      case 'moveOut':
        if (selected?.parentId)
          moveToFolder(
            [selected.id],
            doc.objects.find((parent) => parent.id === selected.parentId)
              ?.parentId,
          )
        break
      case 'selectAll': {
        const [first, ...rest] = doc.objects.map((object) => object.id)
        setSelectedId(first ?? null)
        setAdditionalSelection(rest)
        setSelectedBone(null)
        setTab('scene')
        setMode('arrange')
        break
      }
      case 'arrange':
      case 'pose':
      case 'camera':
      case 'light':
        chooseMode(id)
        break
      case 'translate':
      case 'rotate':
      case 'scale':
        if (mode !== 'pose' || !joints.length) {
          setMode('arrange')
          setSelectedBone(null)
        }
        setTransform(id)
        break
      case 'orbit':
      case 'pan':
      case 'zoom':
        setNavigation(id)
        break
      case 'frame':
        stage.current?.frameSelected()
        break
      case 'floor':
        stage.current?.placeOnFloor()
        break
      case 'front':
      case 'side':
      case 'top':
        stage.current?.setView(id)
        break
      case 'shot':
        stage.current?.setView('camera')
        break
      case 'toggleVisibility':
        if (selected) patchObject(selected.id, { visible: !selected.visible })
        break
      case 'toggleLock':
        if (selected) patchObject(selected.id, { locked: !selected.locked })
        break
      case 'delete':
      case 'deleteAlternate':
        removeSelected()
        break
      case 'deselect':
        selectObject(null)
        break
    }
  }
  useShortcuts(
    REFERENCE_SHORTCUTS.map((shortcut) => ({
      ...shortcut,
      run: () => runShortcut(shortcut.id),
      enabled: shortcutEnabled(shortcut.id),
    })),
  )
  const patchCamera = (patch: Partial<SceneDocument['camera']>, key = '') =>
    edit((d) => ({ ...d, camera: { ...d.camera, ...patch } }), key)
  const patchLight = (patch: Partial<SceneDocument['light']>, key = '') =>
    edit((d) => ({ ...d, light: { ...d.light, ...patch } }), key)
  const patchFloor = (patch: Partial<SceneDocument['floor']>) =>
    edit((d) => ({ ...d, floor: { ...d.floor, ...patch } }))

  return (
    <div className="ref-studio ref-theme">
      <header className="ref-studio-header">
        <ToolButton title="Back to scenes" onClick={() => void leave()}>
          <ArrowLeft size={17} />
        </ToolButton>
        <div className="ref-brand">
          <Box size={21} />
          <span>
            3D Reference<small>ARTIST PRO</small>
          </span>
        </div>
        <span className="ref-divider" />
        <input
          className="ref-project-title"
          aria-label="Scene name"
          maxLength={120}
          value={doc.name}
          onChange={(e) =>
            edit(
              (d) => ({
                ...d,
                name: e.target.value.trim() ? e.target.value : 'Untitled scene',
              }),
              'name',
            )
          }
        />
        <button
          className={`ref-save-state ${status}`}
          title={shortcutTitle('save')}
          aria-label="Save scene"
          onClick={() => void persist().catch(() => {})}
        >
          {status === 'saved' ? (
            <Check size={12} />
          ) : (
            <span className="ref-status-dot" />
          )}
          {status === 'saved'
            ? 'Saved locally'
            : status === 'saving'
              ? 'Saving…'
              : status === 'error'
                ? 'Save failed · Retry'
                : 'Unsaved'}
        </button>
        <div className="ref-header-actions">
          <ToolButton
            title="Undo"
            shortcut={shortcutKeys('undo')}
            disabled={!historyFlags.undo}
            onClick={() => undo()}
          >
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton
            title="Redo"
            shortcut={shortcutKeys('redo')}
            disabled={!historyFlags.redo}
            onClick={() => undo(true)}
          >
            <Redo2 size={16} />
          </ToolButton>
          <span className="ref-divider" />
          <button
            className="ref-button ref-portable"
            onClick={() =>
              download(
                new Blob([JSON.stringify(doc)], { type: 'application/json' }),
                `${safeName(doc.name)}.reference-3d.json`,
              )
            }
          >
            <Download size={14} /> Project
          </button>
          <button
            className="ref-primary"
            disabled={busy}
            onClick={() => setOutputOpen(true)}
          >
            <Image size={15} /> Use as reference
          </button>
        </div>
      </header>
      {error && !outputOpen && !pendingImport && (
        <div className="ref-error ref-studio-error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="ref-workspace">
        <aside className="ref-left">
          <div className="ref-panel-tabs">
            <button
              className={tab === 'assets' ? 'active' : ''}
              onClick={() => setTab('assets')}
            >
              <Box size={14} /> Assets
            </button>
            <button
              className={tab === 'scene' ? 'active' : ''}
              onClick={() => setTab('scene')}
            >
              <Layers size={14} /> Scene <small>{doc.objects.length}</small>
            </button>
          </div>
          {tab === 'assets' ? (
            <div className="ref-asset-panel">
              <label className="ref-search">
                <Search size={14} />
                <input
                  aria-label="Search assets"
                  placeholder="Find an asset…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="ref-panel-heading">
                <h3>ESSENTIALS</h3>
                <span>6 assets</span>
              </div>
              <div className="ref-asset-grid">
                {ASSETS.filter((a) =>
                  `${a.label} ${a.description}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ).map(({ kind, label, icon: Icon, description }) => (
                  <button
                    key={kind}
                    className={`ref-asset-card ref-asset-${kind}`}
                    onClick={() => addObject(kind)}
                    title={description}
                  >
                    <div>
                      <Icon
                        size={kind === 'figure' ? 48 : 34}
                        strokeWidth={1.2}
                      />
                      <span>
                        <Plus size={12} />
                      </span>
                    </div>
                    <strong>{label}</strong>
                    <small>{kind === 'figure' ? 'POSEABLE' : 'STATIC'}</small>
                  </button>
                ))}
              </div>
              <button
                className="ref-import-asset"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={17} />
                <strong>Import your model</strong>
                <span>Self-contained .glb · up to 30 MB</span>
              </button>
              <button
                className="ref-import-asset ref-import-image"
                disabled={busy}
                aria-label="Import image as plane"
                onClick={() => imageInput.current?.click()}
              >
                <Image size={17} />
                <strong>Import image as plane</strong>
                <span>PNG, JPG, WebP · Keeps transparency</span>
              </button>
              {busy && (
                <p className="ref-panel-note" role="status">
                  Preparing asset…
                </p>
              )}
              <p className="ref-panel-note">
                Figures have posing controls. Imported rigs support individual
                bone rotation.
              </p>
            </div>
          ) : (
            <div className="ref-scene-panel">
              <div className="ref-panel-heading">
                <h3>SCENE OBJECTS</h3>
                <ToolButton title="Add assets" onClick={() => setTab('assets')}>
                  <Plus size={14} />
                </ToolButton>
              </div>
              {!doc.objects.length && (
                <p className="ref-panel-note">
                  Your scene is empty. Add a figure or a prop from Assets.
                </p>
              )}
              <div className="ref-folder-actions">
                <button
                  className="ref-button"
                  title={shortcutTitle('newFolder')}
                  onClick={() => createFolder()}
                  disabled={doc.objects.length >= 64}
                >
                  <FolderPlus size={14} /> New folder
                </button>
                <button
                  className="ref-button"
                  title={shortcutTitle('group')}
                  onClick={() => createFolder(true)}
                  disabled={!selectedIds.size || doc.objects.length >= 64}
                >
                  <Folder size={14} /> Group selection
                </button>
              </div>
              <p className="ref-tree-help">
                Cmd/Ctrl-click to select several. Drag into a folder or onto
                Scene root to move out.
              </p>
              <SceneTree
                objects={doc.objects}
                selectedIds={selectedIds}
                onSelect={selectTreeObject}
                onPatch={patchObject}
                onMove={moveToFolder}
              />
              <div className="ref-scene-divider" />
              <button
                className={`ref-environment-row ${mode === 'camera' ? 'selected' : ''}`}
                onClick={() => chooseMode('camera')}
              >
                <Camera size={15} />
                <span>Shot camera</span>
                <small>
                  {doc.camera.projection === 'perspective' ? 'PERSP' : 'ORTHO'}
                </small>
              </button>
              <button
                className={`ref-environment-row ${mode === 'light' ? 'selected' : ''}`}
                onClick={() => chooseMode('light')}
              >
                <Sun size={15} />
                <span>Lighting & floor</span>
              </button>
            </div>
          )}
          <div className="ref-left-footer">
            <span className="ref-green-dot" /> Local workspace{' '}
            <span>
              {doc.width} × {doc.height}
            </span>
          </div>
        </aside>
        <main className="ref-center">
          <div className="ref-modebar">
            <div className="ref-modes">
              {MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={mode === id ? 'active' : ''}
                  title={shortcutTitle(id)}
                  onClick={() => chooseMode(id)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <div className="ref-toolbar-right">
              <ToolButton
                title="Frame selected (F)"
                onClick={() => stage.current?.frameSelected()}
              >
                <Focus size={16} />
              </ToolButton>
              <ToolButton
                title="Reset editor view"
                onClick={() => stage.current?.resetView()}
              >
                <RotateCcw size={15} />
              </ToolButton>
            </div>
          </div>
          <div className="ref-viewport">
            <SceneStage
              ref={stage}
              document={doc}
              selectedId={multiSelected ? null : selectedId}
              selectedBone={selectedBone}
              mode={mode}
              transformMode={effectiveTransform}
              navigationMode={navigation}
              onSelect={selectObject}
              onCommitObject={patchObject}
              onError={setError}
            />
            <div className="ref-viewport-top">
              <span className="ref-view-label">
                <span /> SCENE VIEW
              </span>
              <select
                aria-label="Viewport angle"
                value=""
                onChange={(e) =>
                  stage.current?.setView(
                    e.target.value as
                      'front' | 'side' | 'top' | 'perspective' | 'camera',
                  )
                }
              >
                <option value="" disabled>
                  View angle…
                </option>
                <option value="perspective">Perspective</option>
                <option value="front">Front · 1</option>
                <option value="side">Side · 3</option>
                <option value="top">Top · 7</option>
                <option value="camera">Shot camera · 0</option>
              </select>
            </div>
            <div className="ref-floating-tools">
              <ToolButton
                title="Orbit view"
                shortcut={shortcutKeys('orbit')}
                active={navigation === 'orbit'}
                onClick={() => setNavigation('orbit')}
              >
                <Orbit size={17} />
              </ToolButton>
              <ToolButton
                title="Pan view"
                shortcut={shortcutKeys('pan')}
                active={navigation === 'pan'}
                onClick={() => setNavigation('pan')}
              >
                <Hand size={16} />
              </ToolButton>
              <ToolButton
                title="Zoom view"
                shortcut={shortcutKeys('zoom')}
                active={navigation === 'zoom'}
                onClick={() => setNavigation('zoom')}
              >
                <ZoomIn size={16} />
              </ToolButton>
              {(mode === 'arrange' || mode === 'pose') && (
                <>
                  <span />
                  {(['translate', 'rotate', 'scale'] as const)
                    .filter(
                      (t) =>
                        mode !== 'pose' ||
                        (t !== 'scale' && (t !== 'translate' || canMoveJoint)),
                    )
                    .map((t) => (
                      <ToolButton
                        key={t}
                        title={
                          t === 'translate'
                            ? 'Move selection'
                            : t === 'rotate'
                              ? 'Rotate selection'
                              : 'Scale selection'
                        }
                        shortcut={shortcutKeys(t)}
                        active={effectiveTransform === t}
                        onClick={() => setTransform(t)}
                      >
                        {t === 'translate' ? (
                          <Move size={17} />
                        ) : t === 'rotate' ? (
                          <RotateCw size={17} />
                        ) : (
                          <Maximize size={17} />
                        )}
                      </ToolButton>
                    ))}
                </>
              )}
            </div>
            {mode === 'camera' && (
              <button className="ref-set-camera ref-primary" onClick={setShot}>
                <Camera size={14} /> Set shot from this view
              </button>
            )}
            <div className="ref-viewport-caption">
              {selected ? (
                <>
                  <span>{selected.name}</span>
                  {joint && (
                    <>
                      <i>/</i>
                      {joint.label}
                    </>
                  )}
                  {!editable && <Lock size={12} />}
                </>
              ) : multiSelected ? (
                `${selectedIds.size} objects selected`
              ) : (
                'Select a subject to begin'
              )}
            </div>
          </div>
          <div className="ref-hintbar">
            <span>{MODES.find((m) => m.id === mode)?.hint}</span>
            <button onClick={() => setShelf(!shelf)}>
              <PersonStanding size={13} /> Pose library{' '}
              <ChevronDown size={13} className={!shelf ? 'collapsed' : ''} />
            </button>
          </div>
          {shelf && (
            <section className="ref-pose-shelf" aria-label="Pose library">
              <div className="ref-pose-shelf-head">
                <div>
                  <h3>Start with a gesture</h3>
                  <span>
                    {selected?.kind === 'figure'
                      ? 'Apply a pose, then make it yours.'
                      : 'Select a drawing figure to use built-in poses.'}
                  </span>
                </div>
                <span className="ref-small-label">
                  {POSE_PRESETS.length} PRESETS
                </span>
              </div>
              <div className="ref-pose-cards">
                {POSE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="ref-pose-card"
                    title={preset.description}
                    disabled={!editable || selected.kind !== 'figure'}
                    onClick={() => {
                      applyPose(preset.pose)
                      setMode('pose')
                      setSelectedBone('leftHand')
                      setTransform('translate')
                    }}
                  >
                    <PoseGlyph pose={preset.pose} />
                    <span>{preset.name}</span>
                  </button>
                ))}
                {doc.savedPoses
                  .filter((p) => p.assetId === selected?.assetId)
                  .map((p) => (
                    <div key={p.id} className="ref-saved-pose">
                      <button
                        className="ref-pose-card"
                        disabled={!editable || !joints.length}
                        onClick={() => applyPose(p.pose)}
                      >
                        <PoseGlyph pose={p.pose} />
                        <span>{p.name}</span>
                      </button>
                      <button
                        aria-label={`Delete pose ${p.name}`}
                        className="ref-pose-delete"
                        onClick={() =>
                          edit((d) => ({
                            ...d,
                            savedPoses: d.savedPoses.filter(
                              (v) => v.id !== p.id,
                            ),
                          }))
                        }
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </main>
        <aside className="ref-inspector">
          <div className="ref-inspector-title">
            <SlidersHorizontal size={14} />
            <strong>
              {mode === 'camera'
                ? 'Camera & output'
                : mode === 'light'
                  ? 'Lighting & scene'
                  : mode === 'pose'
                    ? 'Pose controls'
                    : 'Object properties'}
            </strong>
          </div>
          <div className="ref-inspector-scroll">
            {(mode === 'arrange' || mode === 'pose') &&
              (multiSelected ? (
                <Section title={`${selectedIds.size} OBJECTS SELECTED`}>
                  <p className="ref-panel-note">
                    Put the selected objects into a folder to transform and
                    manage them together.
                  </p>
                  <button
                    className="ref-button ref-wide"
                    title={shortcutTitle('group')}
                    onClick={() => createFolder(true)}
                    disabled={doc.objects.length >= 64}
                  >
                    <FolderPlus size={14} /> Group selection
                  </button>
                </Section>
              ) : selected ? (
                <>
                  <Section
                    title={
                      selected.kind === 'group'
                        ? 'FOLDER GROUP'
                        : selected.kind === 'figure'
                          ? 'DRAWING FIGURE'
                          : selected.kind === 'imported'
                            ? 'IMPORTED MODEL'
                            : selected.kind === 'image'
                              ? 'IMAGE PLANE'
                              : 'STATIC OBJECT'
                    }
                    extra={
                      <span
                        className="ref-color-dot"
                        style={{ background: selected.color }}
                      />
                    }
                  >
                    <input
                      className="ref-object-name"
                      aria-label="Object name"
                      value={selected.name}
                      maxLength={120}
                      disabled={!editable}
                      onChange={(e) =>
                        patchObject(
                          selected.id,
                          {
                            name: e.target.value.trim()
                              ? e.target.value
                              : 'Object',
                          },
                          'object-name',
                        )
                      }
                    />
                    <div className="ref-object-actions">
                      <button
                        className="ref-button"
                        title={shortcutTitle('duplicate')}
                        onClick={duplicate}
                        disabled={doc.objects.length + descendantIds.size > 64}
                      >
                        <Copy size={13} /> Duplicate
                      </button>
                      <ToolButton
                        title={
                          selected.kind === 'group'
                            ? 'Delete folder and contents'
                            : 'Delete selected object'
                        }
                        shortcut={shortcutKeys('delete')}
                        onClick={removeSelected}
                        disabled={!transformable}
                      >
                        <Trash2 size={14} />
                      </ToolButton>
                      <ToolButton
                        disabled={inheritedLock}
                        shortcut={shortcutKeys('toggleLock')}
                        title={
                          inheritedLock
                            ? 'Locked by containing folder'
                            : selected.locked
                              ? 'Unlock selected object'
                              : 'Lock selected object'
                        }
                        onClick={() =>
                          patchObject(selected.id, { locked: !selected.locked })
                        }
                      >
                        {!editable ? <Lock size={14} /> : <Unlock size={14} />}
                      </ToolButton>
                    </div>
                    {!editable && (
                      <p className="ref-panel-note">
                        {inheritedLock
                          ? 'Unlock the containing folder to edit this object.'
                          : 'Unlock this object to edit it.'}
                      </p>
                    )}
                    {subtreeLocked && editable && (
                      <p className="ref-panel-note">
                        Unlock the objects inside this folder to transform,
                        move, ungroup, or delete it.
                      </p>
                    )}
                    <label className="ref-folder-field">
                      <span className="ref-field-caption">Move to folder</span>
                      <select
                        aria-label="Move to folder"
                        className="ref-wide"
                        value={selected.parentId ?? ''}
                        disabled={!transformable}
                        onChange={(event) =>
                          moveToFolder(
                            [selected.id],
                            event.target.value || undefined,
                          )
                        }
                      >
                        <option value="">Scene root</option>
                        {doc.objects
                          .filter(
                            (object) =>
                              object.kind === 'group' &&
                              !descendantIds.has(object.id),
                          )
                          .map((folder) => (
                            <option
                              key={folder.id}
                              value={folder.id}
                              disabled={isEffectivelyLocked(
                                doc.objects,
                                folder.id,
                              )}
                            >
                              {folderPath(doc.objects, folder)}
                            </option>
                          ))}
                      </select>
                    </label>
                    {selected.parentId && (
                      <button
                        className="ref-button ref-wide ref-out-folder"
                        title={shortcutTitle('moveOut')}
                        disabled={!transformable}
                        onClick={() =>
                          moveToFolder(
                            [selected.id],
                            doc.objects.find(
                              (parent) => parent.id === selected.parentId,
                            )?.parentId,
                          )
                        }
                      >
                        <CornerUpLeft size={14} /> Move out of folder
                      </button>
                    )}
                    {selected.kind === 'group' && (
                      <>
                        <p className="ref-panel-note">
                          {descendantIds.size - 1} items inside · Actions apply
                          to all contents.
                        </p>
                        <button
                          className="ref-button ref-wide"
                          disabled={!transformable}
                          title={shortcutTitle('ungroup')}
                          onClick={ungroup}
                        >
                          Ungroup folder
                        </button>
                      </>
                    )}
                  </Section>
                  {mode === 'arrange' ? (
                    <fieldset disabled={!transformable}>
                      <Section title="TRANSFORM">
                        {selected.parentId && (
                          <p className="ref-panel-note">
                            Values are relative to the containing folder.
                          </p>
                        )}
                        <VectorFields
                          label="Position"
                          value={selected.position}
                          onChange={(position) =>
                            patchObject(selected.id, { position })
                          }
                        />
                        <VectorFields
                          label="Rotation · degrees"
                          value={selected.rotation}
                          angular
                          onChange={(rotation) =>
                            patchObject(selected.id, { rotation })
                          }
                        />
                        {selected.kind === 'group' ? (
                          <div className="ref-vector">
                            <span className="ref-field-caption">
                              Uniform scale
                            </span>
                            <NumberField
                              label="Scale"
                              value={selected.scale[0]}
                              min={0.001}
                              max={1000}
                              onChange={(value) =>
                                patchObject(selected.id, {
                                  scale: [value, value, value],
                                })
                              }
                            />
                            <p className="ref-panel-note">
                              Scales the contents together and keeps their
                              proportions.
                            </p>
                          </div>
                        ) : (
                          <VectorFields
                            label="Scale"
                            value={selected.scale}
                            positive
                            onChange={(scale) =>
                              patchObject(selected.id, { scale })
                            }
                          />
                        )}
                        <button
                          className="ref-button ref-wide"
                          title={shortcutTitle('floor')}
                          onClick={() => stage.current?.placeOnFloor()}
                        >
                          <ArrowDownToLine size={14} /> Place on floor
                        </button>
                      </Section>
                      {selected.kind !== 'group' && (
                        <Section title="APPEARANCE">
                          {asset?.image ? (
                            <>
                              <div className="ref-image-thumbnail">
                                <img src={asset.dataUrl} alt={asset.name} />
                              </div>
                              <p className="ref-panel-note">
                                {asset.image.width} × {asset.image.height} px ·
                                Double-sided
                                <br />
                                Original colors and transparency are preserved.
                              </p>
                              <div className="ref-preset-row ref-image-orientation">
                                <button
                                  onClick={() =>
                                    patchObject(selected.id, {
                                      rotation: [0, 0, 0],
                                    })
                                  }
                                >
                                  Stand upright
                                </button>
                                <button
                                  onClick={() =>
                                    patchObject(selected.id, {
                                      rotation: [-Math.PI / 2, 0, 0],
                                      position: [
                                        selected.position[0],
                                        Math.max(0.01, selected.position[1]),
                                        selected.position[2],
                                      ],
                                    })
                                  }
                                >
                                  Lay flat
                                </button>
                              </div>
                              <button
                                className="ref-button ref-wide"
                                onClick={() =>
                                  patchObject(selected.id, {
                                    scale: [
                                      selected.scale[0],
                                      selected.scale[0],
                                      selected.scale[0],
                                    ],
                                  })
                                }
                              >
                                Restore image proportions
                              </button>
                            </>
                          ) : (
                            <>
                              <label className="ref-color-field">
                                Object color
                                <input
                                  type="color"
                                  value={selected.color}
                                  onChange={(e) =>
                                    patchObject(
                                      selected.id,
                                      { color: e.target.value },
                                      'object-color',
                                    )
                                  }
                                />
                              </label>
                              {asset && (
                                <p className="ref-panel-note">
                                  {asset.bones.length
                                    ? `${asset.bones.length} bones · Basic bone posing`
                                    : 'Static model · No skeleton detected'}
                                  <br />
                                  {asset.name}
                                </p>
                              )}
                            </>
                          )}
                        </Section>
                      )}
                    </fieldset>
                  ) : joints.length ? (
                    <fieldset disabled={!editable}>
                      <Section title="SELECT A BODY PART">
                        <select
                          className="ref-wide"
                          aria-label="Selected joint"
                          value={selectedBone ?? ''}
                          onChange={(e) => {
                            setSelectedBone(e.target.value)
                            if (selected.kind === 'imported')
                              setTransform('rotate')
                          }}
                        >
                          <option value="">Choose a joint…</option>
                          {joints.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.label}
                            </option>
                          ))}
                        </select>
                        {joint && (
                          <>
                            <VectorFields
                              label="Joint rotation · degrees"
                              value={selected.pose[joint.id] ?? [0, 0, 0]}
                              angular
                              onChange={(rotation) =>
                                patchObject(selected.id, {
                                  pose: {
                                    ...selected.pose,
                                    [joint.id]: rotation,
                                  },
                                })
                              }
                            />
                            <button
                              className="ref-button ref-wide"
                              onClick={() => {
                                const pose = { ...selected.pose }
                                delete pose[joint.id]
                                applyPose(pose)
                              }}
                            >
                              <RotateCcw size={13} /> Reset this joint
                            </button>
                          </>
                        )}
                        <p className="ref-panel-note">
                          {selected.kind === 'figure'
                            ? 'Move a hand or foot with the arrows to bend its limb. Rotate any joint for a precise adjustment.'
                            : 'Select a bone, then use the rotation rings. This model uses its original skeleton.'}
                        </p>
                      </Section>
                      <Section title="POSE ACTIONS">
                        <button
                          className="ref-button ref-wide"
                          title={shortcutTitle('floor')}
                          onClick={() => stage.current?.placeOnFloor()}
                        >
                          <ArrowDownToLine size={13} /> Place on floor
                        </button>
                        <button
                          className="ref-button ref-wide"
                          disabled={selected.kind !== 'figure'}
                          onClick={() => applyPose(mirrorPose(selected.pose))}
                        >
                          <Copy size={13} /> Mirror pose
                        </button>
                        <button
                          className="ref-button ref-wide"
                          onClick={() => applyPose({})}
                        >
                          <RotateCcw size={13} /> Reset entire pose
                        </button>
                      </Section>
                      <Section title="KEEP THIS GESTURE">
                        <input
                          aria-label="Pose name"
                          value={poseName}
                          maxLength={80}
                          onChange={(e) => setPoseName(e.target.value)}
                        />
                        <button
                          className="ref-button ref-wide"
                          onClick={savePose}
                        >
                          <Save size={13} /> Save pose to library
                        </button>
                      </Section>
                    </fieldset>
                  ) : (
                    <div className="ref-inspector-empty">
                      <Box size={32} />
                      <strong>This is a static object</strong>
                      <p>
                        Choose a drawing figure or an imported model with a
                        skeleton to adjust a pose.
                      </p>
                      <button
                        className="ref-button"
                        onClick={() => chooseMode('arrange')}
                      >
                        Arrange object
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="ref-inspector-empty">
                  <Scan size={36} />
                  <strong>A scene starts with a subject</strong>
                  <p>
                    Select an object in the workspace, or add one from the asset
                    library.
                  </p>
                  <button
                    className="ref-button"
                    onClick={() => addObject('figure')}
                  >
                    <Plus size={14} /> Add drawing figure
                  </button>
                </div>
              ))}
            {mode === 'camera' && (
              <>
                <Section title="SHOT CAMERA">
                  <p className="ref-panel-note">
                    Your shot stays fixed while you explore the scene.
                  </p>
                  <button className="ref-primary ref-wide" onClick={setShot}>
                    <Camera size={14} /> Set from current view
                  </button>
                  <button
                    className="ref-button ref-wide"
                    onClick={() => stage.current?.setView('camera')}
                  >
                    <Eye size={14} /> Look through camera
                  </button>
                  <label className="ref-stack-label">
                    Projection
                    <select
                      value={doc.camera.projection}
                      onChange={(e) =>
                        patchCamera({
                          projection: e.target.value as
                            'perspective' | 'orthographic',
                        })
                      }
                    >
                      <option value="perspective">Perspective</option>
                      <option value="orthographic">Orthographic</option>
                    </select>
                  </label>
                  {doc.camera.projection === 'perspective' ? (
                    <RangeField
                      label="Field of view"
                      value={doc.camera.fov}
                      min={15}
                      max={100}
                      suffix="°"
                      onChange={(fov) => patchCamera({ fov }, 'camera-fov')}
                    />
                  ) : (
                    <RangeField
                      label="View height"
                      value={doc.camera.orthoSize}
                      min={0.5}
                      max={15}
                      step={0.1}
                      onChange={(orthoSize) =>
                        patchCamera({ orthoSize }, 'camera-ortho')
                      }
                    />
                  )}
                  <RangeField
                    label="Camera roll"
                    value={degrees(doc.camera.roll)}
                    min={-90}
                    max={90}
                    suffix="°"
                    onChange={(v) =>
                      patchCamera({ roll: radians(v) }, 'camera-roll')
                    }
                  />
                  <div className="ref-preset-row">
                    {(['front', 'side', 'top', 'perspective'] as const).map(
                      (view) => (
                        <button
                          key={view}
                          onClick={() => patchCamera(cameraView(view))}
                        >
                          {view === 'perspective' ? '¾ view' : view}
                        </button>
                      ),
                    )}
                  </div>
                </Section>
                <Section title="OUTPUT SIZE">
                  <div className="ref-two-fields">
                    <NumberField
                      label="Width"
                      value={doc.width}
                      min={64}
                      max={4096}
                      step={1}
                      onChange={(width) =>
                        edit((d) => ({ ...d, width: Math.round(width) }))
                      }
                    />
                    <NumberField
                      label="Height"
                      value={doc.height}
                      min={64}
                      max={4096}
                      step={1}
                      onChange={(height) =>
                        edit((d) => ({ ...d, height: Math.round(height) }))
                      }
                    />
                  </div>
                  <Toggle
                    label="Transparent background"
                    value={doc.transparent}
                    onChange={(transparent) =>
                      edit((d) => ({ ...d, transparent }))
                    }
                  />
                  <p className="ref-panel-note">
                    The visible floor is included in the image. Hide it in Light
                    for an isolated subject.
                  </p>
                </Section>
                <Section title="SAVED CAMERA VIEWS">
                  <button
                    className="ref-button ref-wide"
                    disabled={doc.savedViews.length >= 24}
                    onClick={() =>
                      edit((d) => ({
                        ...d,
                        savedViews: [
                          ...d.savedViews,
                          {
                            id: nanoid(),
                            name: `View ${d.savedViews.length + 1}`,
                            camera: structuredClone(d.camera),
                          },
                        ],
                      }))
                    }
                  >
                    <Plus size={13} /> Save this camera
                  </button>
                  {doc.savedViews.map((view) => (
                    <div className="ref-saved-view" key={view.id}>
                      <button
                        onClick={() =>
                          patchCamera(structuredClone(view.camera))
                        }
                      >
                        <Camera size={13} />
                        {view.name}
                      </button>
                      <ToolButton
                        title={`Delete ${view.name}`}
                        onClick={() =>
                          edit((d) => ({
                            ...d,
                            savedViews: d.savedViews.filter(
                              (v) => v.id !== view.id,
                            ),
                          }))
                        }
                      >
                        <X size={12} />
                      </ToolButton>
                    </div>
                  ))}
                </Section>
              </>
            )}
            {mode === 'light' && (
              <>
                <Section title="LIGHT PRESETS">
                  <div className="ref-preset-row">
                    {[
                      {
                        name: 'Studio',
                        azimuth: -35,
                        elevation: 45,
                        intensity: 2.4,
                        ambient: 1.2,
                      },
                      {
                        name: 'Side',
                        azimuth: 80,
                        elevation: 25,
                        intensity: 3,
                        ambient: 0.4,
                      },
                      {
                        name: 'Backlit',
                        azimuth: 170,
                        elevation: 35,
                        intensity: 3,
                        ambient: 0.6,
                      },
                    ].map((p) => (
                      <button
                        key={p.name}
                        onClick={() =>
                          patchLight({
                            azimuth: p.azimuth,
                            elevation: p.elevation,
                            intensity: p.intensity,
                            ambient: p.ambient,
                          })
                        }
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </Section>
                <Section title="MAIN LIGHT">
                  <RangeField
                    label="Direction"
                    value={doc.light.azimuth}
                    min={-180}
                    max={180}
                    suffix="°"
                    onChange={(azimuth) =>
                      patchLight({ azimuth }, 'light-direction')
                    }
                  />
                  <RangeField
                    label="Elevation"
                    value={doc.light.elevation}
                    min={5}
                    max={90}
                    suffix="°"
                    onChange={(elevation) =>
                      patchLight({ elevation }, 'light-elevation')
                    }
                  />
                  <RangeField
                    label="Brightness"
                    value={doc.light.intensity}
                    min={0}
                    max={5}
                    step={0.1}
                    onChange={(intensity) =>
                      patchLight({ intensity }, 'light-intensity')
                    }
                  />
                  <RangeField
                    label="Ambient fill"
                    value={doc.light.ambient}
                    min={0}
                    max={3}
                    step={0.1}
                    onChange={(ambient) =>
                      patchLight({ ambient }, 'light-ambient')
                    }
                  />
                  <label className="ref-color-field">
                    Light color
                    <input
                      type="color"
                      value={doc.light.color}
                      onChange={(e) =>
                        patchLight({ color: e.target.value }, 'light-color')
                      }
                    />
                  </label>
                  <Toggle
                    label="Cast shadows"
                    value={doc.light.shadows}
                    onChange={(shadows) => patchLight({ shadows })}
                  />
                </Section>
                <Section title="FLOOR & BACKGROUND">
                  <Toggle
                    label="Show floor"
                    value={doc.floor.visible}
                    onChange={(visible) => patchFloor({ visible })}
                  />
                  <Toggle
                    label="Show editor grid"
                    value={doc.floor.grid}
                    onChange={(grid) => patchFloor({ grid })}
                  />
                  <label className="ref-color-field">
                    Floor color
                    <input
                      type="color"
                      value={doc.floor.color}
                      onChange={(e) => patchFloor({ color: e.target.value })}
                    />
                  </label>
                  <label className="ref-color-field">
                    Background
                    <input
                      type="color"
                      value={doc.background}
                      onChange={(e) =>
                        edit(
                          (d) => ({ ...d, background: e.target.value }),
                          'background-color',
                        )
                      }
                    />
                  </label>
                </Section>
              </>
            )}
            <Section title="REFERENCE DISPLAY">
              <select
                className="ref-wide"
                aria-label="Reference display"
                value={doc.displayStyle}
                onChange={(e) =>
                  edit((d) => ({
                    ...d,
                    displayStyle: e.target
                      .value as SceneDocument['displayStyle'],
                  }))
                }
              >
                <option value="clay">Clay · study the form</option>
                <option value="materials">Materials · original colors</option>
                <option value="silhouette">
                  Silhouette · read the gesture
                </option>
              </select>
            </Section>
          </div>
        </aside>
      </div>
      <input
        type="file"
        hidden
        ref={fileInput}
        accept=".glb"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void loadGlb(file)
        }}
      />
      <input
        type="file"
        hidden
        ref={imageInput}
        aria-label="Image plane file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void loadImage(file)
        }}
      />
      {notice && (
        <div className="ref-toast" role="status">
          <Check size={14} />
          {notice}
        </div>
      )}
      {outputOpen && (
        <div
          className="ref-modal-backdrop"
          onClick={() => !busy && setOutputOpen(false)}
        >
          <section
            className="ref-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ref-output-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="ref-modal-close"
              aria-label="Close export"
              disabled={busy}
              onClick={() => setOutputOpen(false)}
            >
              <X size={18} />
            </button>
            <div className="ref-modal-icon">
              <Image size={26} />
            </div>
            {error && (
              <div className="ref-error" role="alert">
                {error}
              </div>
            )}
            <h2 id="ref-output-title">Your scene. Your next drawing.</h2>
            <p>
              Capture the shot camera at {doc.width} × {doc.height}. Editor
              grids and posing controls stay out of your image.
            </p>
            <div className="ref-output-summary">
              <Camera size={16} />
              <span>
                {doc.camera.projection === 'perspective'
                  ? 'Perspective camera'
                  : 'Orthographic camera'}
                <small>
                  {doc.transparent
                    ? 'Transparent background'
                    : 'Scene background'}{' '}
                  · {doc.displayStyle}
                </small>
              </span>
            </div>
            <button
              className="ref-primary ref-wide"
              disabled={busy}
              onClick={() => void output(true)}
            >
              <Plus size={16} />
              {busy ? 'Preparing reference…' : 'Open in Drawing Canvas'}
            </button>
            <p className="ref-modal-caption">
              Creates a new canvas with a locked reference layer and an empty
              drawing layer.
            </p>
            <button
              className="ref-button ref-wide"
              disabled={busy}
              onClick={() => void output(false)}
            >
              <Download size={15} /> Export PNG
            </button>
          </section>
        </div>
      )}
      {pendingImport && (
        <div className="ref-modal-backdrop">
          <section
            className="ref-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ref-import-title"
          >
            <button
              className="ref-modal-close"
              aria-label="Cancel import"
              onClick={() => setPendingImport(null)}
            >
              <X size={18} />
            </button>
            <div className="ref-modal-icon">
              {pendingImport.asset.image ? (
                <Image size={26} />
              ) : (
                <Box size={26} />
              )}
            </div>
            {error && (
              <div className="ref-error" role="alert">
                {error}
              </div>
            )}
            <h2 id="ref-import-title">
              {pendingImport.asset.image
                ? 'Add an image plane'
                : 'Add your model'}
            </h2>
            <p>{pendingImport.asset.name}</p>
            {pendingImport.asset.image && (
              <div className="ref-image-thumbnail ref-import-image-preview">
                <img
                  src={pendingImport.asset.dataUrl}
                  alt="Image plane preview"
                />
              </div>
            )}
            <label className="ref-stack-label">
              Name in scene
              <input
                maxLength={120}
                value={pendingImport.object.name}
                onChange={(e) =>
                  setPendingImport({
                    ...pendingImport,
                    object: {
                      ...pendingImport.object,
                      name:
                        e.target.value ||
                        (pendingImport.asset.image
                          ? 'Image plane'
                          : 'Imported model'),
                    },
                  })
                }
              />
            </label>
            <div className="ref-import-info">
              <strong>
                {pendingImport.asset.image
                  ? `${pendingImport.asset.image.width} × ${pendingImport.asset.image.height} px · Image plane`
                  : pendingImport.asset.bones.length
                    ? `Skeleton detected · ${pendingImport.asset.bones.length} bones`
                    : 'Static model'}
              </strong>
              <p>
                {pendingImport.asset.image
                  ? 'A flat, double-sided plane with the proportions and transparency of your image. Move, rotate, and scale it like any other object.'
                  : pendingImport.asset.bones.length
                    ? 'Individual bones can be rotated in Pose mode. Built-in humanoid presets apply to drawing figures only.'
                    : 'Move, rotate, and scale this model to arrange your scene.'}
              </p>
              <span>
                {pendingImport.asset.image
                  ? 'Included in saved projects and camera exports. Image colors stay unchanged by scene lighting.'
                  : 'Normalized to a usable scene size. Adjust its scale and orientation after placing it.'}
              </span>
            </div>
            <button className="ref-primary ref-wide" onClick={confirmImport}>
              <Plus size={15} /> Add to scene
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
