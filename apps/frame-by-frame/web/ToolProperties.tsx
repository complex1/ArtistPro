import { useState, type Dispatch, type SetStateAction } from 'react'
import { FlipHorizontal2, FlipVertical2, Maximize, Minus, MousePointer2, Plus, X } from 'lucide-react'
import { BRUSH_PRESETS, type BrushSettings, type DrawingTool, type Selection } from './raster'

type Props = {
  tool: DrawingTool; brush: BrushSettings; setBrush: Dispatch<SetStateAction<BrushSettings>>;
  filled: boolean; setFilled: (value: boolean) => void; tolerance: number; setTolerance: (value: number) => void;
  selection: Selection | null; canEdit: boolean; lockAspect: boolean; setLockAspect: (value: boolean) => void;
  onDeselect: () => void; onSelectAll: () => void; onTool: (tool: DrawingTool) => void; onClear: () => void;
  onTransform: (width: number, height: number, rotation: number) => void; onFlip: (axis: 'horizontal' | 'vertical') => void;
  zoom: number; onZoom: (factor: number) => void; onFit: () => void;
}

export function ToolProperties(props: Props) {
  const { tool, brush, setBrush, selection, canEdit } = props
  const [width, setWidth] = useState(100), [height, setHeight] = useState(100), [rotation, setRotation] = useState(0)
  const selecting = tool === 'select-rectangle' || tool === 'lasso'
  const transforming = tool === 'transform' || selecting && Boolean(selection)
  const painting = tool === 'brush' || tool === 'eraser'
  const shape = tool === 'rectangle' || tool === 'ellipse'
  const color = <><label className="fbf-field fbf-tool-color">Color <span><input aria-label="Tool color" type="color" value={brush.color} onChange={event => setBrush(value => ({ ...value, color: event.target.value }))} /><code>{brush.color.toUpperCase()}</code></span></label><div className="fbf-swatches">{['#272b36', '#e6b472', '#cf756c', '#799f91', '#7c92c4', '#ffffff'].map(value => <button key={value} aria-label={`Color ${value}`} style={{ background: value }} onClick={() => setBrush(brush => ({ ...brush, color: value }))} />)}</div></>
  const valid = [width, height].every(value => Number.isFinite(value) && value >= 1 && value <= 1000) && Number.isFinite(rotation) && Math.abs(rotation) <= 360
  return <div className="fbf-tool-properties" aria-label="Selected tool properties">
    {painting && <section><h3>{tool === 'eraser' ? 'Eraser' : 'Brush studio'}</h3><div className="fbf-brush-presets">{BRUSH_PRESETS.map(preset => <button key={preset.id} className={brush.kind === preset.id ? 'is-active' : ''} onClick={() => setBrush(value => ({ ...preset.settings, color: value.color }))}><i className={`brush-${preset.id}`} /><span>{preset.name}</span></button>)}</div>
      <Range label="Size" value={brush.size} min={1} max={300} suffix="px" onChange={size => setBrush(value => ({ ...value, size }))} />
      <Range label="Opacity" value={Math.round(brush.opacity * 100)} min={1} max={100} suffix="%" onChange={value => setBrush(brush => ({ ...brush, opacity: value / 100 }))} />
      <Range label="Smoothing" value={Math.round(brush.smoothing * 100)} min={0} max={100} suffix="%" onChange={value => setBrush(brush => ({ ...brush, smoothing: value / 100 }))} />
      <label className="fbf-check"><input type="checkbox" checked={brush.pressureSize} onChange={event => setBrush(value => ({ ...value, pressureSize: event.target.checked }))} />Pen pressure controls size</label>
      {tool === 'brush' && color}{tool === 'eraser' && <p>Erase pixels on the active drawing. An active selection limits the erased area.</p>}
    </section>}
    {tool === 'fill' && <section><h3>Fill</h3>{color}<Range label="Fill tolerance" value={props.tolerance} min={0} max={255} onChange={props.setTolerance} /><p>Fill connected pixels on this drawing. Higher tolerance includes more similar colors.</p></section>}
    {shape && <section><h3>{tool === 'rectangle' ? 'Rectangle' : 'Ellipse'}</h3><label className="fbf-check"><input type="checkbox" checked={props.filled} onChange={event => props.setFilled(event.target.checked)} />Filled shape</label>{!props.filled && <Range label="Outline width" value={brush.size} min={1} max={300} suffix="px" onChange={size => setBrush(value => ({ ...value, size }))} />}<Range label="Shape opacity" value={Math.round(brush.opacity * 100)} min={1} max={100} suffix="%" onChange={value => setBrush(brush => ({ ...brush, opacity: value / 100 }))} />{color}<p>Drag to draw. Hold Shift for equal width and height.</p></section>}
    {tool === 'eyedropper' && <section><h3>Eyedropper</h3><p>Click a colored pixel on the active drawing to sample its color.</p>{color}</section>}
    {tool === 'hand' && <section><h3>Pan & zoom</h3><p>Drag to move the canvas. Scroll to zoom around the pointer.</p><div className="fbf-property-zoom"><button className="fbf-button" aria-label="Decrease canvas zoom" onClick={() => props.onZoom(.8)}><Minus size={14} /></button><span>{Math.round(props.zoom * 100)}%</span><button className="fbf-button" aria-label="Increase canvas zoom" onClick={() => props.onZoom(1.25)}><Plus size={14} /></button></div><button className="fbf-button" onClick={props.onFit}><Maximize size={14} />Fit canvas</button></section>}
    {selecting && <section><h3>{tool === 'lasso' ? 'Freehand lasso' : 'Rectangle selection'}</h3><p>{tool === 'lasso' ? 'Draw around an area and release to close the selection.' : 'Drag a box around the area you want to edit.'} Drag inside to move; drag outside to replace the selection.</p><button className="fbf-button" disabled={!canEdit} onClick={props.onSelectAll}>Select entire drawing</button>{selection && <button className="fbf-button" onClick={props.onDeselect}><X size={13} />Deselect</button>}</section>}
    {transforming && <section><h3>{selection ? 'Transform selection' : 'Transform drawing'}</h3><p>Drag the handles to resize. Drag the round handle to rotate. Shift locks proportions or snaps rotation to 15°.</p><div className="fbf-transform-fields"><label className="fbf-field">Width (%)<input aria-label="Transform width percent" type="number" min={1} max={1000} value={width} onChange={event => { const value = Number(event.target.value); setWidth(value); if (props.lockAspect) setHeight(value) }} /></label><label className="fbf-field">Height (%)<input aria-label="Transform height percent" type="number" min={1} max={1000} value={height} onChange={event => { const value = Number(event.target.value); setHeight(value); if (props.lockAspect) setWidth(value) }} /></label></div><label className="fbf-check"><input type="checkbox" checked={props.lockAspect} onChange={event => { props.setLockAspect(event.target.checked); if (event.target.checked) setHeight(width) }} />Lock aspect ratio</label><label className="fbf-field">Rotation (°)<input aria-label="Transform rotation degrees" type="number" min={-360} max={360} value={rotation} onChange={event => setRotation(Number(event.target.value))} /></label><button className="fbf-button" disabled={!canEdit || !valid} onClick={() => { props.onTransform(width, height, rotation); setWidth(100); setHeight(100); setRotation(0) }}>Apply transform</button><div className="fbf-transform-fields"><button className="fbf-button" disabled={!canEdit} onClick={() => props.onFlip('horizontal')}><FlipHorizontal2 size={13} />Flip H</button><button className="fbf-button" disabled={!canEdit} onClick={() => props.onFlip('vertical')}><FlipVertical2 size={13} />Flip V</button></div>{selection && !selecting && <button className="fbf-button" onClick={props.onDeselect}><X size={13} />Deselect</button>}</section>}
    {selection && !selecting && tool !== 'transform' && <section><h3>Selected region</h3><p>Edits stay inside your selection.</p><button className="fbf-button" onClick={() => props.onTool('transform')}><MousePointer2 size={13} />Transform selection</button><button className="fbf-button" onClick={props.onDeselect}><X size={13} />Deselect</button></section>}
    {tool !== 'hand' && tool !== 'eyedropper' && <section><button className="fbf-button" disabled={!canEdit} onClick={props.onClear}>Clear {selection ? 'selection' : 'drawing'}</button></section>}
  </div>
}

export function Range({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="fbf-range"><span>{label}<strong>{value}{suffix}</strong></span><input aria-label={label} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /></label>
}
