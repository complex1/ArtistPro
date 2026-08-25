import { writeFileSync } from 'node:fs'

const categories = [
  ['entrance', 'Entrance'],
  ['exit', 'Exit'],
  ['emphasis', 'Emphasis'],
  ['transform', 'Transform / Movement'],
  ['loop', 'Continuous / Loop'],
  ['svg', 'SVG-Specific'],
  ['text', 'Text'],
  ['ui', 'Attention / UI'],
  ['advanced', 'Advanced'],
].map(([id, name]) => ({ id, name }))

const entrance = (channels, extra = {}) => ({
  kind: 'entrance',
  channels,
  ...extra,
})
const exit = (channels, extra = {}) => ({
  kind: 'exit',
  channels,
  ...extra,
})
const cycle = (spec) => ({ kind: 'cycle', ...spec })
const timeline = (channels, extra = {}) => ({
  kind: 'timeline',
  channels,
  ...extra,
})
const planned = () => ({ kind: 'planned' })

const opacityFrom = (from) => ({
  property: 'opacity',
  fromMode: 'absolute',
  from,
  toMode: 'rest',
})
const opacityTo = (to) => ({
  property: 'opacity',
  fromMode: 'rest',
  toMode: 'absolute',
  to,
})
const offset = (property, value, scale = 1) => ({
  property,
  fromMode: 'offset',
  from: value,
  fromScale: scale,
  toMode: 'rest',
})
const offsetConfig = (property, scale = 1) => ({
  property,
  fromMode: 'offset',
  fromConfig: 'distance',
  fromScale: scale,
  toMode: 'rest',
})
const offsetTo = (property, value, scale = 1) => ({
  property,
  fromMode: 'rest',
  toMode: 'offset',
  to: value,
  toScale: scale,
})
const offsetToConfig = (property, scale = 1) => ({
  property,
  fromMode: 'rest',
  toMode: 'offset',
  toConfig: 'distance',
  toScale: scale,
})
const multiplyFrom = (property, value) => ({
  property,
  fromMode: 'multiply',
  from: value,
  toMode: 'rest',
})
const multiplyTo = (property, value) => ({
  property,
  fromMode: 'rest',
  toMode: 'multiply',
  to: value,
})

const fadeSlide = (axis, scale, fade = true) => [
  ...(fade ? [opacityFrom(0)] : []),
  offsetConfig(axis, scale),
]
const fadeSlideOut = (axis, scale, fade = true) => [
  ...(fade ? [opacityTo(0)] : []),
  offsetToConfig(axis, scale),
]

const scaleBoth = (value, mode = 'from') =>
  ['scale.x', 'scale.y'].map((property) =>
    mode === 'from' ? multiplyFrom(property, value) : multiplyTo(property, value),
  )

const p = (id, name, category, description, recipe, extra = {}) => ({
  id,
  name,
  category,
  description,
  recipe,
  ...extra,
})

const presets = [
  p('fade-in', 'Fade In', 'entrance', 'Reveal the layer from transparent.', entrance([opacityFrom(0)])),
  p('fade-in-up', 'Fade In Up', 'entrance', 'Fade in while rising into place.', entrance(fadeSlide('position.y', 1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('fade-in-down', 'Fade In Down', 'entrance', 'Fade in while dropping into place.', entrance(fadeSlide('position.y', -1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('fade-in-left', 'Fade In Left', 'entrance', 'Fade in from the left.', entrance(fadeSlide('position.x', -1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('fade-in-right', 'Fade In Right', 'entrance', 'Fade in from the right.', entrance(fadeSlide('position.x', 1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('slide-in', 'Slide In', 'entrance', 'Move the layer into its resting position.', { kind: 'slide-in' }, { controls: ['duration', 'easing', 'slideDirection', 'distance'] }),
  p('slide-in-up', 'Slide In Up', 'entrance', 'Slide up into the resting position.', entrance(fadeSlide('position.y', 1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('slide-in-down', 'Slide In Down', 'entrance', 'Slide down into the resting position.', entrance(fadeSlide('position.y', -1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('slide-in-left', 'Slide In Left', 'entrance', 'Slide in from the left.', entrance(fadeSlide('position.x', -1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('slide-in-right', 'Slide In Right', 'entrance', 'Slide in from the right.', entrance(fadeSlide('position.x', 1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('zoom-in', 'Zoom In', 'entrance', 'Zoom from a larger scale into rest.', entrance(scaleBoth(1.4).concat([opacityFrom(0)])), { controls: ['duration', 'easing', 'startScale'] }),
  p('scale-in', 'Scale In', 'entrance', 'Grow the layer into its resting scale.', entrance([
    { property: 'scale.x', fromMode: 'multiply', fromConfig: 'startScale', toMode: 'rest' },
    { property: 'scale.y', fromMode: 'multiply', fromConfig: 'startScale', toMode: 'rest' },
  ]), { controls: ['duration', 'easing', 'startScale'] }),
  p('pop-in', 'Pop In', 'entrance', 'Pop in with a short overshoot.', timeline([
    { property: 'opacity', mode: 'absolute', keys: [0, 1, 1, 1] },
    { property: 'scale.x', mode: 'multiply', keys: [0.6, 1.12, 0.96, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [0.6, 1.12, 0.96, 1] },
  ])),
  p('bounce-in', 'Bounce In', 'entrance', 'Drop in and bounce to rest.', { kind: 'bounce-in' }, { controls: ['duration', 'easing', 'bounceHeight', 'bounceCount'] }),
  p('rotate-in', 'Rotate In', 'entrance', 'Rotate the layer into place.', entrance([
    { property: 'rotation', fromMode: 'offset', fromConfig: 'turns', fromScale: -360, toMode: 'rest' },
    opacityFrom(0),
  ]), { controls: ['duration', 'easing', 'spinDirection', 'turns'] }),
  p('spin', 'Spin In', 'entrance', 'Spin into the resting rotation.', entrance([
    { property: 'rotation', fromMode: 'offset', fromConfig: 'turns', fromScale: -360, toMode: 'rest' },
  ]), { controls: ['duration', 'easing', 'spinDirection', 'turns'] }),
  p('flip-in', 'Flip In', 'entrance', 'Flip onto the resting scale.', entrance([
    { property: 'scale.x', fromMode: 'multiply', from: -1, toMode: 'rest' },
    opacityFrom(0),
  ])),
  p('blur-in', 'Blur In', 'entrance', 'Sharpen into view.', planned(), { planned: true }),
  p('elastic-in', 'Elastic In', 'entrance', 'Spring into the resting scale.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [0.2, 1.18, 0.92, 1.04, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [0.2, 1.18, 0.92, 1.04, 1] },
    { property: 'opacity', mode: 'absolute', keys: [0, 1, 1, 1, 1] },
  ])),

  p('fade-out', 'Fade Out', 'exit', 'Fade the layer to transparent.', exit([opacityTo(0)])),
  p('fade-out-up', 'Fade Out Up', 'exit', 'Fade out while moving up.', exit(fadeSlideOut('position.y', -1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('fade-out-down', 'Fade Out Down', 'exit', 'Fade out while moving down.', exit(fadeSlideOut('position.y', 1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('fade-out-left', 'Fade Out Left', 'exit', 'Fade out to the left.', exit(fadeSlideOut('position.x', -1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('fade-out-right', 'Fade Out Right', 'exit', 'Fade out to the right.', exit(fadeSlideOut('position.x', 1)), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 40 } }),
  p('slide-out-up', 'Slide Out Up', 'exit', 'Slide up and off.', exit(fadeSlideOut('position.y', -1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('slide-out-down', 'Slide Out Down', 'exit', 'Slide down and off.', exit(fadeSlideOut('position.y', 1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('slide-out-left', 'Slide Out Left', 'exit', 'Slide out to the left.', exit(fadeSlideOut('position.x', -1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('slide-out-right', 'Slide Out Right', 'exit', 'Slide out to the right.', exit(fadeSlideOut('position.x', 1, false)), { controls: ['duration', 'easing', 'distance'] }),
  p('zoom-out', 'Zoom Out', 'exit', 'Zoom away from rest.', exit(scaleBoth(1.4, 'to').concat([opacityTo(0)]))),
  p('scale-out', 'Scale Out', 'exit', 'Shrink away from rest.', exit(scaleBoth(0, 'to'))),
  p('pop-out', 'Pop Out', 'exit', 'Pop out with a short overshoot.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 1.12, 0.8, 0] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 1.12, 0.8, 0] },
    { property: 'opacity', mode: 'absolute', keys: [1, 1, 0.4, 0] },
  ])),
  p('bounce-out', 'Bounce Out', 'exit', 'Bounce away from rest.', { kind: 'bounce-out' }, { controls: ['duration', 'easing', 'bounceHeight', 'bounceCount'] }),
  p('rotate-out', 'Rotate Out', 'exit', 'Rotate away from rest.', exit([
    { property: 'rotation', fromMode: 'rest', toMode: 'offset', toConfig: 'turns', toScale: -360 },
    opacityTo(0),
  ]), { controls: ['duration', 'easing', 'spinDirection', 'turns'] }),
  p('flip-out', 'Flip Out', 'exit', 'Flip away from rest.', exit([
    { property: 'scale.x', fromMode: 'rest', toMode: 'multiply', to: -1 },
    opacityTo(0),
  ])),
  p('blur-out', 'Blur Out', 'exit', 'Blur out of view.', planned(), { planned: true }),

  p('pulse', 'Pulse', 'emphasis', 'Pulse the layer scale repeatedly.', cycle({
    properties: ['scale.x', 'scale.y'],
    peakMode: 'multiply',
    peakConfig: 'pulseScale',
    countConfig: 'pulseCount',
  }), { controls: ['duration', 'easing', 'pulseScale', 'pulseCount'] }),
  p('heartbeat', 'Heartbeat', 'emphasis', 'A double-beat scale pulse.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 1.18, 1, 1.12, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 1.18, 1, 1.12, 1] },
  ])),
  p('bounce', 'Bounce', 'emphasis', 'Bounce vertically above rest.', cycle({
    properties: ['position.y'],
    peakMode: 'offset',
    peakConfig: 'bounceHeight',
    peakScale: -1,
    countConfig: 'bounceCount',
  }), { controls: ['duration', 'easing', 'bounceHeight', 'bounceCount'] }),
  p('shake', 'Shake', 'emphasis', 'Shake horizontally.', cycle({
    properties: ['position.x'],
    peakMode: 'offset',
    peak: 14,
    count: 4,
    alternate: true,
  })),
  p('wiggle', 'Wiggle', 'emphasis', 'Wiggle with rotation.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peak: 12,
    count: 4,
    alternate: true,
  })),
  p('wobble', 'Wobble', 'emphasis', 'Wobble on the skew axis.', cycle({
    properties: ['skew.x'],
    peakMode: 'offset',
    peak: 18,
    count: 3,
    alternate: true,
  })),
  p('swing', 'Swing', 'emphasis', 'Swing like a pendulum.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peak: 18,
    count: 3,
    alternate: true,
  })),
  p('jello', 'Jello', 'emphasis', 'Jello skew deformation.', timeline([
    { property: 'skew.x', mode: 'offset', keys: [0, 18, -12, 8, 0] },
    { property: 'skew.y', mode: 'offset', keys: [0, -8, 6, -3, 0] },
  ])),
  p('flash', 'Flash', 'emphasis', 'Flash opacity on and off.', timeline([
    { property: 'opacity', mode: 'absolute', keys: [1, 0, 1, 0, 1] },
  ])),
  p('blink', 'Blink', 'emphasis', 'Blink opacity twice.', timeline([
    { property: 'opacity', mode: 'absolute', keys: [1, 0, 1, 0, 1] },
  ])),
  p('rubber-band', 'Rubber Band', 'emphasis', 'Stretch and snap back.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 1.25, 0.75, 1.15, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 0.75, 1.25, 0.9, 1] },
  ])),
  p('tada', 'Tada', 'emphasis', 'Scale and rotate for attention.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 0.9, 1.1, 1.1, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 0.9, 1.1, 1.1, 1] },
    { property: 'rotation', mode: 'offset', keys: [0, -8, 8, -8, 0] },
  ])),
  p('pop', 'Pop', 'emphasis', 'A single scale pop.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 1.16, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 1.16, 1] },
  ])),
  p('spin-once', 'Spin', 'emphasis', 'Spin once around rest.', entrance([
    { property: 'rotation', fromMode: 'offset', from: -360, toMode: 'rest' },
  ]), { controls: ['duration', 'easing', 'spinDirection', 'turns'] }),
  p('jump', 'Jump', 'emphasis', 'Jump up and land.', timeline([
    { property: 'position.y', mode: 'offset', keys: [0, -48, 0] },
  ]), { controls: ['duration', 'easing', 'bounceHeight'] }),

  p('move-left', 'Move Left', 'transform', 'Offset left from rest.', exit([offsetToConfig('position.x', -1)]), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 80 } }),
  p('move-right', 'Move Right', 'transform', 'Offset right from rest.', exit([offsetToConfig('position.x', 1)]), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 80 } }),
  p('move-up', 'Move Up', 'transform', 'Offset up from rest.', exit([offsetToConfig('position.y', -1)]), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 80 } }),
  p('move-down', 'Move Down', 'transform', 'Offset down from rest.', exit([offsetToConfig('position.y', 1)]), { controls: ['duration', 'easing', 'distance'], defaults: { distance: 80 } }),
  p('move-x', 'Move X', 'transform', 'Move on the X axis by distance.', exit([
    { property: 'position.x', fromMode: 'rest', toMode: 'offset', toConfig: 'distance' },
  ]), { controls: ['duration', 'easing', 'distance'] }),
  p('move-y', 'Move Y', 'transform', 'Move on the Y axis by distance.', exit([
    { property: 'position.y', fromMode: 'rest', toMode: 'offset', toConfig: 'distance' },
  ]), { controls: ['duration', 'easing', 'distance'] }),
  p('scale-up', 'Scale Up', 'transform', 'Scale up from rest.', exit(scaleBoth(1.25, 'to')), { controls: ['duration', 'easing', 'pulseScale'] }),
  p('scale-down', 'Scale Down', 'transform', 'Scale down from rest.', exit(scaleBoth(0.75, 'to')), { controls: ['duration', 'easing', 'startScale'] }),
  p('rotate-left', 'Rotate Left', 'transform', 'Rotate counter-clockwise.', exit([
    { property: 'rotation', fromMode: 'rest', toMode: 'offset', to: 90 },
  ])),
  p('rotate-right', 'Rotate Right', 'transform', 'Rotate clockwise.', exit([
    { property: 'rotation', fromMode: 'rest', toMode: 'offset', to: -90 },
  ])),
  p('flip-x', 'Flip X', 'transform', 'Flip horizontally.', exit([multiplyTo('scale.x', -1)])),
  p('flip-y', 'Flip Y', 'transform', 'Flip vertically.', exit([multiplyTo('scale.y', -1)])),
  p('skew-x', 'Skew X', 'transform', 'Skew on X.', exit([offsetTo('skew.x', 20)])),
  p('skew-y', 'Skew Y', 'transform', 'Skew on Y.', exit([offsetTo('skew.y', 20)])),

  p('spin-loop', 'Spin', 'loop', 'Continuous spin around rest.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peakConfig: 'turns',
    peakScale: 360,
    count: 1,
    loopToStart: true,
  }), { controls: ['duration', 'easing', 'spinDirection', 'turns'] }),
  p('slow-spin', 'Slow Spin', 'loop', 'A slower continuous spin.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peakConfig: 'turns',
    peakScale: 360,
    count: 1,
    loopToStart: true,
  }), { controls: ['duration', 'easing', 'spinDirection', 'turns'], defaults: { duration: 4 } }),
  p('float', 'Float', 'loop', 'Gently float up and down.', cycle({
    properties: ['position.y'],
    peakMode: 'offset',
    peak: -16,
    count: 2,
  })),
  p('hover', 'Hover', 'loop', 'Hover in place.', cycle({
    properties: ['position.y'],
    peakMode: 'offset',
    peak: -8,
    count: 2,
  })),
  p('bob', 'Bob', 'loop', 'Bob up and down.', cycle({
    properties: ['position.y'],
    peakMode: 'offset',
    peak: -24,
    count: 3,
  })),
  p('sway', 'Sway', 'loop', 'Sway left and right.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peak: 8,
    count: 2,
    alternate: true,
  })),
  p('breathe', 'Breathe', 'loop', 'Slow scale breathing.', cycle({
    properties: ['scale.x', 'scale.y'],
    peakMode: 'multiply',
    peak: 1.06,
    count: 2,
  })),
  p('pulse-loop', 'Pulse Loop', 'loop', 'Looping scale pulse.', cycle({
    properties: ['scale.x', 'scale.y'],
    peakMode: 'multiply',
    peakConfig: 'pulseScale',
    countConfig: 'pulseCount',
  }), { controls: ['duration', 'easing', 'pulseScale', 'pulseCount'] }),
  p('bounce-loop', 'Bounce Loop', 'loop', 'Looping bounce.', cycle({
    properties: ['position.y'],
    peakMode: 'offset',
    peakConfig: 'bounceHeight',
    peakScale: -1,
    countConfig: 'bounceCount',
  }), { controls: ['duration', 'easing', 'bounceHeight', 'bounceCount'] }),
  p('shake-loop', 'Shake Loop', 'loop', 'Looping shake.', cycle({
    properties: ['position.x'],
    peakMode: 'offset',
    peak: 10,
    count: 6,
    alternate: true,
  })),
  p('pendulum', 'Pendulum', 'loop', 'Pendulum rotation.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peak: 22,
    count: 2,
    alternate: true,
  })),
  p('orbit', 'Orbit', 'loop', 'Orbit around the rest position.', timeline([
    { property: 'position.x', mode: 'offset', keys: [0, 36, 0, -36, 0] },
    { property: 'position.y', mode: 'offset', keys: [-36, 0, 36, 0, -36] },
  ])),
  p('wave', 'Wave', 'loop', 'Wave along X.', timeline([
    { property: 'position.x', mode: 'offset', keys: [0, 12, 0, -12, 0] },
    { property: 'position.y', mode: 'offset', keys: [0, -8, 0, -8, 0] },
  ])),
  p('flicker', 'Flicker', 'loop', 'Flicker opacity.', timeline([
    { property: 'opacity', mode: 'absolute', keys: [1, 0.35, 1, 0.55, 1] },
  ])),

  p('draw-path', 'Draw Path', 'svg', 'Reveal a stroke from start to end.', entrance([
    { property: 'path.trimEnd', fromMode: 'absolute', from: 0, toMode: 'absolute', to: 1 },
    { property: 'path.trimStart', fromMode: 'absolute', from: 0, toMode: 'absolute', to: 0 },
  ]), { requires: ['path'] }),
  p('erase-path', 'Erase Path', 'svg', 'Erase a stroke from start to end.', entrance([
    { property: 'path.trimStart', fromMode: 'absolute', from: 0, toMode: 'absolute', to: 1 },
  ]), { requires: ['path'] }),
  p('trace-path', 'Trace Path', 'svg', 'Trace a short window along the path.', timeline([
    { property: 'path.trimStart', mode: 'absolute', keys: [0, 0.7] },
    { property: 'path.trimEnd', mode: 'absolute', keys: [0.3, 1] },
  ]), { requires: ['path'] }),
  p('follow-path', 'Follow Path', 'svg', 'Follow another path with motion path.', planned(), { planned: true }),
  p('morph-shape', 'Morph Shape', 'svg', 'Morph between path shapes.', planned(), { planned: true }),
  p('fill-reveal', 'Fill Reveal', 'svg', 'Reveal fill by fading opacity in.', entrance([opacityFrom(0)])),
  p('stroke-reveal', 'Stroke Reveal', 'svg', 'Fade the stroke in.', entrance([
    { property: 'strokeWidth', fromMode: 'absolute', from: 0, toMode: 'rest' },
  ])),
  p('stroke-dash', 'Stroke Dash', 'svg', 'Travel dashes along the path.', cycle({
    properties: ['path.trimOffset'],
    peakMode: 'offset',
    peak: 1,
    count: 1,
    holdRest: false,
    loopToStart: true,
  }), { requires: ['path'] }),
  p('stroke-pulse', 'Stroke Pulse', 'svg', 'Pulse stroke width.', cycle({
    properties: ['strokeWidth'],
    peakMode: 'multiply',
    peak: 1.8,
    count: 2,
  })),
  p('color-change', 'Color Change', 'svg', 'Tween fill color.', entrance([
    { property: 'fill', fromMode: 'absolute', from: '#4f8cff', toMode: 'rest' },
  ])),
  p('gradient-shift', 'Gradient Shift', 'svg', 'Shift a gradient fill.', planned(), { planned: true }),
  p('mask-reveal', 'Mask Reveal', 'svg', 'Reveal through a mask.', planned(), { planned: true }),
  p('clip-reveal', 'Clip Reveal', 'svg', 'Reveal through a clip path.', planned(), { planned: true }),

  p('typewriter', 'Typewriter', 'text', 'Reveal text one character at a time.', planned(), { planned: true, requires: ['text'] }),
  p('character-fade', 'Character Fade', 'text', 'Fade characters in sequence.', planned(), { planned: true, requires: ['text'] }),
  p('character-slide-up', 'Character Slide Up', 'text', 'Slide characters up in sequence.', planned(), { planned: true, requires: ['text'] }),
  p('character-pop', 'Character Pop', 'text', 'Pop characters in sequence.', planned(), { planned: true, requires: ['text'] }),
  p('word-reveal', 'Word Reveal', 'text', 'Reveal words in sequence.', planned(), { planned: true, requires: ['text'] }),
  p('line-reveal', 'Line Reveal', 'text', 'Reveal lines in sequence.', planned(), { planned: true, requires: ['text'] }),
  p('text-wave', 'Text Wave', 'text', 'Wave the text baseline.', planned(), { planned: true, requires: ['text'] }),
  p('text-bounce', 'Text Bounce', 'text', 'Bounce text into place.', planned(), { planned: true, requires: ['text'] }),
  p('text-blur-in', 'Text Blur In', 'text', 'Blur text into view.', planned(), { planned: true, requires: ['text'] }),
  p('text-tracking-in', 'Text Tracking In', 'text', 'Tighten tracking into rest.', entrance([
    { property: 'letterSpacing', fromMode: 'offset', from: 12, toMode: 'rest' },
    opacityFrom(0),
  ]), { requires: ['text'] }),

  p('button-press', 'Button Press', 'ui', 'Press in and release.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 0.92, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 0.92, 1] },
  ])),
  p('button-hover', 'Button Hover', 'ui', 'Lift slightly on hover.', exit([
    offsetTo('position.y', -6),
    ...scaleBoth(1.04, 'to'),
  ])),
  p('toggle', 'Toggle', 'ui', 'A quick on/off scale.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 0.85, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 0.85, 1] },
    { property: 'rotation', mode: 'offset', keys: [0, -8, 0] },
  ])),
  p('notification-pop', 'Notification Pop', 'ui', 'Pop in from above.', entrance([
    opacityFrom(0),
    offset('position.y', -24),
    ...scaleBoth(0.92),
  ])),
  p('success-check', 'Success Check', 'ui', 'A confirming pop.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [0.8, 1.12, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [0.8, 1.12, 1] },
    { property: 'opacity', mode: 'absolute', keys: [0, 1, 1] },
  ])),
  p('error-shake', 'Error Shake', 'ui', 'Shake to signal an error.', cycle({
    properties: ['position.x'],
    peakMode: 'offset',
    peak: 16,
    count: 4,
    alternate: true,
  })),
  p('loading-spin', 'Loading Spin', 'ui', 'Spin for a loading state.', cycle({
    properties: ['rotation'],
    peakMode: 'offset',
    peak: 360,
    count: 1,
    holdRest: false,
    loopToStart: true,
  })),
  p('loading-pulse', 'Loading Pulse', 'ui', 'Pulse for a loading state.', cycle({
    properties: ['scale.x', 'scale.y'],
    peakMode: 'multiply',
    peak: 1.12,
    count: 2,
  })),
  p('progress-fill', 'Progress Fill', 'ui', 'Fill from empty to rest width.', entrance([
    { property: 'scale.x', fromMode: 'multiply', from: 0.05, toMode: 'rest' },
  ])),
  p('tooltip-in', 'Tooltip In', 'ui', 'Fade and rise into view.', entrance([
    opacityFrom(0),
    offset('position.y', 10),
  ])),
  p('tooltip-out', 'Tooltip Out', 'ui', 'Fade and drop out of view.', exit([
    opacityTo(0),
    offsetTo('position.y', 10),
  ])),

  p('spring', 'Spring', 'advanced', 'Spring into rest with overshoot.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [0.7, 1.14, 0.96, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [0.7, 1.14, 0.96, 1] },
  ])),
  p('elastic', 'Elastic', 'advanced', 'Elastic scale into rest.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [0.4, 1.2, 0.88, 1.06, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [0.4, 1.2, 0.88, 1.06, 1] },
  ])),
  p('overshoot', 'Overshoot', 'advanced', 'Overshoot position then settle.', timeline([
    { property: 'position.y', mode: 'offset', keys: [40, -12, 4, 0] },
  ])),
  p('squash-stretch', 'Squash & Stretch', 'advanced', 'Squash and stretch around rest.', timeline([
    { property: 'scale.x', mode: 'multiply', keys: [1, 1.25, 0.85, 1] },
    { property: 'scale.y', mode: 'multiply', keys: [1, 0.75, 1.18, 1] },
  ])),
  p('anticipation', 'Anticipation', 'advanced', 'Wind up before moving forward.', timeline([
    { property: 'position.x', mode: 'offset', keys: [0, -18, 48] },
    { property: 'rotation', mode: 'offset', keys: [0, 8, -4] },
  ])),
  p('follow-through', 'Follow Through', 'advanced', 'Settle after a move.', timeline([
    { property: 'position.x', mode: 'offset', keys: [-40, 8, 0] },
    { property: 'rotation', mode: 'offset', keys: [-12, 6, 0] },
  ])),
  p('motion-path', 'Motion Path', 'advanced', 'Bind the layer to a motion path.', planned(), { planned: true }),
  p('arc-movement', 'Arc Movement', 'advanced', 'Move along a shallow arc.', timeline([
    { property: 'position.x', mode: 'offset', keys: [-60, 0] },
    { property: 'position.y', mode: 'offset', keys: [0, -28, 0] },
  ])),
  p('parallax', 'Parallax', 'advanced', 'A slower depth offset.', exit([offsetTo('position.x', 24), offsetTo('position.y', 8)])),
  p('stagger', 'Stagger', 'advanced', 'Stagger child layers.', planned(), { planned: true }),
  p('random-wiggle', 'Random Wiggle', 'advanced', 'Irregular wiggle around rest.', timeline([
    { property: 'position.x', mode: 'offset', keys: [0, 8, -6, 10, -4, 0] },
    { property: 'position.y', mode: 'offset', keys: [0, -5, 7, -3, 6, 0] },
    { property: 'rotation', mode: 'offset', keys: [0, 4, -6, 3, -2, 0] },
  ])),
  p('physics-bounce', 'Physics Bounce', 'advanced', 'A decaying physics-style bounce.', { kind: 'bounce' }, { controls: ['duration', 'easing', 'bounceHeight', 'bounceCount'] }),
]

const catalog = {
  defaults: {
    duration: 1,
    easing: 'power2.inOut',
    slideDirection: 'left',
    distance: 120,
    startScale: 0,
    spinDirection: 'clockwise',
    turns: 1,
    bounceHeight: 80,
    bounceCount: 2,
    pulseScale: 1.2,
    pulseCount: 2,
  },
  categories,
  presets,
}

writeFileSync(
  new URL('../src/model/animationPresets.json', import.meta.url),
  `${JSON.stringify(catalog, null, 2)}\n`,
)
console.log(`wrote ${presets.length} presets`)
