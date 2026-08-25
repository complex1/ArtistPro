import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from './editorStore'
import { findNode } from '../model/scene'
import { evaluateScene, findTrack } from '../model/animation'
import { DEFAULT_PRESET_CONFIG } from '../model/animationPresets'
import { createShape } from '../model/nodes'
import { createPath, createPathPoint } from '../model/path'
import type { AnimatableProperty, RectNode } from '../model/types'

const store = () => useEditorStore.getState()

const rect = (): RectNode => {
  const node = findNode(store().document.children, store().selectedIds[0])
  if (!node || node.type !== 'rect') throw new Error('expected a rect')
  return node
}

const painted = (time: number) => {
  const scene = evaluateScene(store().document.children, store().document.animation, time)
  const node = scene[0]
  if (node.type !== 'rect') throw new Error('expected a rect')
  return node
}

const keys = (property: AnimatableProperty) =>
  findTrack(store().document.animation, rect().id, property)?.keys ?? []

beforeEach(() => {
  const fresh = createShape('rect')
  useEditorStore.setState((state) => ({
    document: { ...state.document, children: [fresh], animation: { duration: 3, tracks: [] } },
    selectedIds: [fresh.id],
    selectedKeyIds: [],
    playhead: 0,
    playing: false,
    mode: 'animate',
  }))
})

describe('animate authoring', () => {
  it('keys a transform channel dragged at t>0 and leaves the rest pose alone', () => {
    const id = rect().id
    const restX = rect().transform.position.x
    store().armProperty(id, 'position.x')
    store().setPlayhead(1.5, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 500, y: rect().transform.position.y },
    })

    expect(keys('position.x').map((key) => [key.time, key.value])).toEqual([
      [0, restX],
      [1.5, 500],
    ])
    expect(rect().transform.position.x).toBe(restX)
    expect(painted(1.5).transform.position.x).toBe(500)
  })

  it('keys a colour channel edited at t>0 and leaves the rest pose alone', () => {
    const id = rect().id
    const restFill = rect().fill
    store().armProperty(id, 'fill')
    store().setPlayhead(2, true)
    store().updateNode(id, { fill: '#ff0000' })

    expect(keys('fill').map((key) => [key.time, key.value])).toEqual([
      [0, restFill],
      [2, '#ff0000'],
    ])
    expect(rect().fill).toBe(restFill)
    expect(painted(2).fill).toBe('#ff0000')
    expect(painted(0).fill).toBe(restFill)
  })

  it('interpolates a colour between its keys', () => {
    const id = rect().id
    store().updateNode(id, { fill: '#000000' })
    store().armProperty(id, 'fill')
    store().setPlayhead(2, true)
    store().updateNode(id, { fill: '#ffffff' })

    expect(painted(1).fill).toBe('#808080')
  })

  it('keys a size channel edited at t>0', () => {
    const id = rect().id
    const restWidth = rect().width
    store().armProperty(id, 'width')
    store().setPlayhead(1, true)
    store().updateNode(id, { width: 400 })

    expect(keys('width').map((key) => key.value)).toEqual([restWidth, 400])
    expect(rect().width).toBe(restWidth)
    expect(painted(1).width).toBe(400)
  })

  it('edits the rest pose when the property is not armed', () => {
    const id = rect().id
    store().setPlayhead(1, true)
    store().updateNode(id, { fill: '#00ff00' })

    expect(store().document.animation.tracks).toHaveLength(0)
    expect(rect().fill).toBe('#00ff00')
  })

  it('moves the rest pose too when editing on the first frame', () => {
    const id = rect().id
    store().armProperty(id, 'fill')
    store().updateNode(id, { fill: '#123456' })

    expect(keys('fill').map((key) => key.value)).toEqual(['#123456'])
    expect(rect().fill).toBe('#123456')
  })

  it('does not bake an animated channel into the rest pose when a sibling is edited', () => {
    const id = rect().id
    const restWidth = rect().width
    store().armProperty(id, 'width')
    store().setPlayhead(2, true)
    store().updateNode(id, { width: 400 })
    // Mimics a panel that patches several channels from the evaluated pose.
    store().updateNode(id, { width: painted(2).width, fill: '#abcdef' })

    expect(rect().width).toBe(restWidth)
    expect(rect().fill).toBe('#abcdef')
    expect(keys('width').map((key) => key.value)).toEqual([restWidth, 400])
  })

  it('drops the absorbed key when one is dragged onto another', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().setPlayhead(1, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 400, y: rect().transform.position.y },
    })
    const dragged = keys('position.x')[1]
    store().retimeKey(dragged.id, 0)

    expect(keys('position.x')).toHaveLength(1)
    expect(keys('position.x')[0].id).toBe(dragged.id)
    expect(keys('position.x')[0].value).toBe(400)
  })

  it('removes selected keys', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().setPlayhead(1, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 400, y: rect().transform.position.y },
    })
    store().selectKeys([keys('position.x')[1].id])
    store().removeSelectedKeys()

    expect(keys('position.x')).toHaveLength(1)
  })

  it('duplicates selected keys and selects the copies', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    const source = keys('position.x')[0]
    store().selectKeys([source.id])

    store().duplicateSelectedKeys()

    expect(keys('position.x')).toHaveLength(2)
    expect(store().selectedKeyIds).toHaveLength(1)
    expect(store().selectedKeyIds[0]).not.toBe(source.id)
    expect(store().playhead).toBe(0.1)
  })

  it('updates a key value and easing', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    const source = keys('position.x')[0]

    store().updateKey(source.id, { value: 450, easing: 'linear' })

    expect(keys('position.x')[0]).toMatchObject({
      value: 450,
      easing: 'linear',
    })
    expect(rect().transform.position.x).toBe(450)
  })

  it('disarming a property drops its track and restores the rest pose on canvas', () => {
    const id = rect().id
    const restX = rect().transform.position.x
    store().armProperty(id, 'position.x')
    store().setPlayhead(1.5, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 500, y: rect().transform.position.y },
    })
    store().disarmProperty(id, 'position.x')

    expect(store().document.animation.tracks).toHaveLength(0)
    expect(painted(1.5).transform.position.x).toBe(restX)
  })

  it('moves the rest pose too when a transform is dragged on the first frame', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 320, y: rect().transform.position.y },
    })

    expect(keys('position.x').map((key) => key.value)).toEqual([320])
    expect(rect().transform.position.x).toBe(320)
  })

  it('automatically keys path point edits and preserves the Draw path', () => {
    const path = createPath(
      { x: 100, y: 100 },
      createPathPoint({ x: 0, y: 0 }),
    )
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    useEditorStore.setState((state) => ({
      document: { ...state.document, children: [path] },
      selectedIds: [path.id],
    }))
    store().setPlayhead(1.5, true)
    const keyedPoints = path.points.map((point, index) =>
      index === 0
        ? { ...point, anchor: { x: 40, y: 20 } }
        : point,
    )

    store().updateNode(path.id, { points: keyedPoints })

    const track = findTrack(store().document.animation, path.id, 'path.points')
    expect(track?.keys.map((key) => key.time)).toEqual([0, 1.5])
    const rest = findNode(store().document.children, path.id)
    expect(rest?.type === 'path' && rest.points[0].anchor).toEqual({ x: 0, y: 0 })
    const animated = evaluateScene(
      store().document.children,
      store().document.animation,
      1.5,
    )[0]
    expect(animated.type === 'path' && animated.points[0].anchor).toEqual({
      x: 40,
      y: 20,
    })
  })
})

describe('Draw edits feed the first frame', () => {
  const draw = () => useEditorStore.setState({ mode: 'draw', playhead: 0 })

  it('rewrites the t=0 key of a tracked colour', () => {
    const id = rect().id
    store().armProperty(id, 'fill')
    store().setPlayhead(2, true)
    store().updateNode(id, { fill: '#ff0000' })
    draw()
    store().updateNode(id, { fill: '#00ff00' })

    expect(keys('fill').map((key) => [key.time, key.value])).toEqual([
      [0, '#00ff00'],
      [2, '#ff0000'],
    ])
    expect(rect().fill).toBe('#00ff00')
    expect(painted(0).fill).toBe('#00ff00')
  })

  it('rewrites the t=0 key of a tracked transform channel', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().setPlayhead(1, true)
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 500, y: rect().transform.position.y },
    })
    draw()
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 120, y: rect().transform.position.y },
    })

    expect(keys('position.x').map((key) => [key.time, key.value])).toEqual([
      [0, 120],
      [1, 500],
    ])
    expect(rect().transform.position.x).toBe(120)
    expect(painted(0).transform.position.x).toBe(120)
  })

  it('leaves untracked properties without a track', () => {
    const id = rect().id
    draw()
    store().updateNode(id, { fill: '#00ff00' })
    store().editTransform(id, {
      ...rect().transform,
      position: { x: 80, y: rect().transform.position.y },
    })

    expect(store().document.animation.tracks).toHaveLength(0)
    expect(rect().fill).toBe('#00ff00')
    expect(rect().transform.position.x).toBe(80)
  })

  it('does not touch a tracked sibling channel that was not edited', () => {
    const id = rect().id
    const restWidth = rect().width
    store().armProperty(id, 'width')
    store().setPlayhead(2, true)
    store().updateNode(id, { width: 400 })
    draw()
    // Panels patch every channel they render, not just the edited one.
    store().updateNode(id, { width: restWidth, fill: '#abcdef' })

    expect(keys('width').map((key) => [key.time, key.value])).toEqual([
      [0, restWidth],
      [2, 400],
    ])
    expect(rect().fill).toBe('#abcdef')
  })
})

describe('animation preset authoring', () => {
  it('applies a preset at the playhead and extends the document duration', () => {
    const id = rect().id
    const restX = rect().transform.position.x
    store().setPlayhead(2.5, true)

    store().applyAnimationPreset(id, 'slide-in', {
      ...DEFAULT_PRESET_CONFIG,
      duration: 1,
      distance: 80,
      slideDirection: 'left',
    })

    expect(store().document.animation.duration).toBe(3.5)
    expect(keys('position.x').map((key) => [key.time, key.value])).toEqual([
      [2.499, restX],
      [2.5, restX - 80],
      [3.5, restX],
    ])
    expect(rect().transform.position.x).toBe(restX)
  })

  it('replaces conflicting tracks while preserving unrelated tracks', () => {
    const id = rect().id
    store().armProperty(id, 'position.x')
    store().armProperty(id, 'opacity')

    store().applyAnimationPreset(id, 'slide-in', {
      ...DEFAULT_PRESET_CONFIG,
      slideDirection: 'right',
    })

    expect(keys('position.x')).toHaveLength(2)
    expect(findTrack(store().document.animation, id, 'opacity')).toBeDefined()
  })
})

describe('motion path authoring', () => {
  const setupMotionPath = () => {
    const path = createPath({ x: 0, y: 0 }, createPathPoint({ x: 0, y: 0 }))
    path.name = 'Route'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    const follower = createShape('rect')
    follower.name = 'Follower'
    follower.transform.position = { x: 0, y: 0 }
    useEditorStore.setState((state) => ({
      document: {
        ...state.document,
        children: [path, follower],
        animation: { duration: 3, tracks: [] },
      },
      selectedIds: [follower.id],
      playhead: 0,
      mode: 'animate',
    }))
    store().updateNode(follower.id, {
      motionPath: { pathId: path.id, progress: 0, autoRotate: false },
    })
    return { path, follower }
  }

  it('keys progress and keeps Draw edits synchronized with t=0', () => {
    const { follower } = setupMotionPath()
    store().armProperty(follower.id, 'motionPath.progress')
    store().setPlayhead(2, true)
    const binding = findNode(store().document.children, follower.id)?.motionPath
    if (!binding) throw new Error('expected motion path binding')
    store().updateNode(follower.id, {
      motionPath: { ...binding, progress: 1 },
    })

    const progress = () =>
      findTrack(
        store().document.animation,
        follower.id,
        'motionPath.progress',
      )?.keys.map((key) => [key.time, key.value])
    expect(progress()).toEqual([
      [0, 0],
      [2, 1],
    ])
    expect(
      findNode(store().document.children, follower.id)?.motionPath?.progress,
    ).toBe(0)

    useEditorStore.setState({ mode: 'draw', playhead: 0 })
    const drawBinding = findNode(store().document.children, follower.id)?.motionPath
    if (!drawBinding) throw new Error('expected motion path binding')
    store().updateNode(follower.id, {
      motionPath: { ...drawBinding, progress: 0.25 },
    })
    expect(progress()).toEqual([
      [0, 0.25],
      [2, 1],
    ])
  })

  it('clears a binding and its progress track when the target is deleted', () => {
    const { path, follower } = setupMotionPath()
    store().armProperty(follower.id, 'motionPath.progress')

    store().removeNode(path.id)

    expect(findNode(store().document.children, follower.id)?.motionPath).toBeUndefined()
    expect(
      findTrack(store().document.animation, follower.id, 'motionPath.progress'),
    ).toBeUndefined()
  })

  it('remaps a duplicated follower to the duplicated target path', () => {
    const { path, follower } = setupMotionPath()
    store().armProperty(follower.id, 'motionPath.progress')
    useEditorStore.setState({ selectedIds: [path.id, follower.id] })

    store().duplicateSelected()

    const [pathCopyId, followerCopyId] = store().selectedIds
    const pathCopy = findNode(store().document.children, pathCopyId)
    const followerCopy = findNode(store().document.children, followerCopyId)
    expect(pathCopy?.type).toBe('path')
    expect(followerCopy?.motionPath?.pathId).toBe(pathCopyId)
    expect(
      findTrack(
        store().document.animation,
        followerCopyId,
        'motionPath.progress',
      ),
    ).toBeDefined()
  })
})

describe('attaching a motion path', () => {
  const setup = () => {
    const path = createPath({ x: 200, y: 50 }, createPathPoint({ x: 0, y: 0 }))
    path.name = 'Route'
    path.points.push(createPathPoint({ x: 100, y: 0 }))
    const spare = createPath({ x: 0, y: 400 }, createPathPoint({ x: 0, y: 0 }))
    spare.name = 'Spare'
    spare.points.push(createPathPoint({ x: 100, y: 0 }))
    const follower = createShape('rect')
    follower.name = 'Follower'
    follower.transform.position = { x: 300, y: 120 }
    useEditorStore.setState((state) => ({
      document: {
        ...state.document,
        children: [path, spare, follower],
        animation: { duration: 3, tracks: [] },
      },
      selectedIds: [follower.id],
      playhead: 0,
      mode: 'animate',
    }))
    return { path, spare, follower }
  }

  const anchorAt = (id: string, time: number) => {
    const scene = evaluateScene(
      store().document.children,
      store().document.animation,
      time,
    )
    const node = findNode(scene, id)
    if (!node) throw new Error('expected a node')
    return {
      x: node.transform.position.x + node.transform.pivot.x,
      y: node.transform.position.y + node.transform.pivot.y,
    }
  }

  const positionKeys = (id: string, property: AnimatableProperty) =>
    findTrack(store().document.animation, id, property)?.keys.map((key) => [
      key.time,
      key.value,
    ])

  it('drops the follower onto the path instead of adding its old placement', () => {
    const { path, follower } = setup()

    store().setMotionPath(follower.id, path.id)

    // Position is an offset once a path drives placement, so it starts at zero.
    expect(
      findNode(store().document.children, follower.id)?.transform.position,
    ).toEqual({ x: 0, y: 0 })
    expect(anchorAt(follower.id, 0)).toEqual({ x: 200, y: 50 })
  })

  it('rebases an existing position animation to the path', () => {
    const { path, follower } = setup()
    store().armProperty(follower.id, 'position.x')
    store().setPlayhead(2, true)
    store().editTransform(follower.id, {
      ...(findNode(store().document.children, follower.id)?.transform ??
        createShape('rect').transform),
      position: { x: 380, y: 120 },
    })
    store().setPlayhead(0, true)

    store().setMotionPath(follower.id, path.id)

    // The 80px travel survives; only its baseline moves onto the path.
    expect(positionKeys(follower.id, 'position.x')).toEqual([
      [0, 0],
      [2, 80],
    ])
    expect(anchorAt(follower.id, 0)).toEqual({ x: 200, y: 50 })
    expect(anchorAt(follower.id, 2).x).toBe(280)
  })

  it('keeps the offset when the target path is swapped', () => {
    const { path, spare, follower } = setup()
    store().setMotionPath(follower.id, path.id)
    store().editTransform(follower.id, {
      ...(findNode(store().document.children, follower.id)?.transform ??
        createShape('rect').transform),
      position: { x: 10, y: 5 },
    })

    store().setMotionPath(follower.id, spare.id)

    expect(
      findNode(store().document.children, follower.id)?.transform.position,
    ).toEqual({ x: 10, y: 5 })
    expect(anchorAt(follower.id, 0)).toEqual({ x: 10, y: 405 })
  })

  it('leaves the follower where it sits when the path is detached', () => {
    const { path, follower } = setup()
    store().setMotionPath(follower.id, path.id)
    const binding = findNode(store().document.children, follower.id)?.motionPath
    if (!binding) throw new Error('expected motion path binding')
    store().updateNode(follower.id, {
      motionPath: { ...binding, progress: 0.5 },
    })
    const before = anchorAt(follower.id, 0)

    store().setMotionPath(follower.id, null)

    expect(findNode(store().document.children, follower.id)?.motionPath).toBeUndefined()
    expect(anchorAt(follower.id, 0)).toEqual(before)
    expect(before).toEqual({ x: 250, y: 50 })
  })
})
