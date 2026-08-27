import type { BrushPreset } from './types'

export const PAINT_PRESETS: BrushPreset[] = [
  { id: 'round', name: 'Round', group: 'Basic', renderer: 'line', animation: 'none' },
  { id: 'marker', name: 'Flat Marker', group: 'Basic', renderer: 'ribbon', animation: 'none', opacity: 0.75 },
  { id: 'pencil', name: 'Pencil', group: 'Basic', renderer: 'line', animation: 'jitter', opacity: 0.65, widthScale: 0.42 },
  { id: 'chalk', name: 'Chalk', group: 'Basic', renderer: 'particle', particle: 'dust', animation: 'jitter', density: 2.2, opacity: 0.45 },
  { id: 'spray', name: 'Spray', group: 'Basic', renderer: 'particle', particle: 'spray', animation: 'none', density: 3.2, opacity: 0.42 },
  { id: 'star', name: 'Star', group: 'Basic', renderer: 'stamp', stamp: 'star', spacing: 24, animation: 'none' },
  { id: 'heart', name: 'Heart', group: 'Basic', renderer: 'stamp', stamp: 'heart', spacing: 28, animation: 'none' },
  { id: 'ribbon', name: 'Ribbon', group: 'Basic', renderer: 'ribbon', animation: 'wave' },
  { id: 'wiggle', name: 'Wiggle', group: 'Motion', renderer: 'line', animation: 'wiggle' },
  { id: 'wave', name: 'Wave', group: 'Motion', renderer: 'line', animation: 'wave' },
  { id: 'pulse', name: 'Pulse', group: 'Motion', renderer: 'line', animation: 'pulse' },
  { id: 'flow', name: 'Flow', group: 'Motion', renderer: 'line', animation: 'flow' },
  { id: 'bounce', name: 'Bounce', group: 'Motion', renderer: 'line', animation: 'bounce' },
  { id: 'elastic', name: 'Elastic', group: 'Motion', renderer: 'line', animation: 'elastic' },
  { id: 'movingDots', name: 'Moving Dots', group: 'Patterns', renderer: 'stamp', stamp: 'dot', spacing: 18, animation: 'flow' },
  { id: 'movingStars', name: 'Moving Stars', group: 'Patterns', renderer: 'stamp', stamp: 'star', spacing: 26, animation: 'flow' },
  { id: 'marchingAnts', name: 'Marching Ants', group: 'Patterns', renderer: 'line', animation: 'flow', dash: [4, 5] },
  { id: 'sparkles', name: 'Sparkles', group: 'Particles', renderer: 'particle', particle: 'spark', density: 1.7, animation: 'float' },
  { id: 'snow', name: 'Snow', group: 'Particles', renderer: 'particle', particle: 'snow', density: 1.8, animation: 'fall' },
  { id: 'rain', name: 'Rain', group: 'Particles', renderer: 'particle', particle: 'rain', density: 2, animation: 'fall' },
  { id: 'fire', name: 'Fire', group: 'Particles', renderer: 'particle', particle: 'fire', density: 2, animation: 'rise', glow: 12 },
  { id: 'bubbles', name: 'Bubbles', group: 'Particles', renderer: 'particle', particle: 'bubble', density: 1.4, animation: 'rise' },
  { id: 'grass', name: 'Grass Sway', group: 'Nature', renderer: 'nature', nature: 'grass', animation: 'sway' },
  { id: 'leaves', name: 'Leaves Flutter', group: 'Nature', renderer: 'nature', nature: 'leaves', animation: 'flutter' },
  { id: 'flowers', name: 'Flowers Sway', group: 'Nature', renderer: 'nature', nature: 'flowers', animation: 'sway' },
  { id: 'vine', name: 'Vine Grow', group: 'Nature', renderer: 'nature', nature: 'vine', animation: 'grow' },
  { id: 'hair', name: 'Hair Strands', group: 'Anime', renderer: 'line', animation: 'sway', widthScale: 0.45 },
  { id: 'speedLines', name: 'Speed Lines', group: 'Anime', renderer: 'particle', particle: 'speed', density: 1.3, animation: 'flow' },
  { id: 'aura', name: 'Anime Aura', group: 'Anime', renderer: 'aura', animation: 'rise', glow: 14 },
  { id: 'neon', name: 'Neon', group: 'FX', renderer: 'line', animation: 'pulse', glow: 18 },
  { id: 'electric', name: 'Electric', group: 'FX', renderer: 'line', animation: 'jitter', glow: 14 },
  { id: 'rainbow', name: 'Rainbow', group: 'FX', renderer: 'line', animation: 'rainbow', glow: 8 },
  { id: 'drawOn', name: 'Draw On', group: 'Reveal', renderer: 'line', animation: 'drawOn' },
  { id: 'eraseOut', name: 'Erase Out', group: 'Reveal', renderer: 'line', animation: 'eraseOut' },
  { id: 'centerReveal', name: 'From Center', group: 'Reveal', renderer: 'line', animation: 'centerReveal' },
  { id: 'fadePath', name: 'Fade Along Path', group: 'Reveal', renderer: 'stamp', stamp: 'dot', spacing: 12, animation: 'fadePath' },
]

export function getPaintPreset(id: string): BrushPreset {
  return PAINT_PRESETS.find((preset) => preset.id === id) ?? PAINT_PRESETS[0]
}
