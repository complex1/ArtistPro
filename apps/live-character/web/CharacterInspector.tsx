import { useState, type ReactNode } from 'react'
import { Bone, CircleDot, Grid2X2, Link2, Plus, Sparkles } from 'lucide-react'
import { nanoid } from 'nanoid'
import {
  autoWeightLayer,
  boneWorldTransforms,
  generateMesh,
  getLayerWorldTransform,
} from './engine'
import type { CharacterDocument, Layer, Transform, Vec2 } from './model'
import {
  canParent,
  identityPose,
  type DocumentChange,
  type PoseChange,
  type Selection,
  type WorkspaceMode,
} from './editorTypes'

function Field({
  label,
  value,
  onChange,
  min = -10000,
  max = 10000,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  return (
    <label className="lc-number">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber
          if (Number.isFinite(next))
            onChange(Math.min(max, Math.max(min, next)))
        }}
      />
    </label>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lc-inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
function reparentLayer(
  doc: CharacterDocument,
  layer: Layer,
  parentId: string | null,
): CharacterDocument {
  const world = getLayerWorldTransform(doc, layer.id)
  const parent = parentId
    ? getLayerWorldTransform(doc, parentId)
    : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const det = parent.a * parent.d - parent.b * parent.c
  if (Math.abs(det) < 1e-8) return doc
  const a = (parent.d * world.a - parent.c * world.b) / det,
    b = (-parent.b * world.a + parent.a * world.b) / det,
    c = (parent.d * world.c - parent.c * world.d) / det,
    d = (-parent.b * world.c + parent.a * world.d) / det
  const scaleX = Math.hypot(a, b)
  const transform = {
    x:
      (parent.d * (world.e - parent.e) - parent.c * (world.f - parent.f)) / det,
    y:
      (-parent.b * (world.e - parent.e) + parent.a * (world.f - parent.f)) /
      det,
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    scaleX,
    scaleY: (a * d - b * c) / Math.max(0.001, scaleX),
  }
  return {
    ...doc,
    layers: doc.layers.map((item) =>
      item.id === layer.id ? { ...item, parentId, transform } : item,
    ),
  }
}
export function CharacterInspector({
  document: doc,
  posed,
  selection,
  mode,
  onChange,
  onPose,
  onSelect,
  vertex,
  onVertexChange,
  meshEditing,
  onMeshEditing,
  onMeshPose,
}: {
  document: CharacterDocument
  posed: CharacterDocument
  selection: Selection
  mode: WorkspaceMode
  onChange: DocumentChange
  onPose: PoseChange
  onSelect: (selection: Selection) => void
  vertex: number
  onVertexChange: (index: number) => void
  meshEditing: boolean
  onMeshEditing: (enabled: boolean) => void
  onMeshPose: (layerId: string, vertices: Vec2[]) => void
}) {
  const [density, setDensity] = useState(4)
  const [weightBone, setWeightBone] = useState('')
  const layer =
    selection?.type === 'layer'
      ? posed.layers.find((item) => item.id === selection.id)
      : undefined
  const bone =
    selection?.type === 'bone'
      ? posed.bones.find((item) => item.id === selection.id)
      : undefined
  const controller =
    selection?.type === 'controller'
      ? posed.controllers.find((item) => item.id === selection.id)
      : undefined
  const baseLayer = layer
    ? doc.layers.find((item) => item.id === layer.id)
    : undefined
  const hasMeshAnimation = Boolean(
    layer &&
    doc.keyframes.some(
      (key) => key.targetType === 'mesh' && key.targetId === layer.id,
    ),
  )
  const activeBone =
    doc.bones.find((item) => item.id === weightBone)?.id ??
    doc.bones[0]?.id ??
    ''
  const vertexIndex = Math.min(
    vertex,
    Math.max(0, (baseLayer?.mesh?.vertices.length ?? 1) - 1),
  )
  const weights = baseLayer?.mesh?.weights[vertexIndex] ?? {}
  const transform =
    layer?.transform ??
    (bone
      ? { ...identityPose(), x: bone.x, y: bone.y, rotation: bone.rotation }
      : controller
        ? { ...identityPose(), x: controller.x, y: controller.y }
        : null)
  const patchLayer = (patch: Partial<Layer>) =>
    onChange({
      ...doc,
      layers: doc.layers.map((item) =>
        item.id === layer?.id ? { ...item, ...patch } : item,
      ),
    })
  const patchPose = (patch: Partial<Transform>) => {
    if (selection && transform)
      onPose(selection.type, selection.id, { ...transform, ...patch })
  }
  function makeController(ik: boolean) {
    if (!bone) return
    const id = nanoid(),
      world = boneWorldTransforms(posed)[bone.id]
    const next = {
      id,
      name: ik ? `${bone.name} IK` : `${bone.name} control`,
      boneId: bone.id,
      kind: ik ? ('ik' as const) : ('bone' as const),
      x: world.end.x,
      y: world.end.y,
      chainLength: 2 as const,
      bend: 1 as const,
    }
    onChange({ ...doc, controllers: [...doc.controllers, next] })
    onSelect({ type: 'controller', id })
  }
  function setWeight(value: number) {
    if (!baseLayer?.mesh || !activeBone) return
    const mesh = structuredClone(baseLayer.mesh)
    const old = mesh.weights[vertexIndex]
    const others = Object.entries(old).filter(([id]) => id !== activeBone),
      sum = others.reduce((sum, [, w]) => sum + w, 0)
    mesh.weights[vertexIndex] = Object.fromEntries(
      others.map(([id, w]) => [id, sum > 0 ? (w / sum) * (1 - value) : 0]),
    )
    if (value > 0) mesh.weights[vertexIndex][activeBone] = value
    patchLayer({ mesh })
  }
  return (
    <aside className="lc-inspector">
      <div className="lc-panel-heading">
        <span>Inspector</span>
        <span className="lc-tag">{selection?.type ?? 'Document'}</span>
      </div>
      {!selection && (
        <>
          <Section title="Character">
            <label className="lc-label">
              Project name
              <input
                maxLength={200}
                value={doc.name}
                onChange={(event) =>
                  onChange({ ...doc, name: event.target.value })
                }
              />
            </label>
            <div className="lc-fields">
              <Field
                label="Width"
                value={doc.width}
                min={64}
                max={2048}
                onChange={(width) => onChange({ ...doc, width })}
              />
              <Field
                label="Height"
                value={doc.height}
                min={64}
                max={2048}
                onChange={(height) => onChange({ ...doc, height })}
              />
            </div>
          </Section>
          <Section title="Make it move">
            <div className="lc-step-tip">
              <Grid2X2 size={17} />
              <p>Give artwork a mesh to let it bend.</p>
            </div>
            <div className="lc-step-tip">
              <Bone size={17} />
              <p>Draw bones, then bind the artwork.</p>
            </div>
            <div className="lc-step-tip">
              <CircleDot size={17} />
              <p>Add controls and animate your poses.</p>
            </div>
          </Section>
        </>
      )}
      {selection && (layer || bone || controller) && (
        <>
          <Section title={layer ? 'Layer' : bone ? 'Bone' : 'Controller'}>
            <label className="lc-label">
              Name
              <input
                aria-label="Selection name"
                maxLength={200}
                value={layer?.name ?? bone?.name ?? controller?.name ?? ''}
                onChange={(event) => {
                  const name = event.target.value
                  if (layer) patchLayer({ name })
                  else if (bone)
                    onChange({
                      ...doc,
                      bones: doc.bones.map((item) =>
                        item.id === bone.id ? { ...item, name } : item,
                      ),
                    })
                  else if (controller)
                    onChange({
                      ...doc,
                      controllers: doc.controllers.map((item) =>
                        item.id === controller.id ? { ...item, name } : item,
                      ),
                    })
                }}
              />
            </label>
            {layer && mode !== 'animate' && (
              <label className="lc-label">
                <span>
                  <Link2 size={12} /> Parent layer
                </span>
                <select
                  aria-label="Parent layer"
                  value={layer.parentId ?? ''}
                  onChange={(event) =>
                    onChange(
                      reparentLayer(doc, layer, event.target.value || null),
                    )
                  }
                >
                  <option value="">None · stage</option>
                  {doc.layers
                    .filter((item) => canParent(doc.layers, layer.id, item.id))
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {bone && mode !== 'animate' && (
              <label className="lc-label">
                Parent bone
                <select
                  value={bone.parentId ?? ''}
                  onChange={(event) => {
                    const parentId = event.target.value || null,
                      worlds = boneWorldTransforms(doc),
                      world = worlds[bone.id],
                      parent = parentId ? worlds[parentId] : null,
                      angle = (-(parent?.rotation ?? 0) * Math.PI) / 180,
                      dx = world.start.x - (parent?.end.x ?? 0),
                      dy = world.start.y - (parent?.end.y ?? 0)
                    onChange({
                      ...doc,
                      bones: doc.bones.map((item) =>
                        item.id === bone.id
                          ? {
                              ...item,
                              parentId,
                              x: dx * Math.cos(angle) - dy * Math.sin(angle),
                              y: dx * Math.sin(angle) + dy * Math.cos(angle),
                              rotation:
                                world.rotation - (parent?.rotation ?? 0),
                            }
                          : item,
                      ),
                    })
                  }}
                >
                  <option
                    value=""
                    disabled={doc.controllers.some(
                      (control) =>
                        control.kind === 'ik' && control.boneId === bone.id,
                    )}
                  >
                    None · root
                  </option>
                  {doc.bones
                    .filter((item) => canParent(doc.bones, bone.id, item.id))
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {controller && (
              <label className="lc-label">
                Driven bone
                <select
                  value={controller.boneId ?? ''}
                  disabled={mode === 'animate'}
                  onChange={(event) =>
                    onChange({
                      ...doc,
                      controllers: doc.controllers.map((item) =>
                        item.id === controller.id
                          ? { ...item, boneId: event.target.value || null }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="" disabled={controller.kind === 'ik'}>
                    None
                  </option>
                  {doc.bones
                    .filter((item) => controller.kind !== 'ik' || item.parentId)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </Section>
          {layer && mode === 'animate' && (
            <Section title="Mesh animation">
              {layer.mesh?.vertices.length ? (
                <>
                  <button
                    className={`lc-button lc-full ${meshEditing ? 'lc-primary' : ''}`}
                    aria-pressed={meshEditing}
                    disabled={layer.locked}
                    onClick={() => onMeshEditing(!meshEditing)}
                  >
                    <Grid2X2 size={14} />
                    {meshEditing ? 'Editing mesh points' : 'Edit mesh points'}
                  </button>
                  <p className="lc-help">
                    Move the playhead, then drag a point to keyframe its shape.
                    No bones are needed.
                  </p>
                  {meshEditing && (
                    <>
                      <Field
                        label="Mesh vertex"
                        value={vertexIndex}
                        min={0}
                        max={layer.mesh.vertices.length - 1}
                        onChange={(value) => onVertexChange(Math.round(value))}
                      />
                      <div className="lc-fields">
                        <Field
                          label="Point X"
                          value={layer.mesh.vertices[vertexIndex].x}
                          disabled={layer.locked}
                          onChange={(x) =>
                            onMeshPose(
                              layer.id,
                              layer.mesh!.vertices.map((point, index) =>
                                index === vertexIndex ? { ...point, x } : point,
                              ),
                            )
                          }
                        />
                        <Field
                          label="Point Y"
                          value={layer.mesh.vertices[vertexIndex].y}
                          disabled={layer.locked}
                          onChange={(y) =>
                            onMeshPose(
                              layer.id,
                              layer.mesh!.vertices.map((point, index) =>
                                index === vertexIndex ? { ...point, y } : point,
                              ),
                            )
                          }
                        />
                      </div>
                      <button
                        className="lc-button lc-full"
                        disabled={layer.locked}
                        onClick={() =>
                          onMeshPose(layer.id, layer.mesh!.vertices)
                        }
                      >
                        <Plus size={14} />
                        Key mesh pose
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p className="lc-help">
                  Generate a mesh in the Mesh workspace to animate this layer’s
                  points.
                </p>
              )}
            </Section>
          )}
          {transform && !(controller?.kind === 'bone') && (
            <Section
              title={mode === 'animate' ? 'Pose · auto key' : 'Transform'}
            >
              <div className="lc-fields">
                <Field
                  label="X"
                  value={transform.x}
                  onChange={(x) => patchPose({ x })}
                />
                <Field
                  label="Y"
                  value={transform.y}
                  onChange={(y) => patchPose({ y })}
                />
                {!controller && (
                  <Field
                    label="Rotation"
                    value={transform.rotation}
                    min={-3600}
                    max={3600}
                    onChange={(rotation) => patchPose({ rotation })}
                  />
                )}{' '}
                {layer && (
                  <>
                    <Field
                      label="Scale X"
                      value={transform.scaleX}
                      min={0.05}
                      max={20}
                      step={0.05}
                      onChange={(scaleX) => patchPose({ scaleX })}
                    />
                    <Field
                      label="Scale Y"
                      value={transform.scaleY}
                      min={0.05}
                      max={20}
                      step={0.05}
                      onChange={(scaleY) => patchPose({ scaleY })}
                    />
                  </>
                )}
              </div>
              {mode === 'animate' && (
                <p className="lc-help">
                  Transform changes record a key at the playhead.
                </p>
              )}
            </Section>
          )}
          {layer && mode !== 'animate' && (
            <Section title="Appearance">
              <div className="lc-fields">
                <Field
                  label="Part width"
                  disabled={hasMeshAnimation}
                  value={layer.width}
                  min={2}
                  max={2048}
                  onChange={(width) =>
                    patchLayer({
                      width,
                      mesh: null,
                      ...(layer.path
                        ? {
                            path: layer.path.map((point) => ({
                              ...point,
                              x: (point.x * width) / layer.width,
                            })),
                          }
                        : {}),
                    })
                  }
                />
                <Field
                  label="Part height"
                  disabled={hasMeshAnimation}
                  value={layer.height}
                  min={2}
                  max={2048}
                  onChange={(height) =>
                    patchLayer({
                      height,
                      mesh: null,
                      ...(layer.path
                        ? {
                            path: layer.path.map((point) => ({
                              ...point,
                              y: (point.y * height) / layer.height,
                            })),
                          }
                        : {}),
                    })
                  }
                />
              </div>
              {hasMeshAnimation && (
                <p className="lc-help">
                  Use Scale to resize animated artwork. Delete this layer’s mesh
                  keys before changing its base mesh or part dimensions.
                </p>
              )}
              {layer.kind !== 'image' && (
                <>
                  <label className="lc-color-field">
                    <span>Fill</span>
                    <input
                      type="color"
                      value={layer.fill}
                      onChange={(event) =>
                        patchLayer({ fill: event.target.value })
                      }
                    />
                    <code>{layer.fill}</code>
                  </label>
                  <label className="lc-color-field">
                    <span>Outline</span>
                    <input
                      type="color"
                      value={layer.stroke}
                      onChange={(event) =>
                        patchLayer({ stroke: event.target.value })
                      }
                    />
                    <Field
                      label="Stroke"
                      value={layer.strokeWidth}
                      min={0}
                      max={30}
                      onChange={(strokeWidth) => patchLayer({ strokeWidth })}
                    />
                  </label>
                </>
              )}
            </Section>
          )}
          {layer && (mode === 'mesh' || mode === 'rig') && (
            <Section title="Deformation mesh">
              <div className="lc-segmented">
                {[
                  [2, 'Low'],
                  [4, 'Medium'],
                  [8, 'High'],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={density === value ? 'is-active' : ''}
                    onClick={() => setDensity(Number(value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Field
                label="Subdivisions"
                value={density}
                min={1}
                max={20}
                onChange={(value) => setDensity(Math.round(value))}
              />
              <button
                className="lc-button lc-full"
                onClick={() =>
                  patchLayer({ mesh: generateMesh(baseLayer!, density) })
                }
                disabled={hasMeshAnimation}
              >
                <Grid2X2 size={14} />
                {layer.mesh ? 'Regenerate mesh' : 'Generate mesh'}
              </button>
              <p className="lc-help">
                {layer.mesh
                  ? `${layer.mesh.vertices.length} vertices · ${layer.mesh.triangles.length} triangles. ${hasMeshAnimation ? 'This mesh has animation. Pose its points in Animate; delete its mesh keys before editing the base mesh.' : 'Drag a vertex here to edit the base mesh, or switch to Animate to keyframe points. Regenerating resets weights.'}`
                  : 'Generate a grid, then shape it around your artwork.'}
              </p>
              {layer.mesh && (
                <button
                  className="lc-text-button"
                  onClick={() => patchLayer({ mesh: null })}
                  disabled={hasMeshAnimation}
                >
                  Remove mesh
                </button>
              )}
            </Section>
          )}
          {layer?.mesh && (mode === 'mesh' || mode === 'rig') && (
            <Section title="Bone influences">
              <button
                className="lc-button lc-full"
                disabled={!doc.bones.length}
                onClick={() =>
                  patchLayer({ mesh: autoWeightLayer(doc, layer.id) })
                }
              >
                <Sparkles size={14} />
                Auto weights
              </button>
              <label className="lc-label">
                Bone
                <select
                  value={activeBone}
                  onChange={(event) => setWeightBone(event.target.value)}
                >
                  <option value="" disabled>
                    Select a bone
                  </option>
                  {doc.bones.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="lc-button lc-full"
                disabled={!activeBone}
                onClick={() =>
                  patchLayer({
                    mesh: {
                      ...baseLayer!.mesh!,
                      weights: baseLayer!.mesh!.vertices.map(() => ({
                        [activeBone]: 1,
                      })),
                    },
                  })
                }
              >
                Bind entire layer
              </button>
              <div className="lc-fields">
                <Field
                  label="Vertex"
                  min={0}
                  max={layer.mesh.vertices.length - 1}
                  value={vertexIndex}
                  onChange={(value) => onVertexChange(Math.round(value))}
                />
                <Field
                  label="Weight"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weights[activeBone] ?? 0}
                  onChange={setWeight}
                />
              </div>
              <p className="lc-help">
                Select a vertex on the canvas or by index. Weight controls how
                strongly this bone moves it.
              </p>
              <button
                className="lc-text-button"
                onClick={() =>
                  patchLayer({
                    mesh: {
                      ...baseLayer!.mesh!,
                      weights: baseLayer!.mesh!.vertices.map(() => ({})),
                    },
                  })
                }
              >
                Clear weights
              </button>
            </Section>
          )}
          {bone && mode !== 'animate' && (
            <Section title="Rig controls">
              <Field
                label="Bone length"
                value={bone.length}
                min={1}
                max={2048}
                onChange={(length) =>
                  onChange({
                    ...doc,
                    bones: doc.bones.map((item) =>
                      item.id === bone.id ? { ...item, length } : item,
                    ),
                  })
                }
              />
              <button
                className="lc-button lc-full"
                onClick={() => makeController(false)}
              >
                <Plus size={14} />
                Add rotation control
              </button>
              <button
                className="lc-button lc-full"
                disabled={!bone.parentId}
                onClick={() => makeController(true)}
              >
                <CircleDot size={14} />
                Create 2-bone IK
              </button>
              <p className="lc-help">
                For IK, select the lower arm or leg. Move the target in Animate
                to pose the chain.
              </p>
            </Section>
          )}
          {controller && (
            <Section title="Controller behavior">
              <p className="lc-help">
                {controller.kind === 'ik'
                  ? 'In Animate, drag this target to position a two-bone chain. The solver keeps the limb within reach.'
                  : 'Drag the ring to rotate the bone. In Animate, this records bone rotation keys.'}
              </p>
              {controller.kind === 'ik' && (
                <label className="lc-label">
                  Bend direction
                  <select
                    value={controller.bend}
                    onChange={(event) =>
                      onChange({
                        ...doc,
                        controllers: doc.controllers.map((item) =>
                          item.id === controller.id
                            ? {
                                ...item,
                                bend: Number(event.target.value) as 1 | -1,
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value={1}>Clockwise</option>
                    <option value={-1}>Counterclockwise</option>
                  </select>
                </label>
              )}
            </Section>
          )}
        </>
      )}
    </aside>
  )
}
