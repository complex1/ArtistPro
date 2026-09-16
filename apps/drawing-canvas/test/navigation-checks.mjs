/** Exercise the real editor, app router, and IndexedDB in the smoke test's isolated profile. */
export async function runNavigationChecks(window) {
  return window.webContents.executeJavaScript(`(${async function () {
    const { DrawingEngine } = await import('/apps/drawing-canvas/web/engine/engine.ts')
    const { DEFAULT_BRUSH } = await import('/apps/drawing-canvas/web/engine/brush.ts')
    const { createProject, getProject } = await import('/apps/drawing-canvas/web/library.ts')
    const originalCreate = DrawingEngine.create
    const originalPut = IDBObjectStore.prototype.put
    let currentEngine
    const results = []
    const check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
    const wait = async (condition, label) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (condition()) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error(`Timed out: ${label}; route=${location.hash}; page=${document.body.textContent.slice(0, 700)}`)
    }
    const point = (x, y) => ({ x, y, pressure: 1 })
    const paint = (engine, x, color) => engine.drawShape('rectangle', point(x, 20), point(x + 20, 40), { ...DEFAULT_BRUSH, color, opacity: 1 }, true)
    const pixel = (engine, x) => Array.from(engine.toCanvas().getContext('2d').getImageData(x, 30, 1, 1).data)
    DrawingEngine.create = async function (document) {
      const engine = await originalCreate.call(this, document)
      currentEngine = engine
      return engine
    }
    try {
      location.hash = '#/drawing-canvas'
      await wait(() => document.querySelector('.dc-home-shell'), 'canvas gallery')
      const failed = await createProject('Failed save navigation', 128, 128)
      location.hash = `#/drawing-canvas/${failed.id}`
      await wait(() => document.querySelector('.dc-viewport') && currentEngine?.getState().name === failed.document.name, 'first editor')
      const engine = currentEngine
      let failedWrites = 0
      IDBObjectStore.prototype.put = function () { failedWrites++; throw new DOMException('Test storage quota exceeded.', 'QuotaExceededError') }
      paint(engine, 20, '#ff0000')
      await wait(() => document.querySelector('.dc-save-status')?.textContent.includes('Save failed'), 'failed autosave')
      history.back()
      await wait(() => failedWrites >= 2 && location.hash === `#/drawing-canvas/${failed.id}` && document.querySelector('.dc-save-status')?.textContent.includes('Save failed'), 'failed navigation retained editor')
      check(Boolean(document.querySelector('.dc-viewport')) && pixel(engine, 30)[0] === 255 && pixel(engine, 30)[1] === 0, 'Failed save plus browser Back preserves the editor and unsaved pixels')
      check((await getProject(failed.id)).document.layers[0].dataUrl === null, 'Failed writes leave the last committed project intact')
      IDBObjectStore.prototype.put = originalPut
      document.querySelector('[aria-label="Back to gallery"]').click()
      await wait(() => document.querySelector('.dc-home-shell'), 'successful navigation retry')
      const restored = await originalCreate.call(DrawingEngine, (await getProject(failed.id)).document)
      check(pixel(restored, 30)[0] === 255 && pixel(restored, 30)[1] === 0, 'Retry saves retained artwork before leaving for the gallery')
      restored.dispose()

      const concurrent = await createProject('Edits during navigation save', 128, 128)
      location.hash = `#/drawing-canvas/${concurrent.id}`
      await wait(() => document.querySelector('.dc-viewport') && currentEngine?.getState().name === concurrent.document.name, 'second editor')
      const second = currentEngine
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('artist-studio-drawing-canvas', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      // A real transaction holds the store while the editor snapshots its first save.
      // The subsequent edit must be flushed after that first transaction completes.
      const blocker = database.transaction('projects', 'readwrite')
      let hold = true
      const keepAlive = () => {
        if (!hold) return
        blocker.objectStore('projects').get(concurrent.id).onsuccess = keepAlive
      }
      const released = new Promise((resolve, reject) => { blocker.oncomplete = resolve; blocker.onabort = () => reject(blocker.error) })
      keepAlive()
      paint(second, 20, '#ff0000')
      document.querySelector('[aria-label="Back to gallery"]').click()
      paint(second, 70, '#0000ff')
      hold = false
      await released
      database.close()
      await wait(() => document.querySelector('.dc-home-shell'), 'navigation flushes second revision')
      const latest = await originalCreate.call(DrawingEngine, (await getProject(concurrent.id)).document)
      check(pixel(latest, 30)[0] === 255 && pixel(latest, 80)[2] === 255 && pixel(latest, 80)[0] === 0, 'Navigation flushes a new edit made while the earlier save is pending')
      latest.dispose()
      return results
    } finally {
      IDBObjectStore.prototype.put = originalPut
      DrawingEngine.create = originalCreate
    }
  }.toString()})()`)
}
