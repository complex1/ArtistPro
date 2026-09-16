/** Selection UI checks use real pointer input and verify resulting pixels. */
import { writeFile } from 'node:fs/promises'

export async function runFeedbackChecks(window) {
  const evaluate = async code => { try { return await window.webContents.executeJavaScript(code) } catch (error) { throw new Error(`${error.message}\nExpression: ${code.slice(0, 600)}`) } }
  const results = []
  const check = async (condition, label) => {
    if (!await evaluate(condition)) throw new Error(label)
    results.push(label)
  }
  const wait = (condition, label) => evaluate(`fbfWait(() => (${condition}), ${JSON.stringify(label)})`)
  const click = async label => { await evaluate(`fbfClick(${JSON.stringify(label)})`); await evaluate('new Promise(resolve => setTimeout(resolve, 30))') }
  async function path(points) {
    const rect = await evaluate(`(() => { const rect = document.querySelector('.fbf-artboard').getBoundingClientRect(); return { x: rect.left, y: rect.top, zoom: rect.width / 256 } })()`)
    const point = ([x, y]) => ({ x: Math.round(rect.x + x * rect.zoom), y: Math.round(rect.y + y * rect.zoom) })
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point(points[0]), button: 'left', clickCount: 1 })
    for (const next of points.slice(1)) {
      window.webContents.sendInputEvent({ type: 'mouseMove', ...point(next), button: 'left' })
      await evaluate('new Promise(resolve => setTimeout(resolve, 20))')
    }
    window.webContents.sendInputEvent({ type: 'mouseUp', ...point(points.at(-1)), button: 'left', clickCount: 1 })
    await evaluate('new Promise(resolve => setTimeout(resolve, 40))')
  }
  await evaluate(`(${async function () {
    const { createDocument } = await import('/apps/frame-by-frame/web/model.ts')
    const { importProject } = await import('/apps/frame-by-frame/web/library.ts')
    const doc = createDocument('Selection feedback checks', 256, 256, 12)
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ff0000'; ctx.fillRect(40, 90, 60, 30)
    ctx.fillStyle = '#0000ff'; ctx.fillRect(190, 190, 20, 20)
    doc.layers[0].cels[0].dataUrl = canvas.toDataURL()
    const record = await importProject(doc)
    location.hash = '#/frame-by-frame/' + record.id
    window.feedbackPixel = (x, y) => [...document.querySelector('.fbf-raster-layer canvas').getContext('2d').getImageData(x, y, 1, 1).data]
    await fbfWait(() => fbfReady() && document.querySelector('[aria-label="Shot name"]')?.value === doc.name, 'selection fixture')
  }.toString()})()`)
  await click('Select (M)')
  await path([[30, 80], [110, 130]])
  await wait('document.querySelectorAll("[data-transform-handle]").length === 9', 'selection resize and rotation handles')
  if (process.env.FBF_SCREENSHOT) await writeFile(process.env.FBF_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
  await check(`document.querySelector('.fbf-tool-properties').textContent.includes('Transform selection') && !document.querySelector('.fbf-tool-properties').textContent.includes('Brush studio')`, 'Selection tool shows selection and transform properties immediately')
  await check(`Boolean(document.querySelector('[aria-label="Deselect region"]')) && feedbackPixel(50,100)[0] === 255`, 'Selecting exposes Deselect without altering drawing pixels')

  await path([[110, 105], [130, 105], [150, 105]])
  await wait('feedbackPixel(125,105)[0] === 255', 'edge resize pixels')
  await check('feedbackPixel(125,105)[0] === 255 && feedbackPixel(195,195)[2] === 255', 'Dragging a selection edge resizes its pixels and preserves artwork outside the selection')
  await path([[90, 50], [129, 66], [145, 105]])
  await wait('feedbackPixel(90,70)[0] === 255 && feedbackPixel(125,105)[3] === 0', 'rotation pixels')
  await check('feedbackPixel(90,70)[0] === 255 && feedbackPixel(195,195)[2] === 255', 'Dragging the round rotation handle rotates selected pixels around their center')
  await click('Undo')
  await wait('fbfReady() && feedbackPixel(125,105)[0] === 255', 'undo rotation')
  await click('Undo')
  await wait('fbfReady() && feedbackPixel(125,105)[3] === 0 && feedbackPixel(95,110)[0] === 255', 'undo resize')
  results.push('Each selection transform is a single undoable artwork change')

  await click('Freehand lasso (L)')
  await path([[20,70], [60,70], [120,70], [80,110], [20,170], [20,120], [20,70]])
  await wait('document.querySelector(".fbf-selection-outline polygon")', 'closed lasso outline')
  await click('Fill (G)')
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Tool color"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#00ff00'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await path([[50,100], [50,100]])
  await wait('feedbackPixel(50,100)[1] === 255', 'lasso constrained fill')
  await check('feedbackPixel(95,110)[0] === 255 && feedbackPixel(95,110)[1] === 0 && feedbackPixel(195,195)[2] === 255', 'Freehand lasso clips fill to the polygon and preserves pixels outside it')
  await check(`Boolean(document.querySelector('[aria-label="Fill tolerance"]')) && !document.querySelector('.fbf-tool-properties [aria-label="Size"]')`, 'Fill properties show color and tolerance without brush controls')
  await click('Deselect region')
  await check(`!document.querySelector('.fbf-selection-outline') && !document.querySelector('[aria-label="Deselect region"]') && feedbackPixel(50,100)[1] === 255`, 'Deselect removes the selection mask and outline while preserving artwork')

  await click('Eraser (E)')
  await check(`Boolean(document.querySelector('.fbf-tool-properties [aria-label="Size"]')) && !document.querySelector('[aria-label="Tool color"]')`, 'Eraser properties expose size and opacity without irrelevant color controls')
  await click('Rectangle (R)')
  await check(`Boolean(document.querySelector('[aria-label="Outline width"]')) && document.querySelector('.fbf-tool-properties').textContent.includes('Filled shape') && !document.querySelector('[aria-label="Smoothing"]')`, 'Shape properties expose fill, outline width, color, and opacity')
  await click('Pan (H or Alt drag)')
  await check(`document.querySelector('.fbf-tool-properties').textContent.includes('Pan & zoom') && !document.querySelector('[aria-label="Opacity"]')`, 'Pan properties show canvas navigation controls')

  await click('Select (M)')
  await path([[30,80], [110,130]])
  await wait('document.querySelector("[data-transform-handle=rotate]")', 'selection before numeric transform')
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Transform rotation degrees"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '90'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await evaluate(`document.querySelector('.fbf-tool-properties').querySelectorAll('button').forEach(button => { if (button.textContent === 'Apply transform') button.click() })`)
  await wait('feedbackPixel(70,85)[3] > 240 && feedbackPixel(95,110)[3] === 0', 'numeric rotation pixels')
  results.push('Numeric rotation applies directly from selection tool properties')
  await click('Undo'); await wait('fbfReady() && feedbackPixel(95,110)[0] === 255', 'restore before cancellation')
  await path([[30,80], [110,130]])
  await wait('document.querySelector("[data-transform-handle=rotate]")', 'selection before cancellation')
  const rect = await evaluate(`(() => { const rect = document.querySelector('.fbf-artboard').getBoundingClientRect(); return { x: rect.left, y: rect.top } })()`)
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x + 110), y: Math.round(rect.y + 105), button: 'left', clickCount: 1 })
  window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(rect.x + 150), y: Math.round(rect.y + 105), button: 'left' })
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x + 150), y: Math.round(rect.y + 105), button: 'left', clickCount: 1 })
  await wait(`feedbackPixel(125,105)[3] === 0 && document.querySelector('[aria-label="Deselect region"]')`, 'cancel transform')
  results.push('Escape cancels an in-progress transform without discarding the selection')
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await wait(`!document.querySelector('[aria-label="Deselect region"]')`, 'Escape deselect')
  results.push('Escape with no active gesture deselects the region')

  await click('Add animation layer'); await wait('fbfReady() && document.querySelectorAll(".fbf-track").length === 2', 'added track')
  await click('Brush (B)'); await path([[210,210], [230,210]])
  await wait('fbfSession.document.layers[1].cels.length === 1', 'new track artwork')
  await click('Delete track Layer 2')
  await wait('fbfReady() && document.querySelectorAll(".fbf-track").length === 1', 'delete track')
  await check('feedbackPixel(195,195)[2] === 255', 'Deleting a timeline track preserves artwork on other tracks')
  await click('Undo'); await wait('document.querySelectorAll(".fbf-track").length === 2', 'undo deleted track')
  await check('Boolean(fbfSession.document.layers[1].cels[0].dataUrl)', 'Undo restores a deleted track with its drawings')
  await click('Lock Layer 2')
  await check(`document.querySelector('[aria-label="Delete track Layer 2"]').disabled`, 'Locked tracks cannot be deleted')
  await click('Unlock Layer 2'); await click('Delete track Layer 2')
  await wait('document.querySelectorAll(".fbf-track").length === 1', 'remove second track again')
  await click('Delete track Animation')
  await wait('fbfReady() && fbfSession.document.layers[0].cels.length === 0', 'delete final track')
  await check('fbfSession.document.layers.length === 1 && feedbackPixel(50,100)[3] === 0', 'Deleting the final track leaves one blank editable track')
  await click('Undo'); await wait('fbfReady() && feedbackPixel(95,110)[0] === 255', 'restore final track')
  results.push('Undo after deleting the final track restores the original artwork')
  await click('Delete drawing'); await wait('fbfReady() && document.querySelectorAll(".fbf-cel").length === 0', 'delete selected cel')
  await check('feedbackPixel(50,100)[3] === 0', 'Timeline Delete removes the selected drawing and leaves a transparent gap')
  return results
}
