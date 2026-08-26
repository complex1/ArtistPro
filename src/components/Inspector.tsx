import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Copy, Group, Link, Lock, Trash2, Ungroup, Unlink, Unlock } from 'lucide-react'
import {
  DEFAULT_GUIDE_COLORS,
  guideFamilyColor,
  guideFamilyCount,
  withGuideColor,
} from '../model/grid'
import {
  evaluateNodeAtTime,
  evaluateTransform,
  isArmed,
  propertyLabel,
} from '../model/animation'
import { pivotAnchor, walkNodes } from '../model/scene'
import { retargetPivot } from '../model/transform'
import type {
  AnimatableProperty,
  GridSettings,
  ImageNode,
  EditorNode,
  PivotPreset,
  Vec2,
} from '../model/types'
import {
  canGroup,
  canUngroup,
  selectedNode,
  useEditorStore,
} from '../store/editorStore'
import { Button, CollapsibleSection, IconButton, Select } from '../ui/controls'
import {
  AngleDial,
  ColorField,
  PivotPicker,
  PropertyRow,
  ScrubField,
  SliderField,
  TextField,
} from '../ui/fields'
import { naturalTextWidth } from '../model/text'
import { chromaKey, processChroma } from '../model/image'
import { EffectsPanel } from './EffectsPanel'
import { AnimationPresetModal } from './AnimationPresetModal'

const gridTypes: { value: GridSettings['type']; label: string }[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'orthographic', label: 'Orthographic' },
  { value: 'perspective-1', label: '1-point perspective' },
  { value: 'perspective-2', label: '2-point perspective' },
  { value: 'perspective-3', label: '3-point perspective' },
  { value: 'fisheye', label: 'Fisheye' },
]

function createGridSettings(
  type: GridSettings['type'],
  width: number,
  height: number,
): GridSettings {
  const common = {
    enabled: true,
    locked: false,
    color: '#4f8cff',
    opacity: 0.35,
    snap: false,
    snapThreshold: 8,
  }
  if (type === 'grid') {
    return { ...common, type, spacing: 40, origin: { x: width / 2, y: height / 2 } }
  }
  if (type === 'orthographic') {
    return {
      ...common,
      type,
      spacing: 40,
      origin: { x: width / 2, y: height / 2 },
      angles: [0, 60, 120],
      guideColors: [...DEFAULT_GUIDE_COLORS],
    }
  }
  if (type === 'fisheye') {
    return {
      ...common,
      type,
      spacing: 40,
      center: { x: width / 2, y: height / 2 },
      radius: Math.min(width, height) * 0.42,
    }
  }
  const horizon = height * 0.45
  if (type === 'perspective-1') {
    return {
      ...common,
      type,
      density: 12,
      horizonAngle: 0,
      vanishingPoints: [{ x: width / 2, y: horizon }],
      guideColors: [DEFAULT_GUIDE_COLORS[0]],
    }
  }
  return {
    ...common,
    type,
    density: 12,
    vanishingPoints: [
      { x: -width * 0.4, y: horizon },
      { x: width * 1.4, y: horizon },
      ...(type === 'perspective-3'
        ? [{ x: width / 2, y: height * 2 }]
        : []),
    ],
    guideColors: DEFAULT_GUIDE_COLORS.slice(
      0,
      type === 'perspective-3' ? 3 : 2,
    ),
  }
}

export function Inspector() {
  const document = useEditorStore((state) => state.document)
  const editingSymbolId = useEditorStore((state) => state.editingSymbolId)
  const editingSymbol =
    document.version === 2
      ? document.symbols.find((symbol) => symbol.id === editingSymbolId)
      : undefined
  const nodes = (editingSymbol?.children ?? document.children) as EditorNode[]
  const animation = editingSymbol?.animation ?? document.animation
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const updateNode = useEditorStore((state) => state.updateNode)
  const editTransform = useEditorStore((state) => state.editTransform)
  const mode = useEditorStore((state) => state.mode)
  const playhead = useEditorStore((state) => state.playhead)
  const togglePropertyArm = useEditorStore((state) => state.togglePropertyArm)
  const applyAnimationPreset = useEditorStore(
    (state) => state.applyAnimationPreset,
  )
  const setMotionPath = useEditorStore((state) => state.setMotionPath)
  const updateArtboard = useEditorStore((state) => state.updateArtboard)
  const setDocumentName = useEditorStore((state) => state.setDocumentName)
  const setViewport = useEditorStore((state) => state.setViewport)
  const setDuration = useEditorStore((state) => state.setDuration)
  const renameSymbol = useEditorStore((state) => state.renameSymbol)
  const exitSymbol = useEditorStore((state) => state.exitSymbol)
  const updateSymbolInstancePlayback = useEditorStore(
    (state) => state.updateSymbolInstancePlayback,
  )
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const removeSelected = useEditorStore((state) => state.removeSelected)
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const [scaleLinked, setScaleLinked] = useState(true)
  const [presetOpen, setPresetOpen] = useState(false)
  const node = selectedNode(nodes, selectedIds)
  const grid = document.artboard.grid
  const grouping = canGroup(nodes, selectedIds)
  const ungrouping = canUngroup(nodes, selectedIds)

  if (mode === 'preview') {
    return (
      <aside className="inspector">
        <CollapsibleSection title="Preview">
          <p className="section-note">
            Playing the clip. Switch back to Animate to edit keys.
          </p>
        </CollapsibleSection>
      </aside>
    )
  }

  if (selectedIds.length > 1) {
    return (
      <aside className="inspector">
        <CollapsibleSection title="Selection">
          <p className="section-note">{selectedIds.length} layers selected. Shift-click or drag a box to add more.</p>
          <div className="row-actions">
            <Button disabled={!grouping} onClick={groupSelected}>
              <Group size={13} /> Group
            </Button>
            <Button onClick={duplicateSelected}>
              <Copy size={13} /> Duplicate
            </Button>
            <Button onClick={removeSelected} aria-label="Delete layers">
              <Trash2 size={13} />
            </Button>
          </div>
        </CollapsibleSection>
      </aside>
    )
  }

  if (!node && editingSymbol) {
    return (
      <aside className="inspector">
        <CollapsibleSection title="Symbol">
          <PropertyRow label="Name">
            <TextField
              label="Symbol name"
              value={editingSymbol.name}
              onValue={(name) => renameSymbol(editingSymbol.id, name)}
            />
          </PropertyRow>
          <PropertyRow label="Size">
            <span className="geometry-value">
              {editingSymbol.width} × {editingSymbol.height}
            </span>
          </PropertyRow>
          <PropertyRow label="Duration">
            <ScrubField
              label="SEC"
              value={editingSymbol.animation.duration}
              min={0.1}
              max={60}
              step={0.1}
              precision={2}
              onValue={setDuration}
            />
          </PropertyRow>
          <div className="row-actions">
            <Button onClick={exitSymbol}>Back to scene</Button>
          </div>
        </CollapsibleSection>
      </aside>
    )
  }

  if (!node) {
    return (
      <aside className="inspector">
        <CollapsibleSection title="Canvas">
          <PropertyRow label="Name">
            <TextField
              label="Document name"
              value={document.name}
              onValue={setDocumentName}
            />
          </PropertyRow>
          <PropertyRow label="Size">
            <ScrubField
              label="W"
              value={document.artboard.width}
              min={1}
              onValue={(width) => updateArtboard({ width })}
            />
            <ScrubField
              label="H"
              value={document.artboard.height}
              min={1}
              onValue={(height) => updateArtboard({ height })}
            />
          </PropertyRow>
          <PropertyRow label="Background">
            <ColorField
              label="Canvas background"
              value={document.artboard.background}
              onValue={(background) => updateArtboard({ background })}
            />
          </PropertyRow>
          <div className="row-actions">
            <Button onClick={() => setViewport(0.82, { x: 0, y: 0 })}>
              Reset view
            </Button>
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Grid">
          <PropertyRow label="Type">
            <Select
              aria-label="Grid type"
              value={grid.type}
              disabled={grid.locked}
              onChange={(event) =>
                updateArtboard({
                  grid: createGridSettings(
                    event.target.value as GridSettings['type'],
                    document.artboard.width,
                    document.artboard.height,
                  ),
                })
              }
            >
              {gridTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
          </PropertyRow>
          <div className="row-actions">
            <Button
              aria-pressed={grid.enabled}
              onClick={() => updateArtboard({ grid: { ...grid, enabled: !grid.enabled } })}
            >
              {grid.enabled ? 'Hide grid' : 'Show grid'}
            </Button>
            <Button
              aria-pressed={grid.snap}
              onClick={() => updateArtboard({ grid: { ...grid, snap: !grid.snap } })}
            >
              {grid.snap ? 'Snap on' : 'Snap off'}
            </Button>
            <Button
              aria-pressed={grid.locked}
              onClick={() => updateArtboard({ grid: { ...grid, locked: !grid.locked } })}
            >
              {grid.locked ? <Unlock size={13} /> : <Lock size={13} />}
              {grid.locked ? 'Unlock' : 'Lock'}
            </Button>
          </div>
          {'spacing' in grid && (
            <PropertyRow label="Spacing">
              <ScrubField
                label="PX"
                value={grid.spacing}
                min={8}
                disabled={grid.locked}
                onValue={(spacing) => updateArtboard({ grid: { ...grid, spacing } })}
              />
            </PropertyRow>
          )}
          {'density' in grid && (
            <PropertyRow label="Density">
              <ScrubField
                label="N"
                value={grid.density}
                min={4}
                max={40}
                disabled={grid.locked}
                onValue={(density) => updateArtboard({ grid: { ...grid, density } })}
              />
            </PropertyRow>
          )}
          {grid.type === 'perspective-1' && (
            <PropertyRow label="Horizon angle">
              <ScrubField
                label="°"
                value={Math.round(grid.horizonAngle)}
                disabled={grid.locked}
                onValue={(horizonAngle) =>
                  updateArtboard({ grid: { ...grid, horizonAngle } })
                }
              />
            </PropertyRow>
          )}
          <PropertyRow label="Color">
            <ColorField
              label="Grid color"
              value={grid.color}
              disabled={grid.locked}
              onValue={(color) => updateArtboard({ grid: { ...grid, color } })}
            />
          </PropertyRow>
          {Array.from({ length: guideFamilyCount(grid) }, (_, index) => (
            <PropertyRow key={index} label={`Direction ${index + 1}`}>
              <ColorField
                label={`Direction ${index + 1} color`}
                value={guideFamilyColor(grid, index)}
                disabled={grid.locked}
                onValue={(color) =>
                  updateArtboard({ grid: withGuideColor(grid, index, color) })
                }
              />
            </PropertyRow>
          ))}
          <PropertyRow label="Opacity">
            <SliderField
              label="Grid opacity"
              value={grid.opacity}
              disabled={grid.locked}
              onValue={(opacity) => updateArtboard({ grid: { ...grid, opacity } })}
              display={`${Math.round(grid.opacity * 100)}%`}
            />
          </PropertyRow>
          <PropertyRow label="Snap range">
            <ScrubField
              label="PX"
              value={grid.snapThreshold}
              min={1}
              max={24}
              disabled={grid.locked}
              onValue={(snapThreshold) =>
                updateArtboard({ grid: { ...grid, snapThreshold } })
              }
            />
          </PropertyRow>
        </CollapsibleSection>
      </aside>
    )
  }

  const { transform } = node
  const instanceDefinition =
    node.type === 'symbol' && document.version === 2
      ? document.symbols.find((symbol) => symbol.id === node.symbolId)
      : undefined
  const view =
    mode === 'animate'
      ? evaluateNodeAtTime(node, animation, playhead)
      : node
  const display =
    mode === 'animate'
      ? evaluateTransform(
          transform,
          animation,
          node.id,
          playhead,
        )
      : transform

  const patchTransform = (patch: Partial<typeof transform>) =>
    editTransform(node.id, { ...display, ...patch })

  const setVector = (key: 'position' | 'skew', axis: 'x' | 'y', value: number) =>
    patchTransform({ [key]: { ...display[key], [axis]: value } })

  const setScale = (axis: 'x' | 'y', value: number) => {
    if (!scaleLinked) {
      patchTransform({ scale: { ...display.scale, [axis]: value } })
      return
    }
    const other = axis === 'x' ? 'y' : 'x'
    const ratio = display.scale[axis] === 0 ? 1 : display.scale[other] / display.scale[axis]
    patchTransform({
      scale: { [axis]: value, [other]: Number((value * ratio).toFixed(3)) } as Vec2,
    })
  }

  const setPivot = (pivot: Vec2) =>
    updateNode(node.id, {
      pivotPreset: 'custom',
      transform: retargetPivot(transform, pivot),
    })

  const setPivotPreset = (pivotPreset: Exclude<PivotPreset, 'custom'>) =>
    updateNode(node.id, {
      pivotPreset,
      transform: retargetPivot(transform, pivotAnchor(node, pivotPreset)),
    })

  const keyframe = (property: AnimatableProperty) =>
    mode === 'animate' ? (
      <KeyframeButton
        nodeId={node.id}
        property={property}
        armed={isArmed(animation, node.id, property)}
        onToggle={togglePropertyArm}
      />
    ) : undefined

  const targetPaths: { id: string; name: string }[] = []
  walkNodes(nodes, (candidate) => {
    if (candidate.type === 'path' && candidate.id !== node.id) {
      targetPaths.push({ id: candidate.id, name: candidate.name })
    }
  })
  const motionPath = view.motionPath

  return (
    <>
    <aside key={node.id} className="inspector">
      <CollapsibleSection title="Layer">
        <div className="row-actions">
          <Button disabled={!ungrouping} onClick={ungroupSelected}>
            <Ungroup size={13} /> Ungroup
          </Button>
          <Button onClick={duplicateSelected}>
            <Copy size={13} /> Duplicate
          </Button>
          <Button onClick={removeSelected} aria-label="Delete layer">
            <Trash2 size={13} />
          </Button>
        </div>
      </CollapsibleSection>

      {node.type === 'symbol' && (
        <CollapsibleSection title="Symbol playback">
          <PropertyRow label="Start">
            <ScrubField
              label="SEC"
              value={node.playback.startTime}
              min={0}
              step={0.1}
              precision={2}
              onValue={(startTime) =>
                updateSymbolInstancePlayback(node.id, { startTime })
              }
            />
          </PropertyRow>
          <PropertyRow label="Mode">
            <Select
              aria-label="Symbol playback mode"
              value={node.playback.mode}
              onChange={(event) =>
                updateSymbolInstancePlayback(node.id, {
                  mode: event.target.value as 'once' | 'loop',
                })
              }
            >
              <option value="loop">Loop</option>
              <option value="once">Play once</option>
            </Select>
          </PropertyRow>
          <p className="section-note">
            {instanceDefinition
              ? `This clip is ${instanceDefinition.animation.duration}s long. `
              : ''}
            Loop repeats it for the rest of the scene; Play once holds its final
            frame.
          </p>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Transform">
        {mode === 'animate' && (
          <p className="section-note">
            Diamonds arm a property. Armed edits write a key at the playhead;
            disarmed edits change the Draw rest pose.
          </p>
        )}
        <PropertyRow label="Position">
          <ScrubField
            label="X"
            value={display.position.x}
            leading={keyframe('position.x')}
            onValue={(v) => setVector('position', 'x', v)}
          />
          <ScrubField
            label="Y"
            value={display.position.y}
            leading={keyframe('position.y')}
            onValue={(v) => setVector('position', 'y', v)}
          />
        </PropertyRow>

        <PropertyRow
          label="Scale"
          action={
            <IconButton
              icon={scaleLinked ? Link : Unlink}
              label={scaleLinked ? 'Unlink scale ratio' : 'Link scale ratio'}
              active={scaleLinked}
              onClick={() => setScaleLinked((linked) => !linked)}
            />
          }
        >
          <ScrubField
            label="X"
            value={display.scale.x}
            step={0.01}
            leading={keyframe('scale.x')}
            onValue={(v) => setScale('x', v)}
          />
          <ScrubField
            label="Y"
            value={display.scale.y}
            step={0.01}
            leading={keyframe('scale.y')}
            onValue={(v) => setScale('y', v)}
          />
        </PropertyRow>

        <div className="rotation-row">
          <AngleDial value={display.rotation} onValue={(rotation) => patchTransform({ rotation })} />
          <div className="rotation-fields">
            <ScrubField
              label="Rotate"
              value={display.rotation}
              leading={keyframe('rotation')}
              onValue={(rotation) => patchTransform({ rotation })}
            />
            <div className="rotation-presets">
              {[-90, -45, 45, 90].map((step) => (
                <button
                  type="button"
                  key={step}
                  onClick={() => patchTransform({ rotation: display.rotation + step })}
                >
                  {step > 0 ? `+${step}` : step}°
                </button>
              ))}
            </div>
          </div>
        </div>

        <PropertyRow label="Skew">
          <ScrubField
            label="X"
            value={display.skew.x}
            leading={keyframe('skew.x')}
            onValue={(v) => setVector('skew', 'x', v)}
          />
          <ScrubField
            label="Y"
            value={display.skew.y}
            leading={keyframe('skew.y')}
            onValue={(v) => setVector('skew', 'y', v)}
          />
        </PropertyRow>

        <PropertyRow label="Opacity">
          <SliderField
            label="Opacity"
            value={display.opacity}
            leading={keyframe('opacity')}
            onValue={(opacity) => patchTransform({ opacity })}
            display={`${Math.round(display.opacity * 100)}%`}
          />
        </PropertyRow>
      </CollapsibleSection>

      {mode === 'animate' && (
        <CollapsibleSection title="Animation presets">
          <p className="section-note">
            Start from a ready-made animation and tune it for this layer.
          </p>
          <div className="preset-launch-row">
            <Button onClick={() => setPresetOpen(true)}>Browse presets</Button>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Motion path" defaultOpen={Boolean(motionPath)}>
        <PropertyRow label="Target">
          <Select
            aria-label="Target path"
            value={motionPath?.pathId ?? ''}
            onChange={(event) => setMotionPath(node.id, event.target.value || null)}
          >
            <option value="">None</option>
            {targetPaths.map((path) => (
              <option key={path.id} value={path.id}>
                {path.name}
              </option>
            ))}
          </Select>
        </PropertyRow>
        {motionPath && (
          <>
            <PropertyRow label="Progress">
              <ScrubField
                label="%"
                value={motionPath.progress * 100}
                min={0}
                max={100}
                step={1}
                precision={1}
                leading={keyframe('motionPath.progress')}
                onValue={(progress) =>
                  updateNode(node.id, {
                    motionPath: {
                      ...motionPath,
                      progress: progress / 100,
                    },
                  })
                }
              />
            </PropertyRow>
            <PropertyRow label="Auto rotate">
              <Button
                aria-label="Auto rotate along path"
                aria-pressed={motionPath.autoRotate}
                onClick={() =>
                  updateNode(node.id, {
                    motionPath: {
                      ...motionPath,
                      autoRotate: !motionPath.autoRotate,
                    },
                  })
                }
              >
                {motionPath.autoRotate ? 'On' : 'Off'}
              </Button>
            </PropertyRow>
            <p className="section-note">
              Position and rotation remain additive offsets from the path.
            </p>
          </>
        )}
      </CollapsibleSection>

      {mode !== 'animate' && (
      <CollapsibleSection title="Pivot">
        <div className="pivot-row">
          <PivotPicker
            value={node.pivotPreset}
            onPick={setPivotPreset}
          />
          <div className="pivot-fields">
            <ScrubField label="X" value={transform.pivot.x} onValue={(x) => setPivot({ ...transform.pivot, x })} />
            <ScrubField label="Y" value={transform.pivot.y} onValue={(y) => setPivot({ ...transform.pivot, y })} />
          </div>
        </div>
        <p className="section-note">Artwork stays put while the pivot moves.</p>
      </CollapsibleSection>
      )}

      {node.type !== 'group' && node.type !== 'symbol' && (
        <CollapsibleSection title="Geometry">
          {view.type === 'rect' ? (
            <>
              <PropertyRow label="Size">
                <ScrubField
                  label="W"
                  value={view.width}
                  min={1}
                  leading={keyframe('width')}
                  onValue={(width) => updateNode(node.id, { width })}
                />
                <ScrubField
                  label="H"
                  value={view.height}
                  min={1}
                  leading={keyframe('height')}
                  onValue={(height) => updateNode(node.id, { height })}
                />
              </PropertyRow>
              <PropertyRow label="Corner">
                <SliderField
                  label="Corner radius"
                  value={view.rx}
                  min={0}
                  max={Math.min(view.width, view.height) / 2}
                  step={1}
                  leading={keyframe('rx')}
                  onValue={(rx) => updateNode(node.id, { rx, ry: rx })}
                  display={`${Math.round(view.rx)}px`}
                />
              </PropertyRow>
            </>
          ) : view.type === 'ellipse' ? (
            <PropertyRow label="Radius">
              <ScrubField
                label="X"
                value={view.rx}
                min={1}
                leading={keyframe('rx')}
                onValue={(rx) => updateNode(node.id, { rx })}
              />
              <ScrubField
                label="Y"
                value={view.ry}
                min={1}
                leading={keyframe('ry')}
                onValue={(ry) => updateNode(node.id, { ry })}
              />
            </PropertyRow>
          ) : view.type === 'path' ? (
            <>
              {mode !== 'animate' && (
                <>
                <PropertyRow label="Points">
                  <span className="geometry-value">{view.points.length}</span>
                </PropertyRow>
                <PropertyRow label="Path">
                  <Button onClick={() => updateNode(node.id, { closed: !view.closed })}>
                    {view.closed ? 'Closed' : 'Open'}
                  </Button>
                </PropertyRow>
                </>
              )}
              <PropertyRow label="Trim start">
                <SliderField
                  label="Path trim start"
                  value={view.trimStart}
                  leading={keyframe('path.trimStart')}
                  onValue={(trimStart) => updateNode(node.id, { trimStart })}
                  display={`${Math.round(view.trimStart * 100)}%`}
                />
              </PropertyRow>
              <PropertyRow label="Trim end">
                <SliderField
                  label="Path trim end"
                  value={view.trimEnd}
                  leading={keyframe('path.trimEnd')}
                  onValue={(trimEnd) => updateNode(node.id, { trimEnd })}
                  display={`${Math.round(view.trimEnd * 100)}%`}
                />
              </PropertyRow>
              <PropertyRow label="Trim offset">
                <ScrubField
                  label="%"
                  value={view.trimOffset * 100}
                  min={-100}
                  max={100}
                  step={1}
                  leading={keyframe('path.trimOffset')}
                  onValue={(trimOffset) =>
                    updateNode(node.id, { trimOffset: trimOffset / 100 })
                  }
                />
              </PropertyRow>
            </>
          ) : view.type === 'brush' ? (
            <>
              {mode !== 'animate' && (
                <PropertyRow label="Samples">
                  <span className="geometry-value">{view.samples.length}</span>
                </PropertyRow>
              )}
              <PropertyRow label="Brush">
                <ScrubField
                  label="PX"
                  value={view.settings.size}
                  min={1}
                  leading={keyframe('brush.size')}
                  onValue={(size) =>
                    updateNode(node.id, {
                      settings: { ...node.type === 'brush' ? node.settings : view.settings, size },
                    })
                  }
                />
              </PropertyRow>
              <PropertyRow label="Color">
                <ColorField
                  label="Brush color"
                  value={view.settings.color}
                  leading={keyframe('brush.color')}
                  onValue={(color) =>
                    updateNode(node.id, {
                      settings: { ...node.type === 'brush' ? node.settings : view.settings, color },
                    })
                  }
                />
              </PropertyRow>
            </>
          ) : view.type === 'image' ? (
            <PropertyRow label="Size">
              <ScrubField
                label="W"
                value={view.width}
                min={1}
                leading={keyframe('width')}
                onValue={(width) =>
                  updateNode(node.id, {
                    width,
                    height: width * (view.height / view.width),
                  })
                }
              />
              <ScrubField
                label="H"
                value={view.height}
                min={1}
                leading={keyframe('height')}
                onValue={(height) =>
                  updateNode(node.id, {
                    height,
                    width: height * (view.width / view.height),
                  })
                }
              />
            </PropertyRow>
          ) : view.type === 'text' ? (
            <>
              {mode !== 'animate' && (
                <PropertyRow label="Content">
                  <TextField
                    label="Text content"
                    value={view.text}
                    onValue={(text) =>
                      updateNode(node.id, {
                        text,
                        width: naturalTextWidth(text, view),
                      })
                    }
                  />
                </PropertyRow>
              )}
              <PropertyRow label="Width">
                <ScrubField
                  label="W"
                  value={view.width}
                  min={1}
                  leading={keyframe('width')}
                  onValue={(width) => updateNode(node.id, { width })}
                />
              </PropertyRow>
            </>
          ) : null}
        </CollapsibleSection>
      )}

      {view.type === 'text' && (
        <CollapsibleSection title="Typography">
          {mode !== 'animate' && (
            <PropertyRow label="Font">
              <Select
                aria-label="Font family"
                value={view.fontFamily}
                onChange={(event) => {
                  const fontFamily = event.target.value
                  updateNode(node.id, {
                    fontFamily,
                    width: naturalTextWidth(view.text, { ...view, fontFamily }),
                  })
                }}
              >
                {['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'].map(
                  (font) => <option key={font}>{font}</option>,
                )}
              </Select>
            </PropertyRow>
          )}
          <PropertyRow label="Size">
            <ScrubField
              label="PX"
              value={view.fontSize}
              min={1}
              leading={keyframe('fontSize')}
              onValue={(fontSize) =>
                updateNode(node.id, {
                  fontSize,
                  width: naturalTextWidth(view.text, { ...view, fontSize }),
                })
              }
            />
          </PropertyRow>
          <PropertyRow
            label="Weight"
            action={keyframe('fontWeight')}
          >
            <Select
              aria-label="Font weight"
              value={view.fontWeight}
              onChange={(event) => {
                const fontWeight = Number(event.target.value)
                updateNode(node.id, {
                  fontWeight,
                  width: naturalTextWidth(view.text, { ...view, fontWeight }),
                })
              }}
            >
              <option value={300}>Light</option>
              <option value={400}>Regular</option>
              <option value={500}>Medium</option>
              <option value={600}>Semibold</option>
              <option value={700}>Bold</option>
            </Select>
          </PropertyRow>
          <PropertyRow label="Spacing">
            <ScrubField
              label="PX"
              value={view.letterSpacing}
              min={-20}
              max={100}
              leading={keyframe('letterSpacing')}
              onValue={(letterSpacing) =>
                updateNode(node.id, {
                  letterSpacing,
                  width: naturalTextWidth(view.text, {
                    ...view,
                    letterSpacing,
                  }),
                })
              }
            />
          </PropertyRow>
          {mode !== 'animate' && (
            <PropertyRow label="Align">
              <Select
                aria-label="Text alignment"
                value={view.textAlign}
                onChange={(event) =>
                  updateNode(node.id, {
                    textAlign: event.target.value as typeof view.textAlign,
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </Select>
            </PropertyRow>
          )}
        </CollapsibleSection>
      )}

      {view.type === 'image' && (
        <ImageProperties
          node={view}
          onUpdate={(update) => updateNode(node.id, update)}
          keyframe={keyframe}
        />
      )}

      {view.type !== 'group' &&
        view.type !== 'symbol' &&
        view.type !== 'brush' &&
        view.type !== 'image' && (
        <CollapsibleSection title="Appearance">
          {view.type !== 'path' && (
            <PropertyRow label="Fill">
              <ColorField
                label="Fill"
                value={view.fill}
                leading={keyframe('fill')}
                onValue={(fill) => updateNode(node.id, { fill })}
              />
            </PropertyRow>
          )}
          <PropertyRow label="Stroke">
            <ColorField
              label="Stroke"
              value={view.stroke}
              leading={keyframe('stroke')}
              onValue={(stroke) => updateNode(node.id, { stroke })}
            />
          </PropertyRow>
          <PropertyRow label="Weight">
            <SliderField
              label="Stroke width"
              value={view.strokeWidth}
              min={0}
              max={24}
              step={0.5}
              leading={keyframe('strokeWidth')}
              onValue={(strokeWidth) => updateNode(node.id, { strokeWidth })}
              display={`${view.strokeWidth}px`}
            />
          </PropertyRow>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Effects">
        <EffectsPanel
          effects={view.effects}
          onChange={(effects) => updateNode(node.id, { effects })}
          keyframe={keyframe}
        />
      </CollapsibleSection>
    </aside>
    {presetOpen && (
      <AnimationPresetModal
        node={node}
        animation={animation}
        startTime={playhead}
        onApply={(presetId, config) =>
          applyAnimationPreset(node.id, presetId, config)
        }
        onClose={() => setPresetOpen(false)}
      />
    )}
    </>
  )
}

function KeyframeButton({
  nodeId,
  property,
  armed,
  onToggle,
}: {
  nodeId: string
  property: AnimatableProperty
  armed: boolean
  onToggle: (nodeId: string, property: AnimatableProperty) => void
}) {
  return (
    <button
      type="button"
      className={`keyframe-toggle${armed ? ' is-armed' : ''}`}
      aria-pressed={armed}
      aria-label={`${armed ? 'Disarm' : 'Arm'} ${propertyLabel(property)}`}
      title={`${armed ? 'Disarm' : 'Arm'} ${propertyLabel(property)}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle(nodeId, property)
      }}
    />
  )
}

function ImageProperties({
  node,
  onUpdate,
  keyframe,
}: {
  node: ImageNode
  onUpdate: (update: Partial<ImageNode>) => void
  keyframe?: (property: AnimatableProperty) => ReactNode
}) {
  const { adjustments } = node
  const chroma = adjustments.chroma

  useEffect(() => {
    if (!chroma.enabled) {
      if (node.processedSource || node.processedKey) {
        onUpdate({ processedSource: undefined, processedKey: undefined })
      }
      return
    }
    const key = chromaKey(chroma.color, chroma.tolerance, chroma.feather)
    if (node.processedKey === key) return
    let cancelled = false
    const timeout = window.setTimeout(() => {
      void processChroma(
        node.source,
        chroma.color,
        chroma.tolerance,
        chroma.feather,
      ).then((processedSource) => {
        if (!cancelled) onUpdate({ processedSource, processedKey: key })
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    chroma.color,
    chroma.enabled,
    chroma.feather,
    chroma.tolerance,
    node.processedKey,
    node.processedSource,
    node.source,
    onUpdate,
  ])

  const patchAdjustments = (patch: Partial<ImageNode['adjustments']>) =>
    onUpdate({ adjustments: { ...adjustments, ...patch } })
  const patchChroma = (patch: Partial<ImageNode['adjustments']['chroma']>) =>
    patchAdjustments({ chroma: { ...chroma, ...patch } })

  return (
    <>
      <CollapsibleSection title="Crop">
        <PropertyRow label="Origin">
          <ScrubField
            label="X"
            value={node.crop.x}
            min={0}
            max={node.naturalWidth - 1}
            leading={keyframe?.('crop.x')}
            onValue={(x) => onUpdate({ crop: { ...node.crop, x } })}
          />
          <ScrubField
            label="Y"
            value={node.crop.y}
            min={0}
            max={node.naturalHeight - 1}
            leading={keyframe?.('crop.y')}
            onValue={(y) => onUpdate({ crop: { ...node.crop, y } })}
          />
        </PropertyRow>
        <PropertyRow label="Source size">
          <ScrubField
            label="W"
            value={node.crop.width}
            min={1}
            max={node.naturalWidth - node.crop.x}
            leading={keyframe?.('crop.width')}
            onValue={(width) => onUpdate({ crop: { ...node.crop, width } })}
          />
          <ScrubField
            label="H"
            value={node.crop.height}
            min={1}
            max={node.naturalHeight - node.crop.y}
            leading={keyframe?.('crop.height')}
            onValue={(height) => onUpdate({ crop: { ...node.crop, height } })}
          />
        </PropertyRow>
        <Button
          onClick={() =>
            onUpdate({
              crop: {
                x: 0,
                y: 0,
                width: node.naturalWidth,
                height: node.naturalHeight,
              },
            })
          }
        >
          Reset crop
        </Button>
      </CollapsibleSection>
      <CollapsibleSection title="Image correction">
        <PropertyRow label="Brightness">
          <SliderField
            label="Brightness"
            value={adjustments.brightness}
            min={-1}
            max={1}
            leading={keyframe?.('brightness')}
            onValue={(brightness) => patchAdjustments({ brightness })}
            display={`${Math.round(adjustments.brightness * 100)}%`}
          />
        </PropertyRow>
        <PropertyRow label="Contrast">
          <SliderField
            label="Contrast"
            value={adjustments.contrast}
            min={-1}
            max={1}
            leading={keyframe?.('contrast')}
            onValue={(contrast) => patchAdjustments({ contrast })}
            display={`${Math.round(adjustments.contrast * 100)}%`}
          />
        </PropertyRow>
        <PropertyRow label="Saturation">
          <SliderField
            label="Saturation"
            value={adjustments.saturation}
            min={-1}
            max={2}
            leading={keyframe?.('saturation')}
            onValue={(saturation) => patchAdjustments({ saturation })}
            display={`${Math.round(adjustments.saturation * 100)}%`}
          />
        </PropertyRow>
      </CollapsibleSection>
      <CollapsibleSection title="Remove background">
        <Button
          aria-pressed={chroma.enabled}
          onClick={() => patchChroma({ enabled: !chroma.enabled })}
        >
          {chroma.enabled ? 'Chroma key on' : 'Enable chroma key'}
        </Button>
        <PropertyRow label="Key color">
          <ColorField
            label="Chroma key color"
            value={chroma.color}
            leading={keyframe?.('chroma.color')}
            onValue={(color) => patchChroma({ color })}
          />
        </PropertyRow>
        <PropertyRow label="Tolerance">
          <SliderField
            label="Chroma tolerance"
            value={chroma.tolerance}
            min={0}
            max={0.5}
            leading={keyframe?.('chroma.tolerance')}
            onValue={(tolerance) => patchChroma({ tolerance })}
            display={`${Math.round(chroma.tolerance * 100)}%`}
          />
        </PropertyRow>
        <PropertyRow label="Feather">
          <SliderField
            label="Chroma feather"
            value={chroma.feather}
            min={0}
            max={0.5}
            leading={keyframe?.('chroma.feather')}
            onValue={(feather) => patchChroma({ feather })}
            display={`${Math.round(chroma.feather * 100)}%`}
          />
        </PropertyRow>
      </CollapsibleSection>
    </>
  )
}
