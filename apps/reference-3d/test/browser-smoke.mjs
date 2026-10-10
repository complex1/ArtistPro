/** Real Chromium WebGL pixels, editor controls, GLB skeletons, and IndexedDB persistence. */
import { app, BrowserWindow } from 'electron'
import { createServer } from 'vite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGroupRenderChecks, runGroupUiChecks } from './group-checks.mjs'
import { runShortcutChecks } from './shortcut-checks.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
app.on('window-all-closed', () => {})

async function run() {
  const profile = await mkdtemp(path.join(tmpdir(), 'reference-3d-test-'))
  app.setPath('userData', profile)
  await app.whenReady()
  const watchdog = setTimeout(() => { console.error('3D Reference browser checks timed out.'); app.exit(1) }, 120_000)
  let server, window, exitCode = 0
  try {
    server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false }, logLevel: 'error' })
    await server.listen()
    window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { backgroundThrottling: false } })
    await window.loadURL(server.resolvedUrls.local[0])
    const evaluate = code => window.webContents.executeJavaScript(code)
    const results = []
    console.log('Checking scene creation, pose editing, and persistence…')
    results.push(...await evaluate(`(${async function () {
      const library = await import('/apps/reference-3d/web/library.ts')
      const model = await import('/apps/reference-3d/web/model.ts')
      const fixtures = await import('/apps/reference-3d/test/browser-fixtures.mjs')
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      window.refWait = async (condition, label) => {
        for (let attempt = 0; attempt < 400; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 25))
          if (await condition()) return
        }
        throw new Error('Timed out: ' + label + '; ' + document.body.textContent.slice(-1400))
      }
      window.refClick = (text, selector = 'button') => {
        const control = [...document.querySelectorAll(selector)].find(node => node.textContent.trim() === text || node.getAttribute('aria-label') === text || node.title === text)
        if (!control || control.disabled) throw new Error('Missing or disabled control: ' + text)
        control.click()
      }
      window.refSetValue = (node, value) => {
        if (!node) throw new Error('Missing input')
        const type = node instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
        Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(node, value)
        node.dispatchEvent(new Event(type === HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
      }
      window.refLibrary = library; window.refModel = model; window.refFixtures = fixtures
      window.refRecord = await library.createProject('Browser scene', 384, 256)
      window.refGet = async () => (await library.getProject(refRecord.id)).document
      window.refSave = async () => { refClick('Save scene'); await refWait(() => document.querySelector('.ref-save-state.saved'), 'scene saved') }
      window.refTick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      location.hash = '#/reference-3d/' + refRecord.id
      await refWait(() => document.querySelector('.reference3d-stage canvas'), 'WebGL editor')
      await refTick()
      const viewport = document.querySelector('.reference3d-stage canvas')
      check(viewport.width > 200 && viewport.height > 200 && !document.querySelector('.ref-studio-error'), 'The scene editor creates a usable WebGL viewport')
      check(document.querySelectorAll('.ref-asset-card').length === 6 && document.querySelectorAll('.ref-pose-card').length >= 10, 'Built-in objects and pose presets are available in the workspace')
      refClick('Wave', '.ref-pose-card'); await refTick(); await refSave()
      const wave = model.POSE_PRESETS.find(preset => preset.id === 'wave').pose
      check(JSON.stringify((await refGet()).objects[0].pose) === JSON.stringify(wave), 'Applying a pose persists exact joint rotations to IndexedDB')
      refClick('Undo'); await refTick(); await refSave()
      check(Object.keys((await refGet()).objects[0].pose).length === 0, 'Undo restores the figure before the preset')
      refClick('Redo'); await refTick(); await refSave()
      check(JSON.stringify((await refGet()).objects[0].pose) === JSON.stringify(wave), 'Redo restores the complete pose')

      // Hold a real write transaction: B queues behind it, then Undo returns to saved A.
      // A must be saved again after B commits even though it matched the last saved snapshot.
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('artist-studio-reference-3d', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      let release = false
      const blocking = database.transaction('projects', 'readwrite')
      const completed = new Promise((resolve, reject) => {
        blocking.oncomplete = resolve
        blocking.onerror = () => reject(blocking.error)
        blocking.onabort = () => reject(blocking.error ?? new Error('Blocking test transaction aborted'))
      })
      const keepAlive = () => {
        const request = blocking.objectStore('projects').get(refRecord.id)
        request.onsuccess = () => { if (!release) keepAlive() }
      }
      keepAlive()
      try {
        refClick('Standing', '.ref-pose-card')
        await refWait(() => document.querySelector('.ref-save-state.saving'), 'autosave queued behind the held transaction')
        refClick('Undo'); await refTick()
        check(Boolean(document.querySelector('.ref-save-state.unsaved')), 'Undo remains available while an autosave write is pending')
      } finally {
        release = true
        await completed
        database.close()
      }
      await refWait(() => document.querySelector('.ref-save-state.saved'), 'undone pose automatically resaved after the pending write')
      check(JSON.stringify((await refGet()).objects[0].pose) === JSON.stringify(wave), 'Undo during a pending autosave persists the restored pose after both writes finish')

      refClick('Duplicate'); await refTick()
      refClick('Running', '.ref-pose-card'); await refTick(); await refSave()
      const duplicated = await refGet()
      check(duplicated.objects.length === 2 && duplicated.objects[0].id !== duplicated.objects[1].id && JSON.stringify(duplicated.objects[0].pose) === JSON.stringify(wave) && JSON.stringify(duplicated.objects[1].pose) !== JSON.stringify(wave), 'Duplicated figures have independent editable poses')
      refClick('Back to scenes'); await refWait(() => document.querySelector('.ref-home'), 'scene gallery')
      await refWait(() => document.querySelector('.ref-project strong'), 'loaded gallery project')
      check(document.querySelector('.ref-project strong')?.textContent === 'Browser scene', 'The scene appears in its local project gallery')
      location.hash = '#/reference-3d/' + refRecord.id
      await refWait(() => document.querySelector('.reference3d-stage canvas'), 'reopened scene')
      check((await refGet()).objects.length === 2 && document.querySelector('.ref-left-footer').textContent.includes('384 × 256'), 'Reopening preserves scene objects and reference dimensions')
      return results
    }.toString()})()`))
    await writeFile('/tmp/reference3d-smoke.png', (await window.webContents.capturePage()).toPNG())

    console.log('Checking GLB import, skeleton posing, and embedded project assets…')
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      for (const skinned of [false, true]) {
        const file = await refFixtures.createModelFile(skinned)
        const transfer = new DataTransfer(); transfer.items.add(file)
        const input = document.querySelector('.ref-studio input[type=file][accept=".glb"]')
        input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
        await refWait(() => document.querySelector('#ref-import-title'), 'GLB import preview')
        check(document.querySelector('.ref-import-info strong').textContent.includes(skinned ? '2 bones' : 'Static model'), skinned ? 'A generated skinned GLB exposes its two-bone skeleton' : 'A generated static GLB is recognized as a prop')
        refClick('Add to scene'); await refTick(); await refSave()
      }
      refClick('Pose', '.ref-modes button'); await refTick()
      const joint = document.querySelector('[aria-label="Selected joint"]')
      refSetValue(joint, [...joint.options].find(option => option.textContent.includes('Tip')).value)
      await refTick()
      const rotation = [...document.querySelectorAll('.ref-vector')].find(node => node.textContent.includes('Joint rotation')).querySelector('input')
      rotation.focus(); refSetValue(rotation, '35'); await refTick()
      // Hidden Electron windows may not acquire native focus; dispatch the same bubbling blur event.
      rotation.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await refTick(); await refSave()
      const saved = await refGet(), imported = saved.objects.at(-1), bone = Object.keys(imported.pose)[0]
      check(saved.assets.length === 2 && saved.assets.every(asset => asset.dataUrl.startsWith('data:model/gltf-binary;base64,')), 'GLB geometry and skeletons are embedded in the saved project')
      check(bone?.endsWith(':Tip') && Math.abs(imported.pose[bone][0] - 35 * Math.PI / 180) < .0001, 'The imported bone rotation inspector persists its pose in radians')
      refClick('Back to scenes'); await refWait(() => document.querySelector('.ref-home'), 'gallery after GLB save')
      location.hash = '#/reference-3d/' + refRecord.id
      await refWait(() => document.querySelector('.reference3d-stage canvas'), 'reload imported geometry')
      await refTick()
      check((await refGet()).assets[1].bones.length === 2 && (await refGet()).objects.length === 4, 'Reopening retains both imported assets and their skeleton metadata')
      return results
    }.toString()})()`))

    console.log('Checking image-plane import, transforms, duplication, and persistence…')
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      check([...document.querySelectorAll('button')].some(button => button.textContent.includes('Import image as plane')), 'The asset library offers image-plane import')
      const transfer = new DataTransfer(); transfer.items.add(await refFixtures.createImageFile())
      const input = document.querySelector('.ref-studio input[type=file][accept*="image/png"]')
      if (!input) throw new Error('Missing image-plane file input')
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
      await refWait(() => document.querySelector('#ref-import-title'), 'image-plane import preview')
      check(/96\s*×\s*48/.test(document.querySelector('[aria-labelledby="ref-import-title"]').textContent), 'The image import preview shows its original non-square dimensions')
      refClick('Add to scene'); await refTick(); await refSave()
      refClick('Lay flat'); await refTick(); await refSave()
      const flat = (await refGet()).objects.find(object => object.kind === 'image')
      check(Math.abs(flat.rotation[0] + Math.PI / 2) < .0001 && flat.position[1] >= .01, 'Lay flat rotates an image onto the ground without floor overlap')
      refClick('Stand upright'); await refTick(); await refSave()
      check((await refGet()).objects.find(object => object.kind === 'image').rotation.every(value => value === 0), 'Stand upright restores the image plane orientation')
      const editVector = async (label, axis, value) => {
        const vector = [...document.querySelectorAll('.ref-vector')].find(node => node.querySelector('.ref-field-caption')?.textContent === label)
        const field = vector?.querySelectorAll('input')[axis]
        if (!field) throw new Error('Missing image transform ' + label)
        refSetValue(field, String(value)); await refTick()
        field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await refTick()
      }
      await editVector('Position', 0, -1.25)
      await editVector('Rotation · degrees', 1, 30)
      await editVector('Scale', 0, 1.2)
      await editVector('Scale', 1, 2)
      refClick('Restore image proportions'); await refTick()
      await refSave()
      const original = (await refGet()).objects.find(object => object.kind === 'image')
      const imageAsset = (await refGet()).assets.find(asset => asset.id === original.assetId)
      check(original.position[0] === -1.25 && Math.abs(original.rotation[1] - Math.PI / 6) < .0001 && original.scale[0] === 1.2, 'Image planes use the same editable position, rotation, and scale controls as scene objects')
      check(original.scale.every(value => value === 1.2), 'Restore image proportions removes stretching while preserving image size')
      check(imageAsset.image.width === 96 && imageAsset.image.height === 48 && imageAsset.dataUrl.startsWith('data:image/png;base64,') && imageAsset.bones.length === 0, 'The image pixels and original dimensions are embedded in the scene project')
      refClick('Duplicate'); await refTick()
      await editVector('Position', 0, 1.25)
      await editVector('Rotation · degrees', 1, -30)
      await editVector('Scale', 0, .75)
      await refSave()
      const saved = await refGet(), images = saved.objects.filter(object => object.kind === 'image')
      check(images.length === 2 && images[0].id !== images[1].id && images[0].assetId === images[1].assetId && saved.assets.filter(asset => asset.image).length === 1, 'Duplicating an image plane shares its embedded image without copying the asset data')
      check(images[0].position[0] === -1.25 && images[1].position[0] === 1.25 && images[0].scale[0] === 1.2 && images[1].scale[0] === .75 && images[0].rotation[1] > 0 && images[1].rotation[1] < 0, 'Duplicate image planes keep independent transforms')
      refClick('Back to scenes'); await refWait(() => document.querySelector('.ref-home'), 'gallery after image save')
      location.hash = '#/reference-3d/' + refRecord.id
      await refWait(() => document.querySelector('.reference3d-stage canvas'), 'reopened image-plane scene')
      const reopened = await refGet()
      check(reopened.objects.filter(object => object.kind === 'image').length === 2 && reopened.assets.find(asset => asset.image)?.dataUrl === imageAsset.dataUrl, 'Reopening restores both image planes from the embedded PNG')
      const { importImagePlane } = await import('/apps/reference-3d/web/imageAssets.ts')
      for (const type of ['image/jpeg', 'image/webp']) {
        const imported = await importImagePlane(await refFixtures.createImageFile(type))
        check(imported.asset.image.width === 96 && imported.asset.image.height === 48 && imported.asset.dataUrl.startsWith('data:image/png;base64,'), type === 'image/jpeg' ? 'JPEG imports decode into an embedded PNG with preserved dimensions' : 'WebP imports decode into an embedded PNG with preserved dimensions')
      }
      document.querySelectorAll('.ref-panel-tabs button')[1].click(); await refTick()
      ;[...document.querySelectorAll('.ref-scene-select')].find(button => button.textContent.trim() === original.name).click(); await refTick()
      refSetValue(document.querySelector('[aria-label="Viewport angle"]'), 'front'); await refTick()
      refClick('Frame selected (F)'); await refTick()
      return results
    }.toString()})()`))
    await writeFile('/tmp/reference3d-image-plane.png', (await window.webContents.capturePage()).toPNG())

    console.log('Checking real camera renders, alpha, and helper-free export…')
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      const doc = refModel.createSceneDocument('Render checks', 384, 256)
      doc.objects[0].pose = structuredClone(refModel.POSE_PRESETS.find(pose => pose.id === 'wave').pose)
      doc.floor.visible = false; doc.transparent = true
      window.refStageDoc = doc
      window.refTestStage = refFixtures.mountStage(doc)
      await refWait(() => refTestStage.handle && document.querySelector('#reference-test-stage canvas'), 'isolated stage')
      await refTick()
      window.refBaselinePng = await refTestStage.handle.exportPng()
      const { width, height, pixels } = await refFixtures.pngPixels(refBaselinePng)
      let visible = 0, transparent = 0, colored = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i+3] > 200) visible++
        if (pixels[i+3] === 0) transparent++
        if (pixels[i+3] > 200 && Math.max(pixels[i], pixels[i+1], pixels[i+2]) - Math.min(pixels[i], pixels[i+1], pixels[i+2]) > 15) colored++
      }
      check(width === 384 && height === 256, 'PNG export uses the saved non-square output dimensions')
      check(visible > 800 && colored > 300 && transparent > width * height * .7, 'Rendered PNG contains a shaded figure with a clean transparent background')
      check(pixels[3] === 0 && pixels.at(-1) === 0, 'Transparent PNG corners contain neither background nor camera-inset pixels')
      refTestStage.update({ selectedId: null, selectedBone: null, mode: 'camera' }); await refTick()
      check(await refTestStage.handle.exportPng() === refBaselinePng, 'Selection outlines, posing markers, grid, and camera preview are excluded from export')
      const shotBefore = JSON.stringify(doc.camera)
      refTestStage.update({ selectedId: doc.objects[0].id, mode: 'camera' }); await refTick()
      refTestStage.handle.frameSelected(); refTestStage.handle.setView('side'); await refTick()
      check(JSON.stringify(doc.camera) === shotBefore && await refTestStage.handle.exportPng() === refBaselinePng, 'Framing a selection and changing editor angle preserve the saved shot and exported pixels')
      window.refCameraBeforeOrbit = JSON.stringify(refTestStage.handle.captureCamera())
      window.refShotBeforeOrbit = shotBefore
      return results
    }.toString()})()`))

    const bounds = await evaluate(`(() => { const r = document.querySelector('#reference-test-stage canvas').getBoundingClientRect(); return { x: Math.round(r.left + r.width * .2), y: Math.round(r.top + r.height * .3) } })()`)
    window.webContents.sendInputEvent({ type: 'mouseDown', ...bounds, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 8; i++) window.webContents.sendInputEvent({ type: 'mouseMove', x: bounds.x + i * 14, y: bounds.y + i * 4, button: 'left' })
    window.webContents.sendInputEvent({ type: 'mouseUp', x: bounds.x + 112, y: bounds.y + 32, button: 'left', clickCount: 1 })
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      await refTick()
      check(JSON.stringify(refTestStage.handle.captureCamera()) !== refCameraBeforeOrbit, 'Real pointer dragging orbits the editor camera')
      check(JSON.stringify(refStageDoc.camera) === refShotBeforeOrbit && await refTestStage.handle.exportPng() === refBaselinePng, 'Orbiting leaves the saved shot and camera render unchanged')
      check(refTestStage.errors.length === 0 && refTestStage.commits.length === 0, 'Camera navigation makes no object edits or WebGL errors')
      const saved = await refGet()
      for (const imported of saved.objects.filter(object => object.kind === 'imported')) {
        const doc = { ...refStageDoc, assets: saved.assets, objects: [structuredClone(imported)] }
        refTestStage.update({ document: doc, selectedId: imported.id, selectedBone: null, mode: 'camera' })
        let rendered
        await refWait(async () => {
          try { rendered = await refTestStage.handle.exportPng(); return true }
          catch (error) { if (error.message.includes('finish loading')) return false; throw error }
        }, 'embedded imported model render')
        const image = await refFixtures.pngPixels(rendered)
        let visible = 0
        for (let i = 3; i < image.pixels.length; i += 4) if (image.pixels[i] > 200) visible++
        check(visible > 500, imported.pose && Object.keys(imported.pose).length ? 'The reopened embedded skinned GLB produces real rendered geometry' : 'The reopened embedded static GLB produces real rendered geometry')
        if (Object.keys(imported.pose).length) {
          refTestStage.update({ document: { ...doc, objects: [{ ...doc.objects[0], pose: {} }] } })
          await refTick()
          check(await refTestStage.handle.exportPng() !== rendered, 'Restoring an imported bone changes the skinned model pixels')
        }
      }

      const storedImage = saved.objects.find(object => object.kind === 'image')
      const imageObject = { ...structuredClone(storedImage), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      const imageDoc = { ...refStageDoc, assets: saved.assets, objects: [imageObject], camera: { position: [0, .5, 4], target: [0, .5, 0], projection: 'orthographic', fov: 40, orthoSize: 2, roll: 0 } }
      const renderImage = async doc => {
        refTestStage.update({ document: doc, selectedId: null, selectedBone: null, mode: 'camera' })
        await refTick()
        let png
        await refWait(async () => {
          try { png = await refTestStage.handle.exportPng(); return true }
          catch (error) { if (error.message.includes('finish loading')) return false; throw error }
        }, 'image-plane render')
        return { png, ...await refFixtures.pngPixels(png) }
      }
      const imageBounds = image => {
        let left = image.width, top = image.height, right = -1, bottom = -1
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (image.pixels[(y * image.width + x) * 4 + 3] < 200) continue
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
        }
        return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 }
      }
      const sample = (image, x, y) => [...image.pixels.slice((Math.round(y) * image.width + Math.round(x)) * 4, (Math.round(y) * image.width + Math.round(x)) * 4 + 4)]
      const colorImage = await renderImage(imageDoc), box = imageBounds(colorImage)
      const centerY = (box.top + box.bottom) / 2
      const red = sample(colorImage, box.left + box.width * .2, centerY)
      const blue = sample(colorImage, box.left + box.width * .8, centerY)
      check(box.width > 100 && box.height > 50 && Math.abs(box.width / box.height - 2) < .05, 'Rendered image planes preserve the original two-to-one aspect ratio')
      check(red[0] > 220 && red[1] < 75 && red[2] < 60 && blue[2] > 220 && blue[0] < 60 && blue[3] === 255, 'Image-plane PNG export preserves source image colors')
      check(sample(colorImage, (box.left + box.right) / 2, centerY)[3] === 0 && sample(colorImage, 0, 0)[3] === 0, 'Image transparency cuts through the plane instead of drawing an opaque rectangle')
      const semi = sample(colorImage, box.left + box.width * .16, box.top + box.height * .16)
      check(Math.abs(semi[3] - 128) <= 3 && Math.abs(semi[0] - 240) <= 4 && Math.abs(semi[1] - 48) <= 4 && Math.abs(semi[2] - 32) <= 4, 'Semi-transparent image pixels preserve straight-alpha PNG colors: ' + semi.join(','))
      for (const displayStyle of ['materials', 'silhouette']) {
        check((await renderImage({ ...imageDoc, displayStyle })).png === colorImage.png, displayStyle === 'materials' ? 'Material display preserves the image texture and transparency' : 'Silhouette display preserves reference-image colors and transparency')
      }
      check((await renderImage({ ...imageDoc, light: { ...imageDoc.light, intensity: 0, ambient: 0 } })).png === colorImage.png, 'Image planes remain readable with scene lighting turned off')
      const reverse = await renderImage({ ...imageDoc, camera: { ...imageDoc.camera, position: [0, .5, -4] } })
      const reverseBox = imageBounds(reverse)
      check(reverseBox.width === box.width && reverseBox.height === box.height && sample(reverse, reverseBox.left + reverseBox.width * .2, centerY)[2] > 220, 'The image plane remains textured when viewed from its reverse side')
      const moved = await renderImage({ ...imageDoc, objects: [{ ...imageObject, position: [.375, 0, 0] }] })
      check(imageBounds(moved).left > box.left + 30 && imageBounds(moved).width === box.width, 'Moving an image plane changes its camera composition without changing its size')
      const scaled = await renderImage({ ...imageDoc, objects: [{ ...imageObject, scale: [.5, .5, .5] }] })
      check(Math.abs(imageBounds(scaled).width / box.width - .5) < .03 && Math.abs(imageBounds(scaled).height / box.height - .5) < .03, 'Scaling an image plane changes its rendered bounds proportionally')
      const hidden = await renderImage({ ...imageDoc, objects: [{ ...imageObject, visible: false }] })
      check(!hidden.pixels.some((value, index) => index % 4 === 3 && value > 0), 'Hidden image planes are omitted from camera exports')
      refTestStage.destroy()
      return results
    }.toString()})()`))

    console.log('Checking the output dialog and Drawing Canvas handoff…')
    results.push(...await evaluate(`(${async function () {
      const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      const originalClick = HTMLAnchorElement.prototype.click
      let exported = null
      HTMLAnchorElement.prototype.click = function () { exported = { href: this.href, download: this.download } }
      try {
        refClick('Use as reference'); await refWait(() => document.querySelector('#ref-output-title'), 'output dialog')
        refClick('Export PNG'); await refWait(() => exported, 'PNG download')
        const rendered = await refFixtures.pngPixels(exported.href)
        check(exported.download.endsWith('.png') && rendered.width === 384 && rendered.height === 256, 'The export dialog downloads a PNG at the selected scene size')
      } finally { HTMLAnchorElement.prototype.click = originalClick }
      await refWait(() => !document.querySelector('#ref-output-title'), 'export closes')
      refClick('Use as reference'); await refWait(() => document.querySelector('#ref-output-title'), 'handoff dialog')
      refClick('Open in Drawing Canvas')
      await refWait(() => location.hash.startsWith('#/drawing-canvas/'), 'Drawing Canvas route')
      const id = decodeURIComponent(location.hash.split('/').at(-1))
      const { getProject } = await import('/apps/drawing-canvas/web/library.ts')
      const saved = (await getProject(id)).document
      check(saved.width === 384 && saved.height === 256 && saved.layers.length === 2, 'Drawing Canvas receives a saved project at the camera render dimensions')
      check(saved.layers[0].locked && saved.layers[0].opacity === .5 && saved.layers[0].dataUrl.startsWith('data:image/png;base64,'), 'The bottom reference image is locked with 50% opacity')
      check(saved.activeLayerId === saved.layers[1].id && !saved.layers[1].locked && saved.layers[1].dataUrl === null, 'A blank editable drawing layer is active above the reference')
      check(!saved.name.includes('reference reference'), 'The transferred drawing has one reference suffix')
      return results
    }.toString()})()`))

    console.log('Checking nested folder editing, persistence, and rendered transforms…')
    results.push(...await runGroupUiChecks(window))
    await writeFile('/tmp/reference3d-groups.png', (await window.webContents.capturePage()).toPNG())
    results.push(...await runGroupRenderChecks(window))

    console.log('Checking keyboard commands, shortcut help, and text/dialog isolation…')
    results.push(...await runShortcutChecks(window))

    for (const result of results) console.log('PASS ' + result)
    console.log(results.length + ' 3D Reference Chromium checks passed.')
  } catch (error) {
    console.error(error); exitCode = 1
    if (window && !window.isDestroyed()) {
      const screenshot = path.join(tmpdir(), 'reference-3d-browser-failure.png')
      await writeFile(screenshot, (await window.webContents.capturePage()).toPNG()).catch(() => {})
      console.error('Failure screenshot: ' + screenshot)
    }
  } finally {
    clearTimeout(watchdog)
    window?.destroy()
    await server?.close()
    await rm(profile, { recursive: true, force: true }).catch(() => {})
    app.exit(exitCode)
  }
}

void run().catch(error => { console.error(error); app.exit(1) })
