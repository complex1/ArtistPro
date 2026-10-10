import { describe, expect, it } from 'vitest'
import {
  createDocument, createPose, evaluatePose, JOINTS, MAX_PROJECT_BYTES, MAX_STROKES, MAX_STROKE_POINTS,
  movePoseKey, parseProject, POSE_PRESETS, removePoseKey, serializeProject, setPoseKey, validateDocument,
} from './model'
import type { AnimeDocument } from './types'

describe('Anime 3D timeline', () => {
  it('builds an independent blank or sample clip with complete whole-rig keys', () => {
    const blank = createDocument('  My shot  ')
    expect(blank.name).toBe('My shot')
    expect(blank.keys).toEqual([{ frame: 1, pose: createPose() }])
    const sample = createDocument(undefined, true)
    expect(sample.name).toBe('First wave')
    expect(sample.keys.map(key => key.frame)).toEqual([1, 9, 17])
    expect(sample.fps).toBe(24)
    expect(sample.duration).toBe(24)
    expect(Object.keys(sample.keys[0].pose)).toEqual(JOINTS)
    sample.keys[1].pose.leftUpperArm[2] = 0
    expect(createDocument(undefined, true).keys[1].pose).toEqual(POSE_PRESETS[1].pose)
    sample.camera.position[0] = 100
    expect(createDocument().camera.position[0]).not.toBe(100)
  })

  it('holds each sample pose for exactly eight frames and isolates evaluated poses', () => {
    const clip = createDocument(undefined, true)
    for (let frame = 1; frame <= 24; frame++) expect(evaluatePose(clip, frame)).toEqual(POSE_PRESETS[Math.floor((frame - 1) / 8)].pose)
    expect(evaluatePose(clip, -1)).toEqual(POSE_PRESETS[0].pose)
    expect(evaluatePose(clip, 99)).toEqual(POSE_PRESETS[2].pose)
    expect(evaluatePose(clip, 8.99)).toEqual(POSE_PRESETS[0].pose)
    const pose = evaluatePose(clip, 9)
    pose.leftHand[0] = 42
    expect(clip.keys[1].pose.leftHand[0]).toBe(0)
    expect(() => evaluatePose(clip, NaN)).toThrow('finite frame')
  })

  it('inserts or updates one complete key without mutating the source or caller pose', () => {
    const initial = createDocument()
    const pose = createPose()
    pose.head = [10, 20, 30]
    const keyed = setPoseKey(initial, 8, pose)
    expect(initial.keys).toHaveLength(1)
    expect(keyed.keys.map(key => key.frame)).toEqual([1, 8])
    pose.head[0] = 99
    expect(evaluatePose(keyed, 8).head).toEqual([10, 20, 30])
    const updated = setPoseKey(keyed, 8, createPose())
    expect(updated.keys).toHaveLength(2)
    expect(evaluatePose(updated, 8)).toEqual(createPose())
    expect(evaluatePose(keyed, 8).head[0]).toBe(10)
  })

  it('preserves the initial key, resets through replacement, and extends holds after deletion', () => {
    const sample = createDocument(undefined, true)
    expect(() => removePoseKey(sample, 1)).toThrow('base pose')
    const removed = removePoseKey(sample, 9)
    expect(removed.keys.map(key => key.frame)).toEqual([1, 17])
    expect(evaluatePose(removed, 16)).toEqual(createPose())
    expect(sample.keys).toHaveLength(3)
    const changed = setPoseKey(sample, 1, POSE_PRESETS[1].pose)
    const reset = setPoseKey(changed, 1, createPose())
    expect(reset.keys).toHaveLength(3)
    expect(evaluatePose(reset, 1)).toEqual(createPose())
  })

  it('moves keys with explicit collision replacement and never removes the base key', () => {
    const sample = createDocument(undefined, true)
    expect(() => movePoseKey(sample, 17, 9)).toThrow('occupied')
    expect(() => movePoseKey(sample, 1, 8)).toThrow('base pose')
    expect(() => movePoseKey(sample, 8, 9)).toThrow('no pose key')
    const moved = movePoseKey(sample, 17, 18)
    expect(moved.keys.map(key => key.frame)).toEqual([1, 9, 18])
    expect(evaluatePose(moved, 17)).toEqual(POSE_PRESETS[1].pose)
    const replaced = movePoseKey(sample, 17, 9, true)
    expect(replaced.keys.map(key => key.frame)).toEqual([1, 9])
    expect(evaluatePose(replaced, 9)).toEqual(POSE_PRESETS[2].pose)
    expect(movePoseKey(sample, 17, 1, true).keys[0].frame).toBe(1)
    expect(sample.keys.map(key => key.frame)).toEqual([1, 9, 17])
  })

  it.each([0, 25, 1.5, NaN, Infinity])('rejects an invalid edit frame %s', frame => {
    const document = createDocument()
    expect(() => setPoseKey(document, frame, createPose())).toThrow('Frame')
    expect(() => removePoseKey(document, frame)).toThrow('Frame')
    expect(() => movePoseKey(document, 1, frame)).toThrow('Frame')
  })
})

describe('portable Anime 3D documents', () => {
  it('round-trips the complete scene and returns detached, known-shape data', () => {
    const document = createDocument('Portable wave', true)
    document.strokes = [{ id: 'effect', points: [[1, 2, 0], [1.2, 2.2, 0]], color: '#f3a121', width: 0.03 }]
    document.character.position = [-2, 0, 1]
    document.character.rotation = 30
    document.character.locked = true
    document.output.transparent = true
    const imported = parseProject(serializeProject(document))
    expect(imported).toEqual(document)
    imported.strokes[0].points[0][0] = 50
    imported.keys[0].pose.head[1] = 10
    expect(document.strokes[0].points[0][0]).toBe(1)
    expect(document.keys[0].pose.head[1]).toBe(0)
    expect(parseProject(JSON.stringify({ id: 'old-id', document }))).toEqual(document)
  })

  it.each([
    ['unknown version', (d: AnimeDocument) => Object.assign(d, { version: 2 })],
    ['wrong duration', (d: AnimeDocument) => Object.assign(d, { duration: 25 })],
    ['wrong frame rate', (d: AnimeDocument) => Object.assign(d, { fps: 12 })],
    ['wrong output dimensions', (d: AnimeDocument) => Object.assign(d.output, { width: 4096 })],
    ['non-finite vector', (d: AnimeDocument) => { d.camera.position[0] = Infinity }],
    ['oversized coordinates', (d: AnimeDocument) => { d.character.position[1] = 1001 }],
    ['coincident camera', (d: AnimeDocument) => { d.camera.position = [...d.camera.target] }],
    ['invalid camera lens', (d: AnimeDocument) => { d.camera.fov = 0 }],
    ['unsafe color', (d: AnimeDocument) => { d.appearance.background = 'url(javascript:alert(1))' }],
    ['wrong boolean', (d: AnimeDocument) => Object.assign(d.character, { locked: 'false' })],
    ['oversized name', (d: AnimeDocument) => { d.name = 'x'.repeat(121) }],
    ['no base key', (d: AnimeDocument) => { d.keys[0].frame = 2 }],
    ['fractional key', (d: AnimeDocument) => { d.keys.push({ frame: 2.5, pose: createPose() }) }],
    ['duplicate key', (d: AnimeDocument) => { d.keys.push({ frame: 1, pose: createPose() }) }],
    ['unknown joint', (d: AnimeDocument) => Object.assign(d.keys[0].pose, { imaginary: [0, 0, 0] })],
    ['missing joint', (d: AnimeDocument) => { delete (d.keys[0].pose as Partial<typeof d.keys[0]['pose']>).head }],
    ['wrong vector length', (d: AnimeDocument) => Object.assign(d.keys[0].pose, { head: [0, 0] })],
    ['unbounded rotation', (d: AnimeDocument) => { d.keys[0].pose.head[0] = 181 }],
  ])('rejects %s before rendering or saving', (_name, mutate) => {
    const document = createDocument()
    mutate(document)
    expect(() => validateDocument(document)).toThrow('Invalid Anime 3D project')
  })

  it('bounds stroke counts, total geometry, widths, and unique IDs', () => {
    const document = createDocument()
    const stroke = { id: 'effect', points: [[0, 0, 0], [1, 1, 1]] as [number, number, number][], color: '#123abc', width: .025 }
    document.strokes = Array.from({ length: MAX_STROKES + 1 }, (_, index) => ({ ...stroke, id: `stroke-${index}` }))
    expect(() => validateDocument(document)).toThrow('200 strokes')
    document.strokes = [{ ...stroke, points: Array.from({ length: MAX_STROKE_POINTS }, () => [0, 0, 0]) }, { ...stroke, id: 'extra' }]
    expect(() => validateDocument(document)).toThrow('40000 stroke points')
    document.strokes = [stroke, { ...stroke }]
    expect(() => validateDocument(document)).toThrow('IDs must be unique')
    document.strokes = [{ ...stroke, width: 0 }]
    expect(() => validateDocument(document)).toThrow('stroke width')
    document.strokes = [{ ...stroke, points: [[0, 0, 0]] }]
    expect(() => validateDocument(document)).toThrow('at least two points')
  })

  it('rejects oversized UTF-8 text before parsing and explains invalid JSON', () => {
    expect(() => parseProject(' '.repeat(MAX_PROJECT_BYTES + 1))).toThrow('8 MiB')
    expect(() => parseProject('界'.repeat(Math.ceil(MAX_PROJECT_BYTES / 3)))).toThrow('8 MiB')
    expect(() => parseProject('{broken')).toThrow('not valid JSON')
    expect(() => parseProject('null')).toThrow('object')
  })

  it('discards foreign payloads without prototype pollution and sorts imported keys', () => {
    const document = createDocument(undefined, true)
    document.keys.reverse()
    const payload = JSON.parse(JSON.stringify({ ...document, foreign: { deeply: { nested: true } } }))
    Object.defineProperty(payload, '__proto__', { enumerable: true, value: { polluted: true } })
    payload.character.foreign = 'ignored'
    const cleaned = validateDocument(payload)
    expect(cleaned.keys.map(key => key.frame)).toEqual([1, 9, 17])
    expect(cleaned).not.toHaveProperty('foreign')
    expect(cleaned.character).not.toHaveProperty('foreign')
    expect(Object.hasOwn(cleaned, '__proto__')).toBe(false)
    expect({}).not.toHaveProperty('polluted')
  })
})
