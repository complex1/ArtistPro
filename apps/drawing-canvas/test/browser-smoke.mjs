/** Real Chromium pixel checks. Run: npm run test:drawing-canvas:browser */
import { app, BrowserWindow } from 'electron'
import { createServer } from 'vite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNavigationChecks } from './navigation-checks.mjs'
import { runTransformChecks } from './transform-checks.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
// Keep cleanup from quitting Electron before app.exit can report a failing check.
app.on('window-all-closed', () => {})
async function run() {
  const watchdog = setTimeout(() => { console.error('Drawing Canvas browser checks timed out.'); app.exit(1) }, 45_000)
  const profile = await mkdtemp(path.join(tmpdir(), 'drawing-canvas-test-'))
  app.setPath('userData', profile)
  await app.whenReady()
  let server
  let window
  let exitCode = 0
  try {
    server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' })
    await server.listen()
    window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false } })
    await window.loadURL(server.resolvedUrls.local[0])
    const results = await window.webContents.executeJavaScript(`(${async function () {
      const { DrawingEngine } = await import('/apps/drawing-canvas/web/engine/engine.ts')
      const { DEFAULT_BRUSH } = await import('/apps/drawing-canvas/web/engine/brush.ts')
      const { createDrawingDocument, validateDocument } = await import('/apps/drawing-canvas/web/document.ts')
      const results = []
      const check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
      const point = (x, y) => ({ x, y, pressure: 0.5 })
      const brush = { ...DEFAULT_BRUSH, kind: 'ink', color: '#ff0000', size: 10, opacity: 1, flow: 1, hardness: 1, smoothing: 0, spacing: 0.1, pressureSize: false, pressureOpacity: false }
      const fresh = async () => {
        const doc = createDrawingDocument('Pixel test', 128, 128)
        doc.background = null
        return DrawingEngine.create(doc)
      }
      const pixel = (engine, x, y) => Array.from(engine.toCanvas().getContext('2d').getImageData(x, y, 1, 1).data)
      const alpha = (engine, x, y) => pixel(engine, x, y)[3]
      const shape = (engine, x1, y1, x2, y2, color = '#ff0000') => engine.drawShape('rectangle', point(x1, y1), point(x2, y2), { ...brush, color }, true)
      const engine = await fresh()
      check(alpha(engine, 40, 40) === 0, 'New layer is transparent')
      engine.beginStroke(point(20, 30), brush)
      engine.moveStroke(point(80, 30))
      engine.endStroke()
      check(alpha(engine, 50, 30) > 240 && alpha(engine, 50, 50) === 0, 'Brush makes a continuous bounded stroke')
      engine.undo()
      check(alpha(engine, 50, 30) === 0, 'Undo restores pixels')
      engine.redo()
      check(alpha(engine, 50, 30) > 240, 'Redo restores stroke')
      const revision = engine.getState().revision
      engine.beginStroke(point(60, 60), brush)
      engine.moveStroke(point(80, 60))
      engine.cancelStroke()
      check(alpha(engine, 60, 60) === 0 && engine.getState().revision === revision, 'Cancelled strokes change neither pixels nor saved revision')
      engine.beginStroke(point(50, 30), { ...brush, size: 20 }, true)
      engine.endStroke()
      check(alpha(engine, 50, 30) === 0, 'Eraser removes existing pixels')
      engine.undo()
      check(alpha(engine, 50, 30) > 240, 'Erasing is undoable')
      engine.select({ kind: 'rectangle', bounds: { x: 20, y: 60, width: 20, height: 20 } })
      shape(engine, 0, 50, 80, 100)
      check(alpha(engine, 30, 70) === 255 && alpha(engine, 50, 70) === 0, 'Shapes are clipped to the selection')
      engine.transform({ x: 40, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
      check(alpha(engine, 30, 70) === 0 && alpha(engine, 70, 70) === 255 && alpha(engine, 30, 30) > 240, 'Transform moves selected pixels and preserves outside artwork')
      engine.undo()
      check(alpha(engine, 30, 70) === 255 && alpha(engine, 70, 70) === 0, 'Transform undo restores source and destination')
      engine.select(null)
      const active = engine.getState().activeLayerId
      engine.updateLayer(active, { locked: true })
      const lockedRevision = engine.getState().revision
      shape(engine, 100, 100, 120, 120)
      engine.clearPixels()
      check(alpha(engine, 30, 70) === 255 && alpha(engine, 110, 110) === 0 && engine.getState().revision === lockedRevision, 'Locked layers reject pixel edits')
      engine.updateLayer(active, { locked: false })
      engine.addLayer()
      shape(engine, 90, 90, 115, 115, '#0000ff')
      const upper = engine.getState().activeLayerId
      engine.updateLayer(upper, { visible: false })
      check(alpha(engine, 100, 100) === 0, 'Layer visibility changes composite')
      engine.updateLayer(upper, { visible: true, opacity: 0.5 })
      check(Math.abs(alpha(engine, 100, 100) - 128) <= 1, 'Layer opacity affects composite')
      engine.updateLayer(upper, { opacity: 1 })
      engine.duplicateLayer()
      check(engine.getState().layers.length === 3, 'Layer duplication creates independent layer')
      engine.clearPixels()
      check(pixel(engine, 100, 100)[2] === 255, 'Clearing a duplicate preserves its source')
      engine.removeLayer()
      const stored = engine.serialize()
      const restored = await DrawingEngine.create(stored)
      check(JSON.stringify(pixel(restored, 100, 100)) === JSON.stringify(pixel(engine, 100, 100)), 'PNG project serialization preserves pixels')
      check(restored.getState().layers.length === 2, 'Project serialization preserves editable layers')
      restored.dispose()
      engine.dispose()

      const fill = await fresh()
      fill.drawShape('rectangle', point(20, 20), point(100, 100), { ...brush, size: 3 }, false)
      fill.fill(point(50, 50), '#00ff00', 0)
      check(pixel(fill, 50, 50)[1] === 255 && alpha(fill, 10, 10) === 0, 'Flood fill stops at a closed boundary')
      fill.select({ kind: 'ellipse', bounds: { x: 35, y: 35, width: 30, height: 30 } })
      fill.clearPixels()
      check(alpha(fill, 50, 50) === 0 && pixel(fill, 36, 36)[1] === 255, 'Ellipse selection clears its interior only')
      fill.undo()
      fill.select({ kind: 'lasso', points: [point(40, 40), point(70, 40), point(40, 70)] })
      fill.fill(point(45, 45), '#0000ff', 0)
      check(pixel(fill, 45, 45)[2] === 255 && pixel(fill, 65, 65)[1] === 255, 'Lasso clips flood fill')
      fill.dispose()

      const translucent = await fresh()
      translucent.beginStroke(point(20, 40), { ...brush, opacity: 0.5 })
      translucent.moveStroke(point(100, 40))
      translucent.moveStroke(point(20, 40))
      translucent.endStroke()
      check(alpha(translucent, 50, 40) >= 120 && alpha(translucent, 50, 40) <= 130, 'Stroke opacity stays consistent across overlapping dabs')
      translucent.dispose()

      const affine = await fresh()
      shape(affine, 30, 50, 70, 60)
      affine.select({ kind: 'rectangle', bounds: { x: 30, y: 50, width: 40, height: 10 } })
      affine.transform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 })
      check(alpha(affine, 50, 40) === 255 && alpha(affine, 35, 55) === 0, 'Rotation uses the selected region center')
      affine.undo()
      affine.select({ kind: 'rectangle', bounds: { x: 30, y: 50, width: 40, height: 10 } })
      affine.transform({ x: 0, y: 0, scaleX: 0.5, scaleY: 2, rotation: 0 })
      check(alpha(affine, 45, 47) === 255 && alpha(affine, 35, 55) === 0, 'Scale changes selected width and height about center')
      affine.select(null)
      const image = document.createElement('canvas')
      image.width = image.height = 32
      const imageContext = image.getContext('2d')
      imageContext.fillStyle = '#00ff00'
      imageContext.fillRect(0, 0, 32, 32)
      await affine.importImage(image)
      check(affine.getState().layers.length === 2 && pixel(affine, 64, 64)[1] === 255, 'Image import adds a centered independent layer')
      const beforeMerge = JSON.stringify(pixel(affine, 64, 64))
      affine.mergeDown()
      check(affine.getState().layers.length === 1 && JSON.stringify(pixel(affine, 64, 64)) === beforeMerge, 'Normal layer merge preserves appearance')
      affine.undo()
      check(affine.getState().layers.length === 2, 'Undo merge restores editable layers')
      affine.dispose()

      const dynamics = await fresh()
      const dot = (x, y, settings, pressure = 1) => {
        dynamics.beginStroke({ x, y, pressure }, { ...brush, ...settings })
        dynamics.endStroke()
      }
      dot(30, 30, { size: 40, pressureSize: true }, 0.1)
      dot(90, 30, { size: 40, pressureSize: true }, 1)
      check(alpha(dynamics, 42, 30) === 0 && alpha(dynamics, 102, 30) > 240, 'Pen pressure changes brush diameter')
      dot(30, 75, { pressureOpacity: true }, 0.2)
      dot(60, 75, { flow: 0.2 })
      dot(90, 75, { flow: 1 })
      check(alpha(dynamics, 30, 75) < 70 && alpha(dynamics, 90, 75) > 240, 'Pen pressure changes opacity')
      check(alpha(dynamics, 60, 75) < alpha(dynamics, 90, 75) / 2, 'Flow controls pigment per stamp')
      dot(30, 110, { kind: 'flat', size: 40, hardness: 0 })
      dot(90, 110, { kind: 'flat', size: 40, hardness: 1 })
      check(alpha(dynamics, 48, 110) < alpha(dynamics, 108, 110), 'Hardness softens flat brush edges')
      dynamics.updateLayer(dynamics.getState().activeLayerId, { name: 'a'.repeat(120) })
      dynamics.duplicateLayer()
      check(validateDocument(dynamics.serialize()).layers.at(-1).name.length === 120, 'Duplicating long layer names remains saveable')
      dynamics.dispose()
      return results
    }.toString()})()`)
    results.push(...await runTransformChecks(window))
    results.push(...await runNavigationChecks(window))
    for (const result of results) console.log(`PASS ${result}`)
    console.log(`${results.length} Drawing Canvas Chromium checks passed.`)
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    clearTimeout(watchdog)
    window?.destroy()
    await server?.close()
    await rm(profile, { recursive: true, force: true }).catch(() => {})
    app.exit(exitCode)
  }
}

void run().catch((error) => { console.error(error); app.exit(1) })
