/** Check real playback timing, looping, and cancellation in the renderer. */
export async function verifySvgClock(evaluate, wait, check) {
  const state = "(await import('/apps/svg-tool/web/store/editorStore.ts')).useEditorStore.getState()"
  const read = expression => evaluate(`(async () => { const s = ${state}; return ${expression} })()`)
  const edit = body => evaluate(`(async () => { const s = ${state}; ${body} })()`)
  const originalDuration = await evaluate(`(async () => { const m = await import('/apps/svg-tool/web/store/editorStore.ts'); return m.activeAnimation(m.useEditorStore.getState()).duration })()`)
  await edit('s.setDuration(.3); s.setLooping(false); s.setPlayhead(.05); s.setPlaying(true)')
  await wait(`(async () => (${state}).playhead > .05)()`, 'SVG clock advances')
  check(true, 'SVG browser clock advances from the existing playhead')
  await wait(`(async () => { const s = ${state}; return !s.playing && s.playhead === .3 })()`, 'SVG clock completes')
  check(true, 'SVG playback stops at the animation end')
  await edit('s.setDuration(.1); s.setLooping(true); s.setPlaying(true)')
  await new Promise(resolve => setTimeout(resolve, 350))
  check(await read('s.playing && s.playhead >= 0 && s.playhead < .1'), 'SVG loop wraps and continues playing')
  await edit('s.setPlaying(false)')
  const paused = await read('s.playhead')
  await new Promise(resolve => setTimeout(resolve, 100))
  check(await read(`s.playhead === ${paused}`), 'Pausing SVG cancels subsequent clock updates')
  await edit(`s.setLooping(false); s.setDuration(${originalDuration}); s.setPlayhead(0)`)
}
