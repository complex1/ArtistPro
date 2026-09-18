import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ArrowRight, Check, LoaderCircle, Pause, Play, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import type { AnimationDocument, Cel } from '../model'
import { analyzeInbetweens, generateInbetweens } from './client'
import { insertInbetweens, planInbetweens, type InbetweenPlacement } from './timeline'
import { MAX_ANCHORS, MAX_GENERATED_PIXELS, MAX_INBETWEENS, type AnalysisResult, type AnchorPair, type GeneratedDrawing, type MotionRefinement, type PixelPoint, type Spacing } from './types'
import './inbetween.css'

type Props = { document: AnimationDocument; layerId: string; fromCelId?: string; onClose: () => void; onApply: (document: AnimationDocument, firstFrame: number) => void }
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not generate these drawings.'

export function InbetweenDialog({ document: doc, layerId, fromCelId, onClose, onApply }: Props) {
  const layer = doc.layers.find(layer => layer.id === layerId)!
  const choices = layer.cels.filter((cel, index) => cel.dataUrl && layer.cels[index + 1]?.dataUrl)
  const preferred = choices.find(cel => cel.id === fromCelId) ?? choices.find(cel => layer.cels[layer.cels.indexOf(cel) + 1]?.id === fromCelId) ?? choices[0]
  const [fromId, setFromId] = useState(preferred?.id ?? '')
  const from = choices.find(cel => cel.id === fromId), to = from ? layer.cels[layer.cels.indexOf(from) + 1] : undefined
  const [count, setCount] = useState(3), [exposure, setExposure] = useState(1), [placement, setPlacement] = useState<InbetweenPlacement>('insert')
  const [spacing, setSpacing] = useState<Spacing>('linear'), [threshold, setThreshold] = useState(.35), [removeSpecks, setRemoveSpecks] = useState(true), [refinement, setRefinement] = useState<MotionRefinement>('adaptive')
  const [pairs, setPairs] = useState<AnchorPair[]>([]), [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null), [adding, setAdding] = useState(false), [pending, setPending] = useState<PixelPoint | null>(null)
  const [generated, setGenerated] = useState<GeneratedDrawing[]>([]), [generatedRefinement, setGeneratedRefinement] = useState<MotionRefinement | null>(null), [index, setIndex] = useState(0), [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'generating'>('idle'), [progress, setProgress] = useState(0), [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null), request = useRef(0), alive = useRef(true), dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null)
  const busy = status !== 'idle'
  const effectiveRefinement = generatedRefinement ?? refinement
  const usedGuidedFallback = refinement === 'adaptive' && generatedRefinement === 'guided'
  const stopWork = useCallback(() => { request.current++; abort.current?.abort(); abort.current = null }, [])
  const { plan, planError } = useMemo(() => {
    try {
      if (doc.width * doc.height * count > MAX_GENERATED_PIXELS) throw new Error('This canvas supports fewer in-betweens per pass. Reduce the drawing count.')
      const cels = doc.layers.find(layer => layer.id === layerId)?.cels ?? []
      const nextId = cels[cels.findIndex(cel => cel.id === fromId) + 1]?.id
      return { plan: fromId && nextId ? planInbetweens(doc, layerId, fromId, nextId, count, exposure, placement) : undefined, planError: '' }
    } catch (error) { return { plan: undefined, planError: message(error) } }
  }, [doc, layerId, fromId, count, exposure, placement])
  const invalidate = () => { setGenerated([]); setGeneratedRefinement(null); setPlaying(false); setIndex(0); setError(null) }
  const cancel = useCallback(() => { stopWork(); setStatus('idle'); setProgress(0) }, [stopWork])
  const match = useCallback(async (a: Cel, b: Cel, inkThreshold: number, cleanup: boolean) => {
    abort.current?.abort()
    const current = ++request.current, controller = new AbortController(); abort.current = controller
    setStatus('analyzing'); setError(null); setGenerated([]); setGeneratedRefinement(null); setPlaying(false); setAnalysis(null)
    try {
      const result = await analyzeInbetweens(a.dataUrl!, b.dataUrl!, doc.width, doc.height, { threshold: inkThreshold, removeSpecks: cleanup }, controller.signal)
      if (!alive.current || current !== request.current) return
      setPairs(result.pairs); setAnalysis(result); setSelected(result.pairs[0]?.id ?? null); setAdding(false); setPending(null)
    } catch (error) { if (alive.current && current === request.current && !controller.signal.aborted) setError(message(error)) }
    finally { if (alive.current && current === request.current) { setStatus('idle'); abort.current = null } }
  }, [doc.width, doc.height])

  useEffect(() => {
    // Starting an external worker synchronizes the busy state with that request.
    // eslint-disable-next-line react/set-state-in-effect
    if (from && to) void match(from, to, .35, true)
    return stopWork
  }, [from, to, match, stopWork])
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    alive.current = true; close.current?.focus()
    return () => { alive.current = false; stopWork(); previousFocus?.focus() }
  }, [stopWork])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (adding) { setAdding(false); setPending(null) } else onClose() }
      if (event.key === 'Tab') {
        const controls = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length)
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    dialog.current?.addEventListener('keydown', keydown)
    const node = dialog.current
    return () => node?.removeEventListener('keydown', keydown)
  }, [adding, onClose])
  const remainingGap = plan && to ? Math.max(0, to.start + plan.shift - plan.endFrame) : 0
  const fromUrl = from?.dataUrl, toUrl = to?.dataUrl, toDuration = to?.duration ?? 1
  const previews = useMemo(() => {
    if (!fromUrl || !toUrl || !plan || !generated.length) return []
    return [
      { dataUrl: fromUrl, label: 'start key', short: 'A', hold: plan.fromDuration },
      ...generated.map((drawing, at) => ({ dataUrl: drawing.dataUrl, label: `in-between ${at + 1}`, short: String(at + 1), hold: plan.slots[at].duration })),
      ...(remainingGap ? [{ dataUrl: null, label: 'empty gap', short: 'Gap', hold: remainingGap }] : []),
      { dataUrl: toUrl, label: 'end key', short: 'B', hold: toDuration },
    ]
  }, [fromUrl, toUrl, toDuration, plan, generated, remainingGap])
  useEffect(() => {
    if (!playing || !previews.length) return
    const total = previews.reduce((sum, preview) => sum + preview.hold, 0), start = performance.now()
    let handle = 0
    const tick = (now: number) => {
      let frame = Math.floor((now - start) * doc.fps / 1000) % total, at = 0
      while (at < previews.length - 1 && frame >= previews[at].hold) { frame -= previews[at].hold; at++ }
      setIndex(at); handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [playing, previews, doc.fps])

  const movePair = (id: string, side: 'from' | 'to', point: PixelPoint) => {
    const current = pairs.find(pair => pair.id === id)?.[side]
    if (current && Math.abs(current.x - point.x) < .001 && Math.abs(current.y - point.y) < .001) return
    invalidate(); setPairs(pairs => pairs.map(pair => pair.id === id ? { ...pair, [side]: point, manual: true } : pair)); setSelected(id) }
  const removePair = (id: string) => { invalidate(); setPairs(pairs => pairs.filter(pair => pair.id !== id)); if (selected === id) setSelected(null) }
  function place(side: 'from' | 'to', point: PixelPoint) {
    if (!adding || busy) return
    if (side === 'from') { setPending(point); return }
    if (!pending) return
    invalidate()
    const pair: AnchorPair = { id: `guide-${crypto.randomUUID()}`, from: pending, to: point, manual: true }
    setPairs(pairs => [...pairs, pair]); setSelected(pair.id); setAdding(false); setPending(null)
  }
  async function generate() {
    if (!from || !to || !plan || planError || busy || !pairs.length) return
    const current = ++request.current, controller = new AbortController(); abort.current = controller
    setStatus('generating'); setProgress(0); setError(null); setGenerated([]); setGeneratedRefinement(null); setPlaying(false)
    try {
      const result = await generateInbetweens(from.dataUrl!, to.dataUrl!, doc.width, doc.height, { count, spacing, pairs, threshold, removeSpecks, refinement }, controller.signal, value => { if (alive.current && current === request.current) setProgress(value) })
      if (!alive.current || current !== request.current) return
      // Validate size and insertion against the complete shot before enabling Apply.
      insertInbetweens(doc, layerId, from.id, to.id, result.drawings, exposure, placement)
      setGenerated(result.drawings); setGeneratedRefinement(result.refinement); setIndex(Math.ceil(result.drawings.length / 2))
    } catch (error) { if (alive.current && current === request.current && !controller.signal.aborted) setError(message(error)) }
    finally { if (alive.current && current === request.current) { setStatus('idle'); abort.current = null } }
  }
  function apply() {
    if (!from || !to || !plan || generated.length !== count || busy) return
    try { onApply(insertInbetweens(doc, layerId, from.id, to.id, generated, exposure, placement), plan.firstFrame) }
    catch (error) { setError(message(error)) }
  }

  return <div className="fbf-ib-backdrop"><div className="fbf-ib-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="fbf-ib-title">
    <header><div className="fbf-ib-heading"><Sparkles size={22} /><div><h2 id="fbf-ib-title">Line art in-betweens</h2><p>Guide the motion. Preview it. Keep the drawings you like.</p></div></div><span className="fbf-ib-local">{usedGuidedFallback ? 'Guided fallback · on device' : effectiveRefinement === 'adaptive' ? 'ML assist · on device' : 'Guided · on device'}</span><button ref={close} aria-label="Close in-between studio" onClick={onClose}><X size={18} /></button></header>
    {!from || !to ? <div className="fbf-ib-empty"><Sparkles size={35} /><h3>Start with two drawings</h3><p>Draw or import two neighboring key poses on the same layer, then open In-between. Both drawings need visible dark lines on transparent or white paper.</p><p>Blank drawings between your keys count as drawings. Delete those blank cels first if you want to generate across the gap.</p><button className="fbf-primary" onClick={onClose}>Back to drawing</button></div> : <>
      <div className="fbf-ib-body"><aside className="fbf-ib-settings"><fieldset disabled={busy}>
        <label>Key drawings<select aria-label="Key drawing pair" value={fromId} onChange={event => { invalidate(); setPairs([]); setAnalysis(null); setSelected(null); setAdding(false); setPending(null); setThreshold(.35); setRemoveSpecks(true); setFromId(event.target.value) }}>{choices.map(cel => { const next = layer.cels[layer.cels.indexOf(cel) + 1]; return <option key={cel.id} value={cel.id}>Frames {cel.start + 1} → {next.start + 1}</option> })}</select></label><p className="fbf-ib-hint">Neighboring drawings on <strong>{layer.name}</strong>.</p>
        <div className="fbf-ib-setting-row"><label>In-between drawings<input aria-label="In-between drawing count" type="number" min={1} max={MAX_INBETWEENS} value={count} onChange={event => { invalidate(); setCount(Number(event.target.value)) }} /></label><label>Exposure<select aria-label="Generated drawing exposure" disabled={placement === 'fit'} value={exposure} onChange={event => { invalidate(); setExposure(Number(event.target.value)) }}>{[1,2,3,4,6,12].map(value => <option key={value} value={value}>{value} {value === 1 ? 'frame' : 'frames'}</option>)}</select></label></div>
        <label>Motion spacing<select aria-label="Motion spacing" value={spacing} onChange={event => { invalidate(); setSpacing(event.target.value as Spacing) }}><option value="linear">Even spacing</option><option value="ease-in">Slow start</option><option value="ease-out">Slow finish</option><option value="ease-in-out">Slow start & finish</option></select></label>
        <label>Line motion refinement<select aria-label="Line motion refinement" value={refinement} onChange={event => { invalidate(); setRefinement(event.target.value as MotionRefinement) }}><option value="adaptive">ML assist · local motion model</option><option value="guided">Guided TPS only</option></select></label>
        <p className="fbf-ib-hint fbf-ib-model-note">ML assist fits a small local motion model from both drawings and your guides. It stays on this device, does not invent line art, and falls back to Guided TPS when auto-matching is weak.</p>
        <label>Timeline placement<select aria-label="In-between placement" value={placement} onChange={event => { invalidate(); setPlacement(event.target.value as InbetweenPlacement) }}><option value="insert">Insert after the first key</option><option value="fit">Fit between key starts</option></select></label>
        <p className="fbf-ib-timing">{planError || (plan && (placement === 'fit' ? `First key holds for 1 frame. The end key stays at frame ${to.start + 1}.` : `Keeps both key drawings and their holds. ${plan.shift ? `The end key and later drawings on this layer move ${plan.shift} frames later.` : `Uses the empty gap; later drawings stay in place.${remainingGap ? ` ${remainingGap} empty frames remain before the end key. Use Fit to fill the span.` : ''}`}`))}</p>
        <div className="fbf-ib-divider" /><label>Ink threshold <strong>{Math.round(threshold * 100)}%</strong><input aria-label="Ink threshold" type="range" min={10} max={80} value={Math.round(threshold * 100)} onChange={event => { invalidate(); setThreshold(Number(event.target.value) / 100) }} /></label><label className="fbf-ib-checkbox"><input type="checkbox" checked={removeSpecks} onChange={event => { invalidate(); setRemoveSpecks(event.target.checked) }} />Remove tiny specks</label>
        <p className="fbf-ib-hint">Generated drawings use black ink on transparency. Colored or filled artwork may lose detail.</p>
      </fieldset>
      <div className="fbf-ib-guide-heading"><h3>Motion guides <span>{pairs.length}</span></h3><button title="Automatically match guides again" disabled={busy} aria-label="Auto-match guides" onClick={() => void match(from, to, threshold, removeSpecks)}><RotateCcw size={14} /></button></div>
      <p className="fbf-ib-hint">Select a guide to show its number in both poses. The points should mark the same feature. Drag a point to correct it.</p>
      <div className="fbf-ib-guide-actions"><button className="fbf-button" disabled={busy || pairs.length >= MAX_ANCHORS} aria-pressed={adding} onClick={() => { setAdding(value => !value); setPending(null) }}><Plus size={13} />{adding ? 'Cancel guide' : 'Add guide'}</button><button className="fbf-button" disabled={busy || !selected} aria-label="Remove selected guide" onClick={() => selected && removePair(selected)}><Trash2 size={13} /></button></div>
      <div className="fbf-ib-guide-list" aria-label="Motion guide pairs">{pairs.map((pair, index) => <button key={pair.id} className={selected === pair.id ? 'is-selected' : ''} disabled={busy} aria-label={`Select guide ${index + 1}`} onClick={() => setSelected(pair.id)}><span>{index + 1}</span><small>{pair.manual ? 'Edited' : 'Auto'}</small></button>)}</div>
      {!pairs.length && !busy && <p className="fbf-ib-hint">Add matching points or try Auto-match. Three or more spread-out guides help describe a changing pose.</p>}
      <p className="fbf-ib-limit">Best for related poses. Crossing limbs, hidden lines, and large pose changes can need manual cleanup.</p>
      </aside><main className="fbf-ib-workspace">
        <div className="fbf-ib-guidance" aria-live="polite">{busy ? <><LoaderCircle className="fbf-ib-spin" size={15} />{status === 'analyzing' ? 'Finding matching line features…' : `Drawing in-betweens… ${Math.round(progress * 100)}%`}</> : adding ? pending ? 'Now click the matching feature in the end drawing.' : 'Click a feature in the start drawing.' : <><Check size={14} />Review the matching guides, then generate a preview.</>}</div>
        <div className="fbf-ib-key-pair"><KeyDrawing title={`Start · frame ${from.start + 1}`} dataUrl={from.dataUrl!} width={doc.width} height={doc.height} side="from" pairs={pairs} selected={selected} disabled={busy} adding={adding} pending={pending} onSelect={setSelected} onMove={movePair} onPlace={place} onRemove={removePair} /><div className="fbf-ib-arrow"><ArrowRight size={19} /></div><KeyDrawing title={`End · frame ${to.start + 1}`} dataUrl={to.dataUrl!} width={doc.width} height={doc.height} side="to" pairs={pairs} selected={selected} disabled={busy} adding={adding} pending={null} onSelect={setSelected} onMove={movePair} onPlace={place} onRemove={removePair} /></div>
        {analysis?.warnings.length ? <div className="fbf-ib-warnings">{analysis.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div> : null}
        {usedGuidedFallback ? <div className="fbf-ib-warnings fbf-ib-model-fallback"><p>ML assist used Guided TPS for this preview because the line matches were too ambiguous.</p></div> : null}
        <div className="fbf-ib-preview-heading"><h3>Motion preview <span>{generated.length ? `${generated.length} new drawings` : 'Not generated yet'}</span></h3><button className="fbf-button" disabled={!generated.length || busy} aria-label={playing ? 'Pause in-between preview' : 'Play in-between preview'} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pause' : 'Play'}</button></div>
        <div className="fbf-ib-preview">{previews.length ? <>
          {previews[index]?.dataUrl ? <img src={previews[index].dataUrl!} alt={`Preview ${previews[index].label}`} /> : <div className="fbf-ib-blank">Empty timeline gap</div>}
          <span>{previews[index]?.label}</span>
        </> : <div><Sparkles size={25} /><strong>See the motion before adding it</strong><p>Your original drawings stay intact.</p></div>}</div>
        {previews.length > 0 && <div className="fbf-ib-filmstrip" aria-label="Generated preview drawings">{previews.map((preview, at) => <button key={at} aria-label={`Preview ${preview.label}`} className={index === at ? 'is-selected' : ''} onClick={() => { setPlaying(false); setIndex(at) }}>{preview.dataUrl ? <img src={preview.dataUrl} alt="" /> : <div className="fbf-ib-blank" />}<span>{preview.short}</span></button>)}</div>}
      </main></div>
      {error && <div className="fbf-ib-error" role="alert">{error}</div>}
      <footer><span>{status === 'generating' ? <progress value={progress} max={1} /> : usedGuidedFallback ? 'Guided TPS fallback · editable drawings · one-step Undo' : effectiveRefinement === 'adaptive' ? 'Local ML motion model · editable drawings · one-step Undo' : 'Guided TPS · editable drawings · one-step Undo'}</span><div>{busy ? <button className="fbf-button" onClick={cancel}>Cancel processing</button> : <button className="fbf-button" onClick={() => void generate()} disabled={Boolean(planError) || !pairs.length || adding}><Sparkles size={14} />{generated.length ? 'Generate again' : 'Generate preview'}</button>}<button className="fbf-primary" disabled={busy || generated.length !== count || !generated.length || Boolean(planError)} onClick={apply}><Plus size={14} />Insert {generated.length || count} drawings</button></div></footer>
    </>}
  </div></div>
}

type KeyProps = { title: string; dataUrl: string; width: number; height: number; side: 'from' | 'to'; pairs: AnchorPair[]; selected: string | null; disabled: boolean; adding: boolean; pending: PixelPoint | null; onSelect: (id: string) => void; onMove: (id: string, side: 'from' | 'to', point: PixelPoint) => void; onPlace: (side: 'from' | 'to', point: PixelPoint) => void; onRemove: (id: string) => void }
function KeyDrawing(props: KeyProps) {
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{ id: string; point: PixelPoint; pointer: number } | null>(null)
  const pointFor = (event: PointerEvent<SVGSVGElement>): PixelPoint => {
    const point = svg.current!.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
    const local = point.matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: Math.max(0, Math.min(props.width - 1, local.x)), y: Math.max(0, Math.min(props.height - 1, local.y)) }
  }
  const radius = Math.max(props.width, props.height) / 42
  return <section className="fbf-ib-key"><h3>{props.title}</h3><svg ref={svg} viewBox={`0 0 ${props.width} ${props.height}`} role="group" aria-label={`${props.side === 'from' ? 'Start' : 'End'} drawing motion guides`} className={props.adding ? 'is-adding' : ''} onPointerDown={event => {
    if (props.disabled || event.button !== 0) return
    event.preventDefault()
    const id = (event.target as Element).closest('[data-guide-id]')?.getAttribute('data-guide-id')
    if (!props.adding && id) { const pair = props.pairs.find(pair => pair.id === id)!; drag.current = { id, point: pair[props.side], pointer: event.pointerId }; props.onSelect(id); event.currentTarget.setPointerCapture(event.pointerId) }
    else if (props.adding) props.onPlace(props.side, pointFor(event))
  }} onPointerMove={event => { if (drag.current?.pointer === event.pointerId) props.onMove(drag.current.id, props.side, pointFor(event)) }} onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { props.onMove(drag.current.id, props.side, pointFor(event)); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }} onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) { props.onMove(drag.current.id, props.side, drag.current.point); drag.current = null } }}>
    <rect width={props.width} height={props.height} fill="white" /><image href={props.dataUrl} width={props.width} height={props.height} />
    {props.pairs.map((pair, index) => <g key={pair.id} data-guide-id={pair.id} role="button" tabIndex={props.disabled ? -1 : 0} aria-label={`${props.side === 'from' ? 'Start' : 'End'} guide ${index + 1}`} className={`fbf-ib-anchor ${props.selected === pair.id ? 'is-selected' : ''}`} onKeyDown={event => {
      if (props.disabled) return
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); props.onRemove(pair.id) }
      if (event.key.startsWith('Arrow')) { event.preventDefault(); const amount = event.shiftKey ? 10 : 1, current = pair[props.side]; props.onMove(pair.id, props.side, { x: Math.max(0, Math.min(props.width - 1, current.x + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0))), y: Math.max(0, Math.min(props.height - 1, current.y + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0))) }) }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(pair.id) }
    }}><circle className="fbf-ib-anchor-dot" cx={pair[props.side].x} cy={pair[props.side].y} r={radius * .32} /><circle className="fbf-ib-anchor-label" cx={pair[props.side].x} cy={pair[props.side].y} r={radius} /><text x={pair[props.side].x} y={pair[props.side].y} fontSize={radius * 1.1} textAnchor="middle" dominantBaseline="central">{index + 1}</text></g>)}
    {props.pending && <circle cx={props.pending.x} cy={props.pending.y} r={radius} fill="#e6b472" stroke="#553d1a" strokeWidth={radius / 7} />}
  </svg></section>
}
