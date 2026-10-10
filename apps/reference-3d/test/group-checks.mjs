/** Nested scene hierarchy checks; invoked by the isolated Chromium smoke runner. */
export async function runGroupUiChecks(window) {
  return window.webContents.executeJavaScript(`(${async function () {
    const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
    const { createProject, saveProject } = await import('/apps/reference-3d/web/library.ts')
    const { createSceneObject } = await import('/apps/reference-3d/web/model.ts')
    const { importImagePlane } = await import('/apps/reference-3d/web/imageAssets.ts')
    const imported = await importImagePlane(await refFixtures.createImageFile())
    const image = { ...imported.object, position: [-1.1, .2, .2], rotation: [0, .25, 0], scale: [1.1, 1.1, 1.1] }
    const cube = { ...createSceneObject('cube', 'Study box'), position: [-.3, .4, -.5], rotation: [.1, -.3, .05], scale: [.7, .9, .8] }
    const sphere = { ...createSceneObject('sphere', 'Study sphere'), position: [1.2, .3, .2] }
    const created = await createProject('Nested scene folders', 384, 256, false)
    window.refRecord = await saveProject({ ...created, document: { ...created.document, objects: [image, cube, sphere], assets: [imported.asset] } })
    location.hash = '#/reference-3d/' + refRecord.id
    await refWait(() => document.querySelector('.reference3d-stage canvas'), 'folder test scene')
    document.querySelectorAll('.ref-panel-tabs button')[1].click(); await refTick()
    const row = id => document.querySelector('[data-object-id="' + CSS.escape(id) + '"]')
    const select = async (id, additive = false) => {
      const button = row(id)?.querySelector('.ref-scene-select')
      if (!button) throw new Error('Missing scene-tree object ' + id)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: additive, ctrlKey: additive }))
      await refTick()
    }
    const rename = async name => { refSetValue(document.querySelector('[aria-label="Object name"]'), name); await refTick(); await refSave() }
    const editVector = async (label, axis, value) => {
      const vector = [...document.querySelectorAll('.ref-vector')].find(node => node.querySelector('.ref-field-caption')?.textContent === label)
      const field = vector?.querySelectorAll('input')[axis]
      if (!field || field.matches(':disabled')) throw new Error('Unavailable folder transform ' + label)
      refSetValue(field, String(value)); await refTick()
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await refTick()
    }
    const world = (objects, id) => refFixtures.objectWorldMatrix(objects, id)
    const same = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < .00001)
    const subtree = (objects, root) => objects.filter(object => {
      let current = object
      while (current) { if (current.id === root) return true; current = objects.find(candidate => candidate.id === current.parentId) }
      return false
    })
    const originalWorld = new Map([image, cube, sphere].map(object => [object.id, world(refRecord.document.objects, object.id)]))
    refClick('New folder'); await refTick(); await rename('Outer folder')
    const outer = (await refGet()).objects.find(object => object.kind === 'group')
    check(outer && !outer.parentId && outer.scale.every(value => value === 1), 'New folder creates a named root folder with a uniform identity scale')
    await select(image.id); await select(cube.id, true)
    check(document.querySelector('.ref-inspector-scroll').textContent.includes('2 OBJECTS SELECTED'), 'Cmd/Ctrl-click selects multiple scene objects for grouping')
    refClick('Group selection'); await refTick(); await rename('Subjects')
    const subjects = (await refGet()).objects.find(object => object.kind === 'group' && object.id !== outer.id)
    let saved = await refGet()
    check(saved.objects.find(object => object.id === image.id).parentId === subjects.id && saved.objects.find(object => object.id === cube.id).parentId === subjects.id, 'Group selection moves both selected members into the new folder')
    check([image, cube].every(object => same(world(saved.objects, object.id), originalWorld.get(object.id))), 'Grouping preserves every selected object world transform')
    refSetValue(document.querySelector('[aria-label="Move to folder"]'), outer.id); await refTick(); await refSave()
    await select(sphere.id)
    const transfer = new DataTransfer()
    row(sphere.id).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    row(outer.id).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    await refTick()
    row(outer.id).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    await refTick(); await refSave()
    saved = await refGet()
    check(saved.objects.find(object => object.id === sphere.id).parentId === outer.id && same(world(saved.objects, sphere.id), originalWorld.get(sphere.id)), 'Dragging an object onto a folder reparents it without changing its world transform')
    check(saved.objects.find(object => object.id === subjects.id).parentId === outer.id && saved.objects.find(object => object.id === sphere.id).parentId === outer.id, 'Move to folder supports nested folders and ordinary child objects')
    check([image, cube, sphere].every(object => same(world(saved.objects, object.id), originalWorld.get(object.id))), 'Reparenting folders and objects preserves their world transforms')
    refClick('Collapse Outer folder'); await refTick()
    check(!row(subjects.id) && !row(image.id) && (await refGet()).objects.length === 5, 'Collapsing a folder hides its tree descendants without removing scene objects')
    refClick('Expand Outer folder'); await refTick()
    check(Boolean(row(subjects.id) && row(image.id)), 'Expanding a nested folder restores its child rows')
    await select(outer.id)
    await editVector('Position', 0, .4)
    await editVector('Rotation · degrees', 1, 25)
    await editVector('Uniform scale', 0, 1.3)
    await refSave()
    saved = await refGet()
    check(saved.objects.find(object => object.id === outer.id).scale.every(value => value === 1.3) && !same(world(saved.objects, image.id), originalWorld.get(image.id)), 'Folder inspector transforms affect descendants with one uniform scale')

    const outwardWorld = new Map(saved.objects.map(object => [object.id, world(saved.objects, object.id)]))
    const preservesWorld = (objects, ids) => ids.every(id => same(world(objects, id), outwardWorld.get(id)))
    const dragOut = async (id, selector) => {
      await select(id)
      const target = document.querySelector(selector)
      if (!target) throw new Error('Missing outward drop target: ' + selector)
      const dataTransfer = new DataTransfer()
      row(id).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }))
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
      await refTick()
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
      await refTick(); await refSave()
    }
    check(Boolean(document.querySelector('.ref-scene-root[aria-label="Move to scene root"]')), 'The scene tree exposes a permanent target for moving objects to scene root')
    await dragOut(image.id, '.ref-scene-root')
    saved = await refGet()
    check(!saved.objects.find(object => object.id === image.id).parentId && preservesWorld(saved.objects, [image.id]), 'Dropping a nested object on Scene root removes its parent and preserves its world transform')
    refClick('Undo'); await refTick(); await refSave()
    check((await refGet()).objects.find(object => object.id === image.id).parentId === subjects.id, 'Undo restores the object parent after a drop to scene root')
    await dragOut(subjects.id, '.ref-scene-root')
    saved = await refGet()
    check(!saved.objects.find(object => object.id === subjects.id).parentId && saved.objects.find(object => object.id === image.id).parentId === subjects.id && preservesWorld(saved.objects, [subjects.id, image.id, cube.id]), 'Dropping a nested folder on Scene root preserves its subtree and every world transform')
    refClick('Undo'); await refTick(); await refSave()
    await dragOut(sphere.id, '.ref-scene-tree')
    saved = await refGet()
    check(!saved.objects.find(object => object.id === sphere.id).parentId && preservesWorld(saved.objects, [sphere.id]), 'Dropping on empty scene-tree space also moves an object to scene root')
    refClick('Undo'); await refTick(); await refSave()
    await select(image.id)
    refClick('Move ' + image.name + ' out of folder'); await refTick(); await refSave()
    saved = await refGet()
    check(saved.objects.find(object => object.id === image.id).parentId === outer.id && preservesWorld(saved.objects, [image.id]), 'The row Move out action moves a nested object up exactly one folder level')
    refClick('Undo'); await refTick(); await refSave()
    await select(subjects.id)
    refClick('Move out of folder'); await refTick(); await refSave()
    saved = await refGet()
    check(!saved.objects.find(object => object.id === subjects.id).parentId && saved.objects.find(object => object.id === image.id).parentId === subjects.id && preservesWorld(saved.objects, [subjects.id, image.id, cube.id]), 'The inspector Move out action moves a folder out while preserving its children and world transforms')
    refClick('Undo'); await refTick(); await refSave()
    await select(subjects.id)
    refSetValue(document.querySelector('[aria-label="Move to folder"]'), ''); await refTick(); await refSave()
    saved = await refGet()
    check(!saved.objects.find(object => object.id === subjects.id).parentId && preservesWorld(saved.objects, [subjects.id, image.id, cube.id]), 'Choosing Scene root in the folder dropdown explicitly moves a nested folder out')
    refClick('Undo'); await refTick(); await refSave()
    check((await refGet()).objects.find(object => object.id === subjects.id).parentId === outer.id && (await refGet()).objects.find(object => object.id === image.id).parentId === subjects.id, 'Undo restores the complete nested hierarchy after outward moves')

    // Large parents produce small precise local values. Merely blurring their rounded fields must be a no-op.
    await select(sphere.id)
    refSetValue(document.querySelector('[aria-label="Move to folder"]'), ''); await refTick(); await refSave()
    for (let axis = 0; axis < 3; axis++) await editVector('Scale', axis, 1.111104)
    await refSave()
    await select(outer.id); await editVector('Uniform scale', 0, 90); await refSave()
    await select(sphere.id)
    refSetValue(document.querySelector('[aria-label="Move to folder"]'), subjects.id); await refTick(); await refSave()
    const precise = (await refGet()).objects.find(object => object.id === sphere.id)
    check(precise.scale.every(value => Math.abs(value - .0123456) < .000000001), 'Reparenting beneath a large folder retains legal small local scales')
    for (const label of ['Position', 'Scale']) {
      const vector = [...document.querySelectorAll('.ref-vector')].find(node => node.querySelector('.ref-field-caption')?.textContent === label)
      for (const field of vector.querySelectorAll('input')) {
        field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
        field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await refTick()
      }
    }
    await refSave()
    const unchanged = (await refGet()).objects.find(object => object.id === sphere.id)
    check(JSON.stringify(unchanged.position) === JSON.stringify(precise.position) && JSON.stringify(unchanged.scale) === JSON.stringify(precise.scale), 'Focusing and blurring transform fields preserves precise reparented coordinates and scales')
    refSetValue(document.querySelector('[aria-label="Move to folder"]'), ''); await refTick(); await refSave()
    await select(outer.id); await editVector('Uniform scale', 0, 1.3); await refSave()
    await select(sphere.id)
    refSetValue(document.querySelector('[aria-label="Move to folder"]'), outer.id); await refTick(); await refSave()
    await select(outer.id)

    refClick('Lock Outer folder'); await refTick(); await refSave()
    await select(image.id)
    const disabledTransform = document.querySelector('.ref-vector input')
    check(disabledTransform?.matches(':disabled') && document.querySelector('[aria-label="Move to folder"]').disabled && document.querySelector('[aria-label="Delete selected object"]').disabled, 'A locked ancestor disables child transforms, reparenting, and deletion')
    check(document.querySelector('[aria-label="Move ' + image.name + ' out of folder"]').disabled && [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Move out of folder').disabled, 'Move out controls respect an inherited folder lock')
    check(!(await refGet()).objects.find(object => object.id === image.id).locked, 'Inherited locking preserves the child own lock preference')
    refClick('Unlock Outer folder'); await refTick(); await refSave()
    refClick('Lock ' + image.name); await refTick(); await refSave()
    await select(outer.id)
    check(document.querySelector('.ref-vector input')?.matches(':disabled') && document.querySelector('[aria-label="Delete folder and contents"]').disabled && [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Ungroup folder').disabled, 'A locked descendant protects its parent folder from transform, delete, and ungroup operations')
    refClick('Unlock ' + image.name); await refTick(); await refSave()
    const beforeDuplicate = await refGet(), sourceWorld = world(beforeDuplicate.objects, image.id)
    refClick('Duplicate'); await refTick(); await refSave()
    saved = await refGet()
    const originalIds = new Set(beforeDuplicate.objects.map(object => object.id))
    const copied = saved.objects.filter(object => !originalIds.has(object.id))
    const copyRoot = copied.find(object => object.kind === 'group' && !object.parentId)
    const copyImage = copied.find(object => object.kind === 'image')
    check(copied.length === 5 && copyRoot && subtree(saved.objects, copyRoot.id).length === 5 && copyImage.assetId === image.assetId && saved.assets.length === 1, 'Duplicating a folder copies the full nested subtree while sharing embedded image assets')
    await editVector('Position', 0, 3.2); await refSave()
    saved = await refGet()
    check(same(world(saved.objects, image.id), sourceWorld) && !same(world(saved.objects, copyImage.id), sourceWorld), 'Editing a duplicated folder moves only its copied descendants')
    refClick('Delete folder and contents'); await refTick(); await refSave()
    saved = await refGet()
    check(saved.objects.length === 5 && copied.every(object => !saved.objects.some(current => current.id === object.id)) && saved.assets.length === 1, 'Deleting a folder removes all descendants without removing the source shared asset')
    refClick('Undo'); await refTick(); await refSave()
    check((await refGet()).objects.length === 10 && (await refGet()).objects.some(object => object.id === copyImage.id), 'Undo restores a deleted folder with its complete nested contents')
    refClick('Redo'); await refTick(); await refSave()
    await select(subjects.id)
    const beforeUngroup = await refGet()
    refClick('Ungroup folder'); await refTick(); await refSave()
    saved = await refGet()
    check(!saved.objects.some(object => object.id === subjects.id) && [image, cube].every(object => saved.objects.find(current => current.id === object.id).parentId === outer.id), 'Ungroup removes the folder and moves its direct children into the containing folder')
    check([image, cube].every(object => same(world(saved.objects, object.id), world(beforeUngroup.objects, object.id))), 'Ungroup preserves child world transforms beneath a rotated and scaled parent')
    refClick('Undo'); await refTick(); await refSave()
    check((await refGet()).objects.find(object => object.id === image.id).parentId === subjects.id, 'Undo restores the original nested folder membership')
    refClick('Back to scenes'); await refWait(() => document.querySelector('.ref-home'), 'folder project gallery')
    location.hash = '#/reference-3d/' + refRecord.id
    await refWait(() => document.querySelector('.reference3d-stage canvas'), 'reopened folder scene')
    document.querySelectorAll('.ref-panel-tabs button')[1].click(); await refTick()
    saved = await refGet()
    check(saved.objects.length === 5 && saved.objects.find(object => object.id === subjects.id).parentId === outer.id && saved.objects.find(object => object.id === image.id).parentId === subjects.id && saved.objects.find(object => object.id === outer.id).scale.every(value => value === 1.3), 'Reopening restores nested folder membership and parent transforms')
    await select(outer.id); refClick('Frame selected (F)'); await refTick()
    return results
  }.toString()})()`)
}

export async function runGroupRenderChecks(window) {
  return window.webContents.executeJavaScript(`(${async function () {
    const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
    const { createSceneDocument, createSceneObject } = await import('/apps/reference-3d/web/model.ts')
    const { importImagePlane } = await import('/apps/reference-3d/web/imageAssets.ts')
    const { asset, object: image } = await importImagePlane(await refFixtures.createImageFile())
    const outer = createSceneObject('group', 'Outer folder')
    const inner = createSceneObject('group', 'Inner folder')
    outer.position = [0, .5, 0]
    inner.parentId = outer.id; inner.position = [0, -.5, 0]
    image.parentId = inner.id
    const doc = {
      ...createSceneDocument('Hierarchy pixels', 384, 256, false),
      assets: [asset], objects: [outer, inner, image], transparent: true,
      floor: { visible: false, grid: false, color: '#ffffff' },
      camera: { position: [0, .5, 4], target: [0, .5, 0], projection: 'orthographic', fov: 40, orthoSize: 2, roll: 0 },
    }
    const stage = refFixtures.mountStage(doc)
    const render = async document => {
      stage.update({ document, mode: 'camera', selectedId: null, selectedBone: null })
      await refTick()
      let png
      await refWait(async () => {
        try { png = await stage.handle.exportPng(); return true }
        catch (error) { if (error.message.includes('finish loading')) return false; throw error }
      }, 'nested image-plane render')
      const image = await refFixtures.pngPixels(png)
      let left = image.width, top = image.height, right = -1, bottom = -1, opaque = 0
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (image.pixels[(y * image.width + x) * 4 + 3] < 200) continue
        opaque++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
      return { ...image, png, left, top, width: right - left + 1, height: bottom - top + 1, opaque }
    }
    const withOuter = patch => ({ ...doc, objects: [{ ...outer, ...patch }, inner, image] })
    try {
      const original = await render(doc)
      check(original.opaque > 20_000 && Math.abs(original.width / original.height - 2) < .03, 'A nested image asset renders through both parent folders')
      const moved = await render(withOuter({ position: [.25, .5, 0] }))
      check(Math.abs(moved.left - original.left - 32) <= 1 && moved.width === original.width, 'Moving a parent folder moves its nested child by the correct world distance')
      const rotated = await render(withOuter({ rotation: [0, 0, Math.PI / 2] }))
      check(Math.abs(rotated.width - original.height) <= 2 && Math.abs(rotated.height - original.width) <= 2, 'Rotating a parent folder rotates the entire nested image in the camera render')
      const scaled = await render(withOuter({ scale: [.5, .5, .5] }))
      check(Math.abs(scaled.width / original.width - .5) < .02 && Math.abs(scaled.height / original.height - .5) < .02, 'Uniform parent-folder scale propagates through nested children')
      const hiddenOuter = await render(withOuter({ visible: false }))
      check(hiddenOuter.opaque === 0, 'A hidden outer folder excludes all of its nested descendants from export')
      const hiddenInner = await render({ ...doc, objects: [outer, { ...inner, visible: false }, image] })
      check(hiddenInner.opaque === 0, 'A hidden nested folder excludes its independently visible child from export')
      await render(doc)
      stage.update({ selectedId: outer.id }); await refTick()
      stage.handle.frameSelected(); await refTick()
      check(await stage.handle.exportPng() === original.png, 'Framing a folder uses its descendant bounds while preserving the saved camera render')
      check(stage.errors.length === 0 && stage.commits.length === 0, 'Hierarchy rendering and camera framing introduce no object edits or graphics errors')
      const farImage = { ...image, id: 'hidden-far-image', position: [12, -10, 0] }
      await render({ ...doc, objects: [...doc.objects, farImage] })
      await render({ ...doc, objects: [...doc.objects, { ...farImage, visible: false }] })
      stage.update({ selectedId: outer.id }); await refTick()
      stage.handle.frameSelected(); await refTick()
      const framed = stage.handle.captureCamera()
      check(Math.abs(framed.target[0]) < .001 && Math.abs(framed.target[1] - .5) < .001 && Math.abs(framed.target[2]) < .001, 'Framing a folder ignores hidden descendants far outside the visible scene')
      stage.handle.placeOnFloor(); await refTick()
      const placed = stage.commits.at(-1)
      check(placed?.id === outer.id && Math.abs(placed.patch.position[1] - .5) < .001, 'Placing a folder on the floor ignores hidden descendants below the ground')
    } finally { stage.destroy() }
    return results
  }.toString()})()`)
}
