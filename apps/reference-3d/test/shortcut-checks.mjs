/** Trusted Chromium key events with native editable and modal isolation. */
import { writeFile } from 'node:fs/promises'

export async function runShortcutChecks(window) {
  const evaluate = (fn, ...args) => window.webContents.executeJavaScript('(' + fn.toString() + ')(' + args.map(value => JSON.stringify(value)).join(',') + ')')
  const results = [], check = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
  const press = async (keyCode, names = [], focus = true, text = false) => {
    if (focus) await evaluate(() => document.querySelector('.ref-studio .reference3d-stage canvas').focus())
    const modifiers = names.map(name => name === 'mod' ? process.platform === 'darwin' ? 'meta' : 'control' : name)
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    if (text) window.webContents.sendInputEvent({ type: 'char', keyCode: keyCode.toLowerCase(), modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await evaluate(() => refTick())
  }
  const saved = async () => {
    await press('S', ['mod'])
    await evaluate(() => refWait(() => document.querySelector('.ref-save-state.saved'), 'keyboard save committed'))
    return evaluate(() => refGet())
  }
  const mode = () => evaluate(() => document.querySelector('.ref-modes .active').textContent.trim())
  const active = label => evaluate(label => document.querySelector('[aria-label="' + label + '"]')?.getAttribute('aria-pressed') === 'true', label)
  const select = async id => { await evaluate(id => document.querySelector('[data-object-id="' + id + '"] .ref-scene-select').click(), id); await evaluate(() => refTick()) }
  const initial = await evaluate(async () => {
    const { createProject, saveProject } = await import('/apps/reference-3d/web/library.ts')
    const { createSceneObject } = await import('/apps/reference-3d/web/model.ts')
    const created = await createProject('Keyboard scene', 384, 256)
    created.document.objects[0].position = [0, 1, 0]
    created.document.objects.push({ ...createSceneObject('cube', 'Keyboard box'), position: [1.1, .25, 0] })
    window.refRecord = await saveProject(created)
    location.hash = '#/reference-3d/' + refRecord.id
    await refWait(() => document.querySelector('.ref-studio .reference3d-stage canvas'), 'keyboard scene ready')
    document.querySelectorAll('.ref-panel-tabs button')[1].click(); await refTick()
    return refRecord.document
  })
  const figureId = initial.objects[0].id, cubeId = initial.objects[1].id
  await press('D', ['mod'])
  check((await saved()).objects.length === 3, 'Cmd/Ctrl+D duplicates the selected object through a real keyboard event')
  await press('D', ['mod', 'isautorepeat'])
  check((await saved()).objects.length === 3, 'Held duplicate keys do not create repeated copies')
  await press('Z', ['mod'])
  check((await saved()).objects.length === 2, 'Cmd/Ctrl+Z undoes a keyboard-created duplicate')
  await press('Z', ['mod', 'shift'])
  check((await saved()).objects.length === 3, 'Cmd/Ctrl+Shift+Z restores the duplicate')
  await press('Z', ['mod']); await saved()
  await press('A', ['mod'])
  check(await evaluate(() => document.querySelector('.ref-inspector-scroll').textContent.includes('2 OBJECTS SELECTED')), 'Cmd/Ctrl+A selects all scene objects')
  await press('G', ['mod'])
  let doc = await saved(), group = doc.objects.find(object => object.kind === 'group')
  check(group && doc.objects.filter(object => object.parentId === group.id).length === 2, 'Cmd/Ctrl+G groups the selected scene objects')
  await press('G', ['mod', 'shift'])
  check((await saved()).objects.length === 2, 'Cmd/Ctrl+Shift+G ungroups the selected folder')
  await press('N', ['shift'])
  doc = await saved(); group = doc.objects.find(object => object.kind === 'group')
  check(group && doc.objects.length === 3, 'Shift+N creates a new scene folder')
  await select(cubeId)
  await evaluate(async id => { refSetValue(document.querySelector('[aria-label="Move to folder"]'), id); await refTick() }, group.id)
  await saved(); await press('U', ['shift'])
  check(!(await saved()).objects.find(object => object.id === cubeId).parentId, 'Shift+U moves an object out of its containing folder')
  await press('Z', ['mod']); await saved(); await press('Y', ['mod'])
  check(!(await saved()).objects.find(object => object.id === cubeId).parentId, 'Cmd/Ctrl+Y redoes an outward move')

  await select(figureId); await press('P')
  check(await mode() === 'Pose', 'P opens Pose mode for a poseable figure')
  await press('R')
  check(await active('Rotate selection'), 'R selects joint rotation in Pose mode')
  await press('G')
  check(await active('Move selection'), 'G selects IK movement for a built-in hand or foot')
  await press('S')
  check(await mode() === 'Pose' && await active('Move selection'), 'S does not enable unsupported scaling while posing joints')
  await evaluate(async () => { refSetValue(document.querySelector('[aria-label="Selected joint"]'), 'head'); await refTick() })
  await press('R'); await press('G')
  check(await active('Rotate selection'), 'G does not enable hand/foot IK on an unsupported body joint')
  await select(cubeId); await press('P'); await press('S')
  check(await mode() === 'Arrange' && await active('Scale selection'), 'Transform shortcuts return a static object from Pose to Arrange')
  await press('C')
  check(await mode() === 'Camera', 'C opens Camera mode')
  await press('R')
  check(await mode() === 'Arrange' && await active('Rotate selection'), 'R returns from Camera to object arrangement')
  await press('L')
  check(await mode() === 'Light', 'L opens Light mode')
  await press('G')
  check(await mode() === 'Arrange' && await active('Move selection'), 'G returns from Light to object movement')
  for (const [key, label] of [['O', 'Orbit view'], ['H', 'Pan view'], ['Z', 'Zoom view']]) {
    await press(key); check(await active(label), key + ' selects ' + label.toLowerCase())
  }
  await press('A'); await select(figureId)
  const beforeCamera = (await saved()).camera
  for (const key of ['1', '3', '7', 'F', '0']) await press(key)
  check(JSON.stringify((await saved()).camera) === JSON.stringify(beforeCamera), 'Editor view and framing shortcuts leave the saved shot camera unchanged')
  await press('F', ['shift'])
  check((await saved()).objects.find(object => object.id === figureId).position[1] < .1, 'Shift+F places the selected figure on the floor')
  await press('H', ['shift'])
  check(!(await saved()).objects.find(object => object.id === figureId).visible, 'Shift+H hides the selected object')
  await press('H', ['shift']); await saved(); await press('L', ['shift'])
  const locked = await saved()
  check(locked.objects.find(object => object.id === figureId).locked, 'Shift+L locks the selected object')
  await press('Delete'); await press('F', ['shift'])
  check(JSON.stringify((await saved()).objects) === JSON.stringify(locked.objects), 'Delete and place-on-floor shortcuts respect locked objects')
  await press('L', ['shift']); await saved(); await press('Escape')
  const noSelection = await saved()
  for (const [key, keys] of [['D', ['mod']], ['G', ['mod']], ['H', ['shift']], ['L', ['shift']], ['U', ['shift']]]) await press(key, keys)
  check(JSON.stringify((await saved()).objects) === JSON.stringify(noSelection.objects), 'Selection-only shortcuts do nothing when no object is selected')

  await select(figureId); await press('A')
  const beforeTyping = (await saved()).objects
  await evaluate(() => { const input = document.querySelector('[aria-label="Scene name"]'); input.focus(); input.select() })
  await window.webContents.insertText('Typing ')
  for (const key of ['P', 'L', 'A', 'G', 'R', 'S', 'O', 'H', 'Z']) await press(key, [], false, true)
  await press('D', ['mod'], false)
  check(await mode() === 'Arrange' && JSON.stringify((await saved()).objects) === JSON.stringify(beforeTyping), 'Typing shortcut letters or modifiers in a name field does not invoke scene actions')
  await evaluate(() => document.querySelector('[aria-label="Move to folder"]').focus())
  await press('P', [], false)
  check(await mode() === 'Arrange', 'Native select controls keep letter shortcuts local to the control')
  for (const editable of ['textarea', 'contenteditable']) {
    await evaluate(editable => {
      const node = document.createElement(editable === 'textarea' ? 'textarea' : 'div')
      node.id = 'shortcut-editable-test'
      if (editable === 'contenteditable') node.contentEditable = 'true'
      node.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'
      document.body.append(node); node.focus()
    }, editable)
    await press('P', [], false, true); await press('D', ['mod'], false)
    check(await mode() === 'Arrange', editable === 'textarea' ? 'Textarea editing blocks workspace shortcuts' : 'Contenteditable text blocks workspace shortcuts')
    await evaluate(() => document.querySelector('#shortcut-editable-test').remove())
  }
  await evaluate(mac => {
    document.querySelector('.ref-studio .reference3d-stage canvas').focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: mac, ctrlKey: !mac, isComposing: true, bubbles: true }))
  }, process.platform === 'darwin')
  check(JSON.stringify((await saved()).objects) === JSON.stringify(beforeTyping), 'IME composition cannot trigger scene duplication')
  await evaluate(async () => { refClick('Use as reference'); await refWait(() => document.querySelector('#ref-output-title'), 'shortcut isolation export dialog') })
  await press('D', ['mod'], false); await press('P', [], false)
  check(await mode() === 'Arrange', 'Export dialogs block workspace mode and object shortcuts')
  await press('Escape', [], false)
  await evaluate(() => refWait(() => !document.querySelector('#ref-output-title'), 'export dialog dismissed'))
  await press('/', ['mod'])
  await evaluate(() => refWait(() => document.querySelector('.shortcut-help-dialog[open]'), 'shortcut guide'))
  const guide = await evaluate(async () => {
    const { shortcutEntries } = await import('/common/ui-component/src/shortcuts.ts')
    const keys = shortcutEntries().map(entry => entry.keys.toLowerCase())
    const shown = [...document.querySelectorAll('.shortcut-help-list dl > div')].slice(1).map(row => row.querySelector('kbd').textContent.toLowerCase())
    return { keys, shown }
  })
  const expected = ['mod+d', 'mod+g', 'mod+shift+g', 'shift+n', 'shift+u', 'mod+a', 'a', 'p', 'c', 'l', 'g', 'r', 's', 'o', 'h', 'z', 'f', 'shift+f', '1', '3', '7', '0', 'shift+h', 'shift+l']
  check(expected.every(key => guide.keys.includes(key) && guide.shown.includes(key)), 'The shortcut guide lists the registered 3D workspace commands')
  check(new Set(guide.keys).size === guide.keys.length && new Set(guide.shown).size === guide.shown.length, 'Shortcut registration and guide rows contain no duplicate key bindings')
  await writeFile('/tmp/reference3d-shortcuts.png', (await window.webContents.capturePage()).toPNG())
  await press('D', ['mod'], false); await press('P', [], false)
  check(await mode() === 'Arrange', 'The shortcut guide isolates underlying workspace actions')
  await press('Escape', [], false)
  await evaluate(() => refWait(() => !document.querySelector('.shortcut-help-dialog[open]'), 'guide dismissed'))
  check(JSON.stringify((await saved()).objects) === JSON.stringify(beforeTyping), 'Text editing and both dialogs leave scene objects unchanged')
  return results
}
