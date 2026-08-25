import { useEffect, useState } from 'react'
import { Copy, Group, Link, Lock, Trash2, Ungroup, Unlink, Unlock } from 'lucide-react'
import {
  DEFAULT_GUIDE_COLORS,
  guideFamilyColor,
  guideFamilyCount,
  withGuideColor,
} from '../model/grid'
import { pivotAnchor } from '../model/scene'
import { retargetPivot } from '../model/transform'
import type { GridSettings, ImageNode, PivotPreset, Vec2 } from '../model/types'
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
  const nodes = document.children
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const updateNode = useEditorStore((state) => state.updateNode)
  const updateArtboard = useEditorStore((state) => state.updateArtboard)
  const setDocumentName = useEditorStore((state) => state.setDocumentName)
  const setViewport = useEditorStore((state) => state.setViewport)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const removeSelected = useEditorStore((state) => state.removeSelected)
  const groupSelected = useEditorStore((state) => state.groupSelected)
  const ungroupSelected = useEditorStore((state) => state.ungroupSelected)
  const [scaleLinked, setScaleLinked] = useState(true)
  const node = selectedNode(nodes, selectedIds)
  const grid = document.artboard.grid
  const grouping = canGroup(nodes, selectedIds)
  const ungrouping = canUngroup(nodes, selectedIds)

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

  const patchTransform = (patch: Partial<typeof transform>) =>
    updateNode(node.id, { transform: { ...transform, ...patch } })

  const setVector = (key: 'position' | 'skew', axis: 'x' | 'y', value: number) =>
    patchTransform({ [key]: { ...transform[key], [axis]: value } })

  const setScale = (axis: 'x' | 'y', value: number) => {
    if (!scaleLinked) {
      patchTransform({ scale: { ...transform.scale, [axis]: value } })
      return
    }
    const other = axis === 'x' ? 'y' : 'x'
    const ratio = transform.scale[axis] === 0 ? 1 : transform.scale[other] / transform.scale[axis]
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

  return (
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

      <CollapsibleSection title="Transform">
        <PropertyRow label="Position">
          <ScrubField label="X" value={transform.position.x} onValue={(v) => setVector('position', 'x', v)} />
          <ScrubField label="Y" value={transform.position.y} onValue={(v) => setVector('position', 'y', v)} />
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
          <ScrubField label="X" value={transform.scale.x} step={0.01} onValue={(v) => setScale('x', v)} />
          <ScrubField label="Y" value={transform.scale.y} step={0.01} onValue={(v) => setScale('y', v)} />
        </PropertyRow>

        <div className="rotation-row">
          <AngleDial value={transform.rotation} onValue={(rotation) => patchTransform({ rotation })} />
          <div className="rotation-fields">
            <ScrubField label="Rotate" value={transform.rotation} onValue={(rotation) => patchTransform({ rotation })} />
            <div className="rotation-presets">
              {[-90, -45, 45, 90].map((step) => (
                <button
                  type="button"
                  key={step}
                  onClick={() => patchTransform({ rotation: transform.rotation + step })}
                >
                  {step > 0 ? `+${step}` : step}°
                </button>
              ))}
            </div>
          </div>
        </div>

        <PropertyRow label="Skew">
          <ScrubField label="X" value={transform.skew.x} onValue={(v) => setVector('skew', 'x', v)} />
          <ScrubField label="Y" value={transform.skew.y} onValue={(v) => setVector('skew', 'y', v)} />
        </PropertyRow>

        <PropertyRow label="Opacity">
          <SliderField
            label="Opacity"
            value={transform.opacity}
            onValue={(opacity) => patchTransform({ opacity })}
            display={`${Math.round(transform.opacity * 100)}%`}
          />
        </PropertyRow>
      </CollapsibleSection>

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

      {node.type !== 'group' && (
        <CollapsibleSection title="Geometry">
          {node.type === 'rect' ? (
            <>
              <PropertyRow label="Size">
                <ScrubField label="W" value={node.width} min={1} onValue={(width) => updateNode(node.id, { width })} />
                <ScrubField label="H" value={node.height} min={1} onValue={(height) => updateNode(node.id, { height })} />
              </PropertyRow>
              <PropertyRow label="Corner">
                <SliderField
                  label="Corner radius"
                  value={node.rx}
                  min={0}
                  max={Math.min(node.width, node.height) / 2}
                  step={1}
                  onValue={(rx) => updateNode(node.id, { rx, ry: rx })}
                  display={`${Math.round(node.rx)}px`}
                />
              </PropertyRow>
            </>
          ) : node.type === 'ellipse' ? (
            <PropertyRow label="Radius">
              <ScrubField label="X" value={node.rx} min={1} onValue={(rx) => updateNode(node.id, { rx })} />
              <ScrubField label="Y" value={node.ry} min={1} onValue={(ry) => updateNode(node.id, { ry })} />
            </PropertyRow>
          ) : node.type === 'path' ? (
            <>
              <PropertyRow label="Points">
                <span className="geometry-value">{node.points.length}</span>
              </PropertyRow>
              <PropertyRow label="Path">
                <Button onClick={() => updateNode(node.id, { closed: !node.closed })}>
                  {node.closed ? 'Closed' : 'Open'}
                </Button>
              </PropertyRow>
            </>
          ) : node.type === 'pencil' ? (
            <>
              <PropertyRow label="Samples">
                <span className="geometry-value">{node.samples.length}</span>
              </PropertyRow>
              <PropertyRow label="Brush">
                <span className="geometry-value">
                  {Math.round(node.settings.size)}px
                </span>
              </PropertyRow>
            </>
          ) : node.type === 'image' ? (
            <PropertyRow label="Size">
              <ScrubField
                label="W"
                value={node.width}
                min={1}
                onValue={(width) =>
                  updateNode(node.id, {
                    width,
                    height: width * (node.height / node.width),
                  })
                }
              />
              <ScrubField
                label="H"
                value={node.height}
                min={1}
                onValue={(height) =>
                  updateNode(node.id, {
                    height,
                    width: height * (node.width / node.height),
                  })
                }
              />
            </PropertyRow>
          ) : (
            <>
              <PropertyRow label="Content">
                <TextField
                  label="Text content"
                  value={node.text}
                  onValue={(text) =>
                    updateNode(node.id, {
                      text,
                      width: naturalTextWidth(text, node),
                    })
                  }
                />
              </PropertyRow>
              <PropertyRow label="Width">
                <ScrubField
                  label="W"
                  value={node.width}
                  min={1}
                  onValue={(width) => updateNode(node.id, { width })}
                />
              </PropertyRow>
            </>
          )}
        </CollapsibleSection>
      )}

      {node.type === 'text' && (
        <CollapsibleSection title="Typography">
          <PropertyRow label="Font">
            <Select
              aria-label="Font family"
              value={node.fontFamily}
              onChange={(event) => {
                const fontFamily = event.target.value
                updateNode(node.id, {
                  fontFamily,
                  width: naturalTextWidth(node.text, { ...node, fontFamily }),
                })
              }}
            >
              {['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'].map(
                (font) => <option key={font}>{font}</option>,
              )}
            </Select>
          </PropertyRow>
          <PropertyRow label="Size">
            <ScrubField
              label="PX"
              value={node.fontSize}
              min={1}
              onValue={(fontSize) =>
                updateNode(node.id, {
                  fontSize,
                  width: naturalTextWidth(node.text, { ...node, fontSize }),
                })
              }
            />
          </PropertyRow>
          <PropertyRow label="Weight">
            <Select
              aria-label="Font weight"
              value={node.fontWeight}
              onChange={(event) => {
                const fontWeight = Number(event.target.value)
                updateNode(node.id, {
                  fontWeight,
                  width: naturalTextWidth(node.text, { ...node, fontWeight }),
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
              value={node.letterSpacing}
              min={-20}
              max={100}
              onValue={(letterSpacing) =>
                updateNode(node.id, {
                  letterSpacing,
                  width: naturalTextWidth(node.text, {
                    ...node,
                    letterSpacing,
                  }),
                })
              }
            />
          </PropertyRow>
          <PropertyRow label="Align">
            <Select
              aria-label="Text alignment"
              value={node.textAlign}
              onChange={(event) =>
                updateNode(node.id, {
                  textAlign: event.target.value as typeof node.textAlign,
                })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </Select>
          </PropertyRow>
        </CollapsibleSection>
      )}

      {node.type === 'image' && (
        <ImageProperties node={node} onUpdate={(update) => updateNode(node.id, update)} />
      )}

      {node.type !== 'group' && node.type !== 'pencil' && node.type !== 'image' && (
        <CollapsibleSection title="Appearance">
          {node.type !== 'path' && (
            <PropertyRow label="Fill">
              <ColorField label="Fill" value={node.fill} onValue={(fill) => updateNode(node.id, { fill })} />
            </PropertyRow>
          )}
          <PropertyRow label="Stroke">
            <ColorField label="Stroke" value={node.stroke} onValue={(stroke) => updateNode(node.id, { stroke })} />
          </PropertyRow>
          <PropertyRow label="Weight">
            <SliderField
              label="Stroke width"
              value={node.strokeWidth}
              min={0}
              max={24}
              step={0.5}
              onValue={(strokeWidth) => updateNode(node.id, { strokeWidth })}
              display={`${node.strokeWidth}px`}
            />
          </PropertyRow>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Effects">
        <EffectsPanel
          effects={node.effects}
          onChange={(effects) => updateNode(node.id, { effects })}
        />
      </CollapsibleSection>
    </aside>
  )
}

function ImageProperties({
  node,
  onUpdate,
}: {
  node: ImageNode
  onUpdate: (update: Partial<ImageNode>) => void
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
            onValue={(x) => onUpdate({ crop: { ...node.crop, x } })}
          />
          <ScrubField
            label="Y"
            value={node.crop.y}
            min={0}
            max={node.naturalHeight - 1}
            onValue={(y) => onUpdate({ crop: { ...node.crop, y } })}
          />
        </PropertyRow>
        <PropertyRow label="Source size">
          <ScrubField
            label="W"
            value={node.crop.width}
            min={1}
            max={node.naturalWidth - node.crop.x}
            onValue={(width) => onUpdate({ crop: { ...node.crop, width } })}
          />
          <ScrubField
            label="H"
            value={node.crop.height}
            min={1}
            max={node.naturalHeight - node.crop.y}
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
            onValue={(color) => patchChroma({ color })}
          />
        </PropertyRow>
        <PropertyRow label="Tolerance">
          <SliderField
            label="Chroma tolerance"
            value={chroma.tolerance}
            min={0}
            max={0.5}
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
            onValue={(feather) => patchChroma({ feather })}
            display={`${Math.round(chroma.feather * 100)}%`}
          />
        </PropertyRow>
      </CollapsibleSection>
    </>
  )
}
