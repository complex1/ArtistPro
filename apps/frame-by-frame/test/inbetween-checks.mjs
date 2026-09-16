/** Real worker, preview, and timeline checks in browser-smoke's disposable profile. */
import { writeFile } from 'node:fs/promises'

export async function runInbetweenChecks(window) {
  const evaluate = async code => {
    try { return await window.webContents.executeJavaScript(code) }
    catch (error) { throw new Error(`${error.message}\nIn-between expression: ${code.slice(0, 600)}`) }
  }
  const results = []
  const check = async (condition, label) => {
    if (!await evaluate(condition)) throw new Error(label)
    results.push(label)
    if (process.env.FBF_TEST_DEBUG) console.log('PASS ' + label)
  }
  const wait = (condition, label) => evaluate(`fbfWait(() => (${condition}), ${JSON.stringify(label)})`)
  const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 30))')
  const click = async label => { await evaluate(`fbfClick(${JSON.stringify(label)})`); await settle() }
  const textClick = async text => {
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.fbf-ib-dialog button')].find(button => button.textContent.trim() === ${JSON.stringify(text)})
      if (!button || button.disabled) throw Error('Missing or disabled in-between button: ' + ${JSON.stringify(text)})
      button.click()
    })()`)
    await settle()
  }
  const change = async (label, value) => {
    await evaluate(`(() => {
      const control = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']')
      if (!control || control.disabled) throw Error('Missing or disabled setting: ' + ${JSON.stringify(label)})
      const select = control instanceof HTMLSelectElement
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(control, ${JSON.stringify(value)})
      control.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true }))
    })()`)
    await settle()
  }
  const key = async (keyCode, modifiers = []) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await settle()
  }
  const guidePoint = async (side, x, y) => {
    const point = await evaluate(`(() => {
      const svg = document.querySelector('[aria-label="${side} drawing motion guides"]')
      const point = new DOMPoint(${x}, ${y}).matrixTransform(svg.getScreenCTM())
      return { x: Math.round(point.x), y: Math.round(point.y) }
    })()`)
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
    window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    await settle()
  }
  const open = async () => {
    await click('Generate in-betweens')
    await wait(`document.querySelector('[role="dialog"] #fbf-ib-title')?.textContent === 'Line art in-betweens'`, 'in-between studio opens')
    await wait(`document.querySelectorAll('.fbf-ib-guide-list button').length > 0 && !document.querySelector('[aria-label="Auto-match guides"]').disabled`, 'worker automatically matches line features')
  }
  const generate = async () => {
    await textClick('Generate preview')
    await wait(`document.querySelectorAll('.fbf-ib-filmstrip button').length === 5 || document.querySelector('.fbf-ib-error')`, 'worker generates three preview drawings')
    await check(`!document.querySelector('.fbf-ib-error') && document.querySelectorAll('.fbf-ib-filmstrip button').length === 5`, 'Local worker completes a three-drawing preview without errors')
  }

  await evaluate(`(${async function () {
    const { createDocument } = await import('/apps/frame-by-frame/web/model.ts')
    const { importProject } = await import('/apps/frame-by-frame/web/library.ts')
    const make = (dx, dy, paper = false, blank = false) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
      const ctx = canvas.getContext('2d')
      if (paper) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128) }
      if (!blank) {
        ctx.translate(dx, dy); ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.lineCap = ctx.lineJoin = 'round'
        ctx.beginPath(); ctx.moveTo(20, 22); ctx.lineTo(20, 62); ctx.lineTo(44, 62); ctx.lineTo(50, 54); ctx.stroke()
        ctx.beginPath(); ctx.arc(38, 30, 8, 0, Math.PI * 2); ctx.stroke()
      }
      return canvas.toDataURL('image/png')
    }
    const doc = createDocument('In-between browser checks', 128, 128, 12)
    doc.duration = 8; doc.background = null
    doc.layers[0].cels = [
      { id: 'key-a', start: 0, duration: 3, dataUrl: make(0, 0), thumbnail: null },
      { id: 'key-b', start: 6, duration: 2, dataUrl: make(48, 10), thumbnail: null },
    ]
    doc.layers.push({ id: 'reference-track', name: 'Reference', visible: false, locked: true, opacity: 1, cels: [{ id: 'reference-cel', start: 1, duration: 4, dataUrl: null, thumbnail: null }] })
    window.fbfIbRecord = await importProject(doc)
    window.fbfIbFitRecord = await importProject({ ...doc, name: 'In-between fit checks' })
    window.fbfIbBlankRecord = await importProject({ ...doc, name: 'In-between blank checks', layers: [{ ...doc.layers[0], cels: doc.layers[0].cels.map((cel, i) => ({ ...cel, dataUrl: make(0, 0, i === 1, true) })) }] })
    window.fbfIbStats = async dataUrl => {
      const image = new Image(); image.src = dataUrl; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      canvas.getContext('2d').drawImage(image, 0, 0)
      const data = canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data
      let mass = 0, x = 0, y = 0, maxAlpha = 0, colored = 0
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255, pixel = i / 4
        mass += alpha; x += (pixel % image.width) * alpha; y += Math.floor(pixel / image.width) * alpha
        maxAlpha = Math.max(maxAlpha, data[i + 3])
        if (alpha > 0 && (data[i] || data[i + 1] || data[i + 2])) colored++
      }
      return { x: x / mass, y: y / mass, mass, maxAlpha, colored, cornerAlpha: data[3], width: image.width, height: image.height }
    }
    location.hash = '#/frame-by-frame/' + fbfIbRecord.id
    await fbfWait(() => document.querySelector('[aria-label="Shot name"]')?.value === doc.name, 'in-between fixture')
    fbfClick('Animation, drawing at frame 1, 3 frames')
    await fbfWait(fbfReady, 'in-between fixture artwork')
  }.toString()})()`)
  // Make Undo meaningful before testing modal shortcut isolation. The existing smoke
  // helper records the current session on this ordinary UI edit.
  await change('Shot name', 'In-between browser checks · edited')
  await wait(`fbfSession?.document.name === 'In-between browser checks · edited'`, 'editable fixture session')
  await evaluate('window.fbfIbBefore = JSON.stringify(fbfSession.document); window.fbfIbRevision = fbfSession.revision')
  await open()
  await check(`document.querySelectorAll('.fbf-ib-guide-list button').length >= 3`, 'Automatic analysis finds multiple matching guides on translated asymmetric line art')
  await key('n')
  await key('z', [process.platform === 'darwin' ? 'meta' : 'control'])
  await check(`JSON.stringify(fbfSession.document) === fbfIbBefore && fbfSession.revision === fbfIbRevision && Boolean(document.querySelector('.fbf-ib-dialog'))`, 'New-drawing and Undo shortcuts are isolated while the in-between dialog is open')

  await evaluate('window.fbfIbGuideCount = document.querySelectorAll(".fbf-ib-guide-list button").length')
  await textClick('Add guide')
  await guidePoint('Start', 60, 92)
  await check(`document.querySelector('.fbf-ib-guidance').textContent.includes('matching feature in the end drawing')`, 'Adding a guide prompts for its matching point after placing the start anchor')
  await guidePoint('End', 108, 102)
  await check(`document.querySelectorAll('.fbf-ib-guide-list button').length === fbfIbGuideCount + 1 && document.querySelector('.fbf-ib-guide-list button:last-child').textContent.includes('Edited') && (() => { const start = document.querySelector('[aria-label="Start drawing motion guides"] g:last-of-type circle'), end = document.querySelector('[aria-label="End drawing motion guides"] g:last-of-type circle'); return Math.abs(Number(start.getAttribute('cx')) - 60) < 1 && Math.abs(Number(start.getAttribute('cy')) - 92) < 1 && Math.abs(Number(end.getAttribute('cx')) - 108) < 1 && Math.abs(Number(end.getAttribute('cy')) - 102) < 1 })()`, 'Real pointer clicks add a paired manual guide at the selected source and destination coordinates')
  await click('Remove selected guide')
  await check(`document.querySelectorAll('.fbf-ib-guide-list button').length === fbfIbGuideCount && JSON.stringify(fbfSession.document) === fbfIbBefore`, 'Removing a manual guide preserves automatic matches and does not edit shot artwork')

  // Observe the busy render so even a tiny fixture can be cancelled before its
  // worker finishes. This uses the real UI button, AbortController, and worker.
  await evaluate(`(${async function () {
    const dialog = document.querySelector('.fbf-ib-dialog')
    const generate = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'Generate preview')
    if (!generate || generate.disabled) throw Error('Generation must be available before cancellation')
    await new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const cancel = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'Cancel processing')
        if (!cancel) return
        clearTimeout(timeout); observer.disconnect(); cancel.click(); resolve()
      })
      const timeout = setTimeout(() => { observer.disconnect(); reject(Error('No Cancel processing control appeared')) }, 3000)
      observer.observe(dialog, { childList: true, subtree: true, characterData: true })
      generate.click()
    })
    await fbfWait(() => ![...dialog.querySelectorAll('button')].some(button => button.textContent.trim() === 'Cancel processing'), 'generation cancellation completes')
    await new Promise(resolve => setTimeout(resolve, 300))
  }.toString()})()`)
  await check(`!document.querySelector('.fbf-ib-filmstrip') && !document.querySelector('.fbf-ib-error') && document.querySelector('.fbf-ib-dialog footer .fbf-primary').disabled && JSON.stringify(fbfSession.document) === fbfIbBefore && fbfSession.revision === fbfIbRevision`, 'Cancelling active generation discards pending results without inserting drawings or later showing a stale preview')

  await generate()
  if (process.env.FBF_INBETWEEN_SCREENSHOT) await writeFile(process.env.FBF_INBETWEEN_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
  try {
    window.setSize(390, 844)
    await wait('innerWidth <= 390', 'mobile in-between viewport')
    await settle()
    await check(`(() => { const dialog = document.querySelector('.fbf-ib-dialog').getBoundingClientRect(), close = document.querySelector('[aria-label="Close in-between studio"]').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth + 1 && dialog.left >= -1 && dialog.right <= innerWidth + 1 && dialog.top >= -1 && dialog.bottom <= innerHeight + 1 && close.left >= 0 && close.right <= innerWidth && [...document.querySelectorAll('.fbf-ib-dialog input, .fbf-ib-dialog select, .fbf-ib-dialog footer button')].every(control => { const rect = control.getBoundingClientRect(); return rect.left >= -1 && rect.right <= innerWidth + 1 }) })()`, 'At 390px the populated dialog, settings, close button, and footer controls fit without horizontal overflow')
    await check(`(() => {
      const panels = [...document.querySelectorAll('.fbf-ib-settings, .fbf-ib-workspace')]
      const [a, b] = panels.map(panel => panel.getBoundingClientRect())
      if (!a || !b || !(a.bottom <= b.top + 1 || b.bottom <= a.top + 1)) return false
      return panels.every(panel => {
        const bounds = panel.getBoundingClientRect()
        // scrollHeight includes visible overflow from nested descendants while
        // respecting intentional inner scrollers such as the motion-guide list.
        if (panel.scrollHeight > panel.clientHeight + 2 || panel.scrollWidth > panel.clientWidth + 2) return false
        return [...panel.children].every(child => {
          const rect = child.getBoundingClientRect()
          return !rect.width || !rect.height || (rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1)
        })
      })
    })()`, 'Mobile settings and preview panels do not overlap and contain their nested content without vertical overflow')
    if (process.env.FBF_INBETWEEN_MOBILE_SCREENSHOT) await writeFile(process.env.FBF_INBETWEEN_MOBILE_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
  } finally {
    window.setSize(1280, 900)
    await wait('innerWidth >= 1200', 'restore desktop in-between viewport')
    await settle()
  }
  await check(`document.querySelector('.fbf-ib-preview-heading').textContent.includes('3 new drawings')`, 'Preview exposes three generated frames alongside both original keys')
  await evaluate(`(${async function () {
    const urls = [...document.querySelectorAll('.fbf-ib-filmstrip img')].map(image => image.src)
    const stats = await Promise.all(urls.map(fbfIbStats)), a = stats[0], b = stats[4]
    for (let i = 1; i <= 3; i++) {
      const current = stats[i], t = i / 4
      if (current.width !== 128 || current.height !== 128 || current.cornerAlpha !== 0 || current.colored !== 0 || current.maxAlpha < 220 || current.mass < a.mass * .65 || current.mass > a.mass * 1.35) throw Error('Generated drawing lost black ink density or transparent dimensions: ' + JSON.stringify(current))
      if (Math.abs(current.x - (a.x + (b.x - a.x) * t)) > 3 || Math.abs(current.y - (a.y + (b.y - a.y) * t)) > 3) throw Error('Generated drawing is not at the intermediate position: ' + JSON.stringify({ current, t, a, b }))
    }
    if (urls[0] !== fbfIbRecord.document.layers[0].cels[0].dataUrl || urls[4] !== fbfIbRecord.document.layers[0].cels[1].dataUrl) throw Error('Preview changed endpoint artwork')
  }.toString()})()`)
  results.push('Generated PNGs contain dense black ink on transparency at intermediate positions and preserve endpoint pixels')
  await click('Play in-between preview')
  await evaluate('window.fbfIbPreviewPose = document.querySelector(".fbf-ib-preview img").alt')
  await wait(`document.querySelector('.fbf-ib-preview img').alt !== fbfIbPreviewPose`, 'preview playback advances')
  await wait(`document.querySelector('.fbf-ib-preview img').alt === 'Preview end key'`, 'preview playback reaches the end key')
  await click('Pause in-between preview')
  results.push('Preview playback advances independently of the shot timeline')

  await change('Generated drawing exposure', '2')
  await check(`!document.querySelector('.fbf-ib-filmstrip') && document.querySelector('.fbf-ib-dialog footer .fbf-primary').disabled`, 'Changing exposure invalidates the preview and disables insertion until regeneration')
  await generate()
  await evaluate(`document.querySelector('[aria-label="Start guide 1"]').focus(); window.fbfIbGuideX = Number(document.querySelector('[aria-label="Start guide 1"] circle').getAttribute('cx')); window.fbfIbFrame = document.querySelector('.fbf-timecode strong').textContent`)
  await key('Right')
  await check(`Number(document.querySelector('[aria-label="Start guide 1"] circle').getAttribute('cx')) === fbfIbGuideX + 1 && document.querySelector('[aria-label="Select guide 1"]').textContent.includes('Edited') && !document.querySelector('.fbf-ib-filmstrip') && document.querySelector('.fbf-ib-dialog footer .fbf-primary').disabled && document.querySelector('.fbf-timecode strong').textContent === fbfIbFrame`, 'A manual guide adjustment moves its anchor, invalidates generated frames, and leaves the underlying playhead alone')
  await generate()
  await click('Close in-between studio')
  await check(`!document.querySelector('.fbf-ib-dialog') && JSON.stringify(fbfSession.document) === fbfIbBefore && fbfSession.revision === fbfIbRevision`, 'Closing a generated preview leaves all original drawings and timing unchanged')

  await open()
  await change('Generated drawing exposure', '2')
  await generate()
  await textClick('Insert 3 drawings')
  await wait(`!document.querySelector('.fbf-ib-dialog') && fbfSession.document.layers[0].cels.length === 5 && fbfReady()`, 'insert generated drawings')
  await check(`JSON.stringify(fbfSession.document.layers[0].cels.map(cel => [cel.start, cel.duration])) === JSON.stringify([[0,3],[3,2],[5,2],[7,2],[9,2]]) && fbfSession.document.duration === 11`, 'Insert consumes the empty gap before shifting the end key and extends the shot for two-frame exposures')
  await check(`(() => { const before = JSON.parse(fbfIbBefore), after = fbfSession.document, a = after.layers[0].cels[0], b = after.layers[0].cels[4]; return a.id === 'key-a' && b.id === 'key-b' && a.dataUrl === before.layers[0].cels[0].dataUrl && b.dataUrl === before.layers[0].cels[1].dataUrl && JSON.stringify(after.layers[1]) === JSON.stringify(before.layers[1]) && document.querySelector('.fbf-timecode strong').textContent === '0004' })()`, 'Insertion preserves both key IDs and pixels, leaves other tracks untouched, and selects the first generated frame')
  await evaluate('window.fbfIbInserted = JSON.stringify(fbfSession.document)')
  await click('Undo')
  await wait('JSON.stringify(fbfSession.document) === fbfIbBefore && fbfReady()', 'one-step in-between undo')
  results.push('A single Undo restores the entire shot before in-between insertion')
  await click('Redo')
  await wait('JSON.stringify(fbfSession.document) === fbfIbInserted && fbfReady()', 'redo in-between insertion')
  await click('Save project')
  await wait('!fbfSession.dirty && !fbfSession.saving', 'save generated drawings')
  await check(`(async () => JSON.stringify((await fbfGetProject(fbfIbRecord.id)).document) === fbfIbInserted)()`, 'Saving persists all generated PNGs, thumbnails, endpoint artwork, and cel holds')
  await click('Back to shots')
  await wait(`document.querySelector('.fbf-home')`, 'gallery after saving in-betweens')
  await evaluate(`location.hash = '#/frame-by-frame/' + fbfIbRecord.id`)
  await wait(`document.querySelector('[aria-label="Shot name"]')?.value === 'In-between browser checks · edited'`, 'reopen generated shot')
  await click('Animation, drawing at frame 1, 3 frames')
  await wait('fbfReady()', 'reopened animation track')
  await click('Go to frame 4')
  await wait(`fbfReady() && document.querySelector('.fbf-timecode strong').textContent === '0004'`, 'reopened first generated cel')
  await evaluate(`(${async function () {
    const canvas = document.querySelector('.fbf-raster-layer canvas')
    const expected = JSON.parse(fbfIbInserted).layers[0].cels[1].dataUrl
    const actual = await fbfIbStats(canvas.toDataURL()), wanted = await fbfIbStats(expected)
    if (Math.abs(actual.mass - wanted.mass) > .1 || Math.abs(actual.x - wanted.x) > .01) throw Error('Reopened generated cel pixels changed')
  }.toString()})()`)
  await evaluate(`[...document.querySelectorAll('.fbf-inspector-tabs button')].find(button => button.textContent === 'Shot').click()`)
  await wait(`document.querySelector('[aria-label="Current drawing exposure"]')`, 'reopened cel exposure inspector')
  await check(`document.querySelector('[aria-label="Current drawing exposure"]').value === '2'`, 'Reopening restores editable generated artwork with its saved exposure')

  await click('Back to shots')
  await wait(`document.querySelector('.fbf-home')`, 'gallery before fit fixture')
  await evaluate(`location.hash = '#/frame-by-frame/' + fbfIbFitRecord.id`)
  await wait(`document.querySelector('[aria-label="Shot name"]')?.value === 'In-between fit checks'`, 'fit fixture')
  await click('Animation, drawing at frame 1, 3 frames')
  await wait('fbfReady()', 'fit fixture artwork')
  await open()
  await change('In-between placement', 'fit')
  await check(`document.querySelector('[aria-label="Generated drawing exposure"]').disabled && document.querySelector('.fbf-ib-timing').textContent.includes('First key holds for 1 frame')`, 'Fit mode explains the shortened first-key hold and disables fixed exposure')
  await generate()
  await textClick('Insert 3 drawings')
  await wait(`!document.querySelector('.fbf-ib-dialog') && fbfSession.document.name === 'In-between fit checks' && fbfReady()`, 'fit insertion')
  await check(`JSON.stringify(fbfSession.document.layers[0].cels.map(cel => [cel.start, cel.duration])) === JSON.stringify([[0,1],[1,2],[3,2],[5,1],[6,2]]) && fbfSession.document.duration === 8 && fbfSession.document.layers[0].cels[4].dataUrl === fbfIbFitRecord.document.layers[0].cels[1].dataUrl`, 'Fit distributes integer holds across the interval while preserving the end key start and shot length')
  await click('Undo')
  await wait('JSON.stringify(fbfSession.document) === JSON.stringify(fbfIbFitRecord.document) && fbfReady()', 'fit undo restores first key hold')
  results.push('Undo of fit placement restores the original first-key exposure and both endpoints')

  await click('Back to shots')
  await wait(`document.querySelector('.fbf-home')`, 'gallery before empty ink fixture')
  await evaluate(`location.hash = '#/frame-by-frame/' + fbfIbBlankRecord.id`)
  await wait(`fbfReady() && document.querySelector('[aria-label="Shot name"]')?.value === 'In-between blank checks'`, 'blank line-art fixture')
  await click('Generate in-betweens')
  await wait(`document.querySelector('.fbf-ib-error')`, 'blank artwork reports analysis failure')
  await check(`document.querySelector('.fbf-ib-error').textContent.includes('no usable dark line art') && document.querySelectorAll('.fbf-ib-guide-list button').length === 0 && document.querySelector('.fbf-ib-dialog footer .fbf-primary').disabled && !document.querySelector('.fbf-ib-filmstrip')`, 'Blank encoded PNGs report a visible line-art error and cannot insert empty generated drawings')
  await click('Close in-between studio')
  await check(`(async () => JSON.stringify((await fbfGetProject(fbfIbBlankRecord.id)).document) === JSON.stringify(fbfIbBlankRecord.document))()`, 'Failed analysis leaves the saved blank shot unchanged')
  await click('Back to shots')
  await wait(`document.querySelector('.fbf-home')`, 'gallery after in-between checks')
  return results
}
