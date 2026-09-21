import { describe, expect, it } from 'vitest'
import { runAnimationSync } from '../animation/evaluate'
import { exportBrushJson, importBrushJson } from '../brushTransfer'
import { EXPRESSIVE_BRUSHES } from '../expressivePresets'
import { snapshotStroke } from '../input/sampler'
import { strokeTiming } from '../render/timing'
import { animationSourceHash } from './animationTiming'
import { PREVIOUS_SCATTERED_PENCIL_SOURCE, PREVIOUS_SPEED_TAPER_SOURCE, upgradeParsedBrush } from './brushUpgrades'
import { createBrushV2, createDocumentV2, emptyPoint } from './defaults'
import { parseBrush, parseDocument } from './schema'
import type { AnimationTiming } from './types'

const currentPencil = () => EXPRESSIVE_BRUSHES.find((brush) => brush.id === 'scatteredPencil')!
const previousHash = animationSourceHash(PREVIOUS_SCATTERED_PENCIL_SOURCE)
const previousPencil = () => createBrushV2({
  ...currentPencil(), version: 1, animationJs: PREVIOUS_SCATTERED_PENCIL_SOURCE,
  animationTiming: { mode: 'stepped', fps: 7, sourceHash: previousHash },
})

describe('Scattered Pencil recipe upgrade', () => {
  it('identifies the exact released version-1 recipe rather than matching a hash alone', () => {
    expect(PREVIOUS_SCATTERED_PENCIL_SOURCE).toHaveLength(3945)
    expect(previousHash).toBe('d9dd10f')
    expect(currentPencil().animationJs).not.toBe(PREVIOUS_SCATTERED_PENCIL_SOURCE)
    expect(currentPencil().version).toBe(2)
  })

  it('updates the original recipe while preserving user settings and input immutability', () => {
    const original = {
      ...previousPencil(), name: 'My light pencil', category: 'Favorites',
      color: '#bc634d', opacity: 0.34, size: 37, spacing: 2.5, speed: 0.4,
      stability: 74, drift: 3, distortion: 0.15, rotationDegrees: 18,
      scatter: { along: 2, across: 0.5, seed: 71 },
      shadow: { offsetX: 3, offsetY: 2, blur: 4, color: '#123456', opacity: 0.6 },
      legacy: { annotation: 'Keep this' },
    }
    const before = structuredClone(original)
    const upgraded = parseBrush(original)!
    expect(upgraded).toEqual({
      ...original, version: 2, animationJs: currentPencil().animationJs,
      animationTiming: currentPencil().animationTiming,
    })
    expect(original).toEqual(before)
  })

  it('normalizes missing version and timing before upgrading an old saved brush', () => {
    const original = { ...previousPencil(), version: undefined, animationTiming: undefined }
    const upgraded = parseBrush(original)!
    expect(upgraded.version).toBe(2)
    expect(upgraded.animationJs).toBe(currentPencil().animationJs)
    expect(upgraded.animationTiming).toEqual(currentPencil().animationTiming)
  })

  it.each<AnimationTiming>([
    { mode: 'stepped', fps: 12, sourceHash: previousHash },
    { mode: 'once', settleSeconds: 9, sourceHash: previousHash },
    { mode: 'static', sourceHash: previousHash },
  ])('retains explicitly configured $mode timing and authenticates the replacement', (timing) => {
    const upgraded = parseBrush({ ...previousPencil(), animationTiming: timing })!
    expect(upgraded.animationTiming).toEqual({
      ...timing, sourceHash: animationSourceHash(currentPencil().animationJs),
    })
  })

  it('leaves stale timing metadata stale rather than granting it scheduling authority', () => {
    const timing: AnimationTiming = { mode: 'static', sourceHash: 'stale-source' }
    const upgraded = parseBrush({ ...previousPencil(), animationTiming: timing })!
    expect(upgraded.animationJs).toBe(currentPencil().animationJs)
    expect(upgraded.animationTiming).toEqual(timing)
    expect(upgraded.animationTiming?.sourceHash).not.toBe(animationSourceHash(upgraded.animationJs))
  })

  it('preserves revised scripts, separately identified custom brushes, and other versions', () => {
    const old = previousPencil()
    for (const brush of [
      { ...old, animationJs: old.animationJs + '\n// User edit' },
      { ...old, animationJs: old.animationJs.replace('0.26', '0.32') },
      { ...old, id: 'my-custom-pencil' },
      { ...old, version: 2 },
      { ...old, version: 3 },
    ]) {
      // Matching inherited timing must never override an edited source string.
      expect(upgradeParsedBrush(brush)).toBe(brush)
      expect(parseBrush(brush)).toEqual(brush)
    }
  })

  it('is idempotent after the first upgrade', () => {
    const upgraded = upgradeParsedBrush(previousPencil())
    expect(upgradeParsedBrush(upgraded)).toBe(upgraded)
    expect(parseBrush(JSON.parse(JSON.stringify(upgraded)))).toEqual(upgraded)
  })

  it('upgrades only matching snapshots when restoring a complete saved document', () => {
    const document = createDocumentV2('Pencil drawing', 640, 480)
    const points = [emptyPoint(20, 40), emptyPoint(180, 70, 0.5)]
    const original = snapshotStroke(previousPencil(), points, document.activeLayerId, 41)
    const custom = snapshotStroke({ ...previousPencil(), id: 'custom-pencil' }, points, document.activeLayerId, 42)
    const edited = snapshotStroke({ ...previousPencil(), animationJs: PREVIOUS_SCATTERED_PENCIL_SOURCE + '\n// tweaked' }, points, document.activeLayerId, 43)
    document.layers[0].strokes = [original, custom, edited]
    const restored = parseDocument(JSON.parse(JSON.stringify(document)))!
    expect(restored.layers[0].strokes[0]).toEqual({
      ...original, brushSnapshot: upgradeParsedBrush(original.brushSnapshot),
    })
    expect(restored.layers[0].strokes.slice(1)).toEqual([custom, edited])
    expect(document.layers[0].strokes[0].brushSnapshot.version).toBe(1)
  })

  it('exports the revised portable recipe and preserves imported custom identities', () => {
    const exported = JSON.parse(exportBrushJson(previousPencil()))
    expect(exported.version).toBe(2)
    expect(exported.animationJs).toBe(currentPencil().animationJs)
    const imported = importBrushJson(JSON.stringify(exported))!
    expect(imported.id).not.toBe('scatteredPencil')
    expect(imported.category).toBe('Custom')
    expect(imported.animationJs).toBe(currentPencil().animationJs)
    const request = { points: [emptyPoint(0, 0), emptyPoint(100, 30)], time: 0.4, seed: 7 }
    const result = runAnimationSync({ ...request, source: imported.animationJs, config: imported })
    expect(result.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(result.items).toEqual(runAnimationSync({ ...request, source: currentPencil().animationJs, config: currentPencil() }).items)

    const custom = { ...previousPencil(), id: 'previous-custom-pencil' }
    const importedCustom = importBrushJson(exportBrushJson(custom))!
    expect(importedCustom.animationJs).toBe(PREVIOUS_SCATTERED_PENCIL_SOURCE)
    expect(importedCustom.version).toBe(1)
  })
})

const currentSpeedTaper = () => EXPRESSIVE_BRUSHES.find((brush) => brush.id === 'speedTaper')!
const previousSpeedHash = animationSourceHash(PREVIOUS_SPEED_TAPER_SOURCE)
const previousSpeedTaper = () => createBrushV2({
  ...currentSpeedTaper(), version: 1, animationJs: PREVIOUS_SPEED_TAPER_SOURCE,
  animationTiming: { mode: 'static', sourceHash: previousSpeedHash },
})

describe('animated Speed Taper recipe upgrade', () => {
  it('recognizes the exact old recipe and replaces its static scheduling', () => {
    expect(PREVIOUS_SPEED_TAPER_SOURCE).toHaveLength(2650)
    expect(previousSpeedHash).toBe('f0afbfff')
    expect(currentSpeedTaper().version).toBe(2)
    expect(currentSpeedTaper().animationJs).not.toBe(PREVIOUS_SPEED_TAPER_SOURCE)
    const upgraded = parseBrush(previousSpeedTaper())!
    expect(upgraded.version).toBe(2)
    expect(upgraded.animationJs).toBe(currentSpeedTaper().animationJs)
    expect(upgraded.animationTiming).toBeUndefined()
    const stroke = snapshotStroke(upgraded, [emptyPoint(0, 0), emptyPoint(100, 30, 1)], 'layer')
    expect(strokeTiming(stroke, 10_000, 10_000).delay).toBe(0)
  })

  it.each<AnimationTiming | undefined>([
    undefined,
    { mode: 'static', sourceHash: previousSpeedHash },
    { mode: 'once', settleSeconds: 0.01, sourceHash: previousSpeedHash },
    { mode: 'stepped', fps: 12, sourceHash: previousSpeedHash },
  ])('does not authenticate inherited metadata for a newly time-varying recipe (%j)', (timing) => {
    const upgraded = parseBrush({ ...previousSpeedTaper(), animationTiming: timing })!
    expect(upgraded.animationTiming).toBeUndefined()
  })

  it('preserves stale custom metadata only when it remains stale for the replacement', () => {
    const timing: AnimationTiming = { mode: 'once', settleSeconds: 9, sourceHash: 'custom-stale-source' }
    const upgraded = parseBrush({ ...previousSpeedTaper(), animationTiming: timing })!
    expect(upgraded.animationTiming).toEqual(timing)
    const stroke = snapshotStroke(upgraded, [emptyPoint(0, 0), emptyPoint(100, 30, 1)], 'layer')
    expect(strokeTiming(stroke, 10_000, 10_000).delay).toBe(0)
    // Metadata invalid for the old recipe must not accidentally become valid
    // for its replacement and freeze it.
    const collision = { ...timing, sourceHash: animationSourceHash(currentSpeedTaper().animationJs) }
    expect(parseBrush({ ...previousSpeedTaper(), animationTiming: collision })!.animationTiming).toBeUndefined()
  })

  it('preserves configured appearance and leaves the saved input untouched', () => {
    const original = {
      ...previousSpeedTaper(), name: 'My tapered ink', category: 'Favorites',
      color: '#337799', size: 31, opacity: 0.75, spacing: 2, speed: 0.7,
      drift: 1, stability: 67, distortion: 0.2, seed: 28,
      scatter: { along: 0.5, across: 0.8, seed: 3 },
      legacy: { annotation: 'Retain this' },
    }
    const before = structuredClone(original)
    expect(parseBrush(original)).toEqual({
      ...original, version: 2, animationJs: currentSpeedTaper().animationJs,
      animationTiming: undefined,
    })
    expect(original).toEqual(before)
  })

  it('keeps user-edited code, custom identities, and other versions untouched', () => {
    const original = previousSpeedTaper()
    for (const brush of [
      { ...original, animationJs: original.animationJs + '\n// User edit' },
      { ...original, animationJs: original.animationJs.replace('0.23', '0.4') },
      { ...original, id: 'custom-speed-taper' },
      { ...original, version: 2 },
      { ...original, version: 3 },
    ]) {
      expect(upgradeParsedBrush(brush)).toBe(brush)
      expect(parseBrush(brush)).toEqual(brush)
    }
  })

  it('updates matching saved strokes once, including the earliest one-shot metadata', () => {
    const document = createDocumentV2('Animated ink', 640, 480)
    const points = [emptyPoint(20, 40), emptyPoint(180, 70, 0.5)]
    const first = snapshotStroke(previousSpeedTaper(), points, document.activeLayerId, 51)
    const once = snapshotStroke({ ...previousSpeedTaper(), animationTiming: {
      mode: 'once', settleSeconds: 0.01, sourceHash: previousSpeedHash,
    } }, points, document.activeLayerId, 52)
    const custom = snapshotStroke({ ...previousSpeedTaper(), id: 'custom-taper' }, points, document.activeLayerId, 53)
    document.layers[0].strokes = [first, once, custom]
    const restored = parseDocument(JSON.parse(JSON.stringify(document)))!
    expect(restored.layers[0].strokes[0]).toEqual({ ...first, brushSnapshot: upgradeParsedBrush(first.brushSnapshot) })
    expect(restored.layers[0].strokes[1]).toEqual({ ...once, brushSnapshot: upgradeParsedBrush(once.brushSnapshot) })
    expect(restored.layers[0].strokes[2]).toEqual(custom)
    expect(parseDocument(JSON.parse(JSON.stringify(restored)))).toEqual(restored)
    expect(upgradeParsedBrush(restored.layers[0].strokes[0].brushSnapshot)).toBe(restored.layers[0].strokes[0].brushSnapshot)
  })

  it('exports the animated replacement as a self-contained brush without frozen timing', () => {
    const imported = importBrushJson(exportBrushJson(previousSpeedTaper()))!
    expect(imported.id).not.toBe('speedTaper')
    expect(imported.version).toBe(2)
    expect(imported.animationTiming).toBeUndefined()
    const request = {
      points: [emptyPoint(0, 0), emptyPoint(200, 30)], seed: 7,
      source: imported.animationJs, config: imported,
    }
    const first = runAnimationSync({ ...request, time: 0 })
    const later = runAnimationSync({ ...request, time: 0.75 })
    expect(first.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(later.diagnostics.filter((item) => item.code === 'animate-error')).toEqual([])
    expect(first.items.map((item) => item.size)).not.toEqual(later.items.map((item) => item.size))
    expect(runAnimationSync({ ...request, time: 0 }).items).toEqual(first.items)
  })
})
