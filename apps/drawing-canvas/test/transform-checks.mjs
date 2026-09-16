/** Pixel regressions for affine handles and four-corner projective transforms. */
export async function runTransformChecks(window) {
  return window.webContents.executeJavaScript(`(${async function () {
    const { DrawingEngine } = await import('/apps/drawing-canvas/web/engine/engine.ts')
    const { DEFAULT_BRUSH } = await import('/apps/drawing-canvas/web/engine/brush.ts')
    const { createDrawingDocument } = await import('/apps/drawing-canvas/web/document.ts')
    const { boundsCorners, containsPoint } = await import('/apps/drawing-canvas/web/engine/geometry.ts')
    const results = []
    const check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
    const point = (x, y) => ({ x, y, pressure: 1 })
    const quad = (points) => points.map(([x, y]) => ({ x, y }))
    const shape = (engine, x, y, width, height, color = '#ff0000') => engine.drawShape('rectangle', point(x, y), point(x + width, y + height), { ...DEFAULT_BRUSH, color, opacity: 1 }, true)
    const pixel = (engine, x, y) => Array.from(engine.toCanvas().getContext('2d').getImageData(x, y, 1, 1).data)
    const fresh = async () => {
      const document = createDrawingDocument('Transform test', 128, 128)
      document.background = null
      return DrawingEngine.create(document)
    }

    const resize = await fresh()
    shape(resize, 20, 30, 40, 20)
    check(JSON.stringify(resize.getTransformBounds()) === JSON.stringify({ x: 20, y: 30, width: 40, height: 20 }), 'Whole-layer handles fit the painted content')
    const revision = resize.getState().revision
    resize.transformQuad(boundsCorners(resize.getTransformBounds()))
    check(resize.getState().revision === revision, 'An unchanged transform does not create an undo step')
    resize.transformQuad(quad([[20, 30], [100, 30], [100, 40], [20, 40]]))
    check(pixel(resize, 90, 35)[3] === 255 && pixel(resize, 30, 45)[3] === 0, 'Resize changes width and height independently')
    resize.undo()
    check(pixel(resize, 90, 35)[3] === 0 && pixel(resize, 30, 45)[3] === 255, 'A single undo restores a resized layer')
    resize.dispose()

    const flips = await fresh()
    shape(flips, 20, 30, 40, 20)
    shape(flips, 20, 30, 10, 10, '#00ff00')
    const flipBounds = flips.getTransformBounds()
    const [tl, tr, br, bl] = boundsCorners(flipBounds)
    flips.transformQuad([tr, tl, bl, br])
    check(pixel(flips, 55, 35)[1] === 255 && pixel(flips, 25, 35)[0] === 255, 'Horizontal flip reflects pixels inside the artwork bounds')
    check(JSON.stringify(flips.getTransformBounds()) === JSON.stringify(flipBounds), 'Horizontal flip keeps off-center artwork in place')
    flips.undo()
    flips.transformQuad([bl, br, tr, tl])
    check(pixel(flips, 25, 45)[1] === 255 && pixel(flips, 25, 35)[0] === 255, 'Vertical flip reflects pixels inside the artwork bounds')
    check(JSON.stringify(flips.getTransformBounds()) === JSON.stringify(flipBounds), 'Vertical flip keeps off-center artwork in place')
    flips.dispose()

    const skew = await fresh()
    shape(skew, 20, 20, 40, 40)
    shape(skew, 95, 20, 15, 15, '#0000ff')
    skew.select({ kind: 'rectangle', bounds: { x: 20, y: 20, width: 40, height: 40 } })
    const target = quad([[40, 20], [80, 20], [60, 60], [20, 60]])
    const original = JSON.stringify(skew.serialize())
    const before = skew.getState().revision
    const preview = document.createElement('canvas')
    preview.width = preview.height = 128
    skew.renderQuadPreview(preview.getContext('2d'), target)
    check(preview.getContext('2d').getImageData(70, 25, 1, 1).data[0] > 240, 'Skew preview renders the displaced pixels')
    check(JSON.stringify(skew.serialize()) === original && skew.getState().revision === before, 'Live transform preview leaves saved pixels and undo history untouched')
    skew.transformQuad(target)
    check(pixel(skew, 70, 25)[0] === 255 && pixel(skew, 25, 25)[3] === 0 && pixel(skew, 25, 55)[0] === 255, 'Skew shears selected pixels into a parallelogram')
    check(pixel(skew, 100, 25)[2] === 255, 'Skew preserves artwork outside the selection')
    check(containsPoint(skew.getState().selection, 70, 25) && !containsPoint(skew.getState().selection, 25, 25), 'The selection follows the skewed artwork')
    skew.undo()
    check(JSON.stringify(skew.serialize()) === original, 'Undo restores selected pixels and surrounding artwork after skew')
    for (const invalid of [quad([[20, 20], [60, 60], [60, 20], [20, 60]]), quad([[20, 20], [60, 20], [60, 20], [20, 20]])]) {
      const oldRevision = skew.getState().revision
      try { skew.transformQuad(invalid) } catch { /* Invalid handles may be rejected explicitly. */ }
      check(JSON.stringify(skew.serialize()) === original && skew.getState().revision === oldRevision, 'Invalid transform handles cannot destroy source pixels')
    }
    skew.updateLayer(skew.getState().activeLayerId, { locked: true })
    const locked = JSON.stringify(skew.serialize())
    skew.transformQuad(target)
    check(JSON.stringify(skew.serialize()) === locked, 'Locked layers reject skew and perspective transforms')
    skew.dispose()

    const perspective = await fresh()
    shape(perspective, 20, 20, 80, 80)
    shape(perspective, 20, 58, 80, 4, '#00ff00')
    perspective.select({ kind: 'rectangle', bounds: { x: 20, y: 20, width: 80, height: 80 } })
    const perspectiveCorners = quad([[40, 20], [80, 20], [100, 100], [20, 100]])
    perspective.renderQuadPreview(preview.getContext('2d'), perspectiveCorners)
    check(preview.getContext('2d').getImageData(60, 47, 1, 1).data[1] > 200 && preview.getContext('2d').getImageData(60, 75, 1, 1).data[3] > 240, 'Live perspective preview projects both the interior pattern and complete surface')
    perspective.transformQuad(perspectiveCorners)
    check(pixel(perspective, 60, 47)[1] > 220 && pixel(perspective, 60, 60)[0] > 240, 'Perspective foreshortens interior pixels using a projective mapping')
    check(pixel(perspective, 25, 25)[3] === 0 && pixel(perspective, 25, 95)[3] > 240, 'Perspective follows all four corner positions')
    const saved = perspective.serialize()
    const restored = await DrawingEngine.create(saved)
    check(JSON.stringify(pixel(restored, 60, 47)) === JSON.stringify(pixel(perspective, 60, 47)), 'Perspective pixels survive an editable-project save and reload')
    restored.dispose()
    perspective.dispose()

    const layers = await fresh()
    shape(layers, 0, 0, 128, 128, '#0000ff')
    layers.addLayer()
    shape(layers, 20, 20, 40, 40)
    layers.updateLayer(layers.getState().activeLayerId, { opacity: 0.5 })
    const originalComposite = pixel(layers, 40, 40)
    layers.transformQuad(quad([[60, 40], [100, 40], [100, 80], [60, 80]]))
    const composite = pixel(layers, 80, 60)
    check(JSON.stringify(composite) === JSON.stringify(originalComposite), 'Transformed layers keep their opacity and composite above lower layers')
    check(pixel(layers, 30, 30)[2] === 255 && pixel(layers, 30, 30)[0] === 0, 'Moving a whole layer reveals the untouched layer below')
    layers.dispose()
    return results
  }.toString()})()`)
}
