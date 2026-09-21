/** Receives the browser-normalized canvas fill color when used by the preview. */
export function brushPreviewBackground(color: string, glow: number): string {
  let channels: number[] | undefined
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color.trim())?.[1]
  if (hex) {
    const rgb = hex.length <= 4 ? [...hex.slice(0, 3)].map(value => value + value).join('') : hex.slice(0, 6)
    channels = [0, 2, 4].map(offset => Number.parseInt(rgb.slice(offset, offset + 2), 16) / 255)
  } else {
    const rgb = /^rgba?\(([\d\s.,%/]+)\)$/i.exec(color.trim())?.[1]
    if (rgb) {
      channels = rgb.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(value =>
        Math.min(1, Math.max(0, Number.parseFloat(value) / (value.endsWith('%') ? 100 : 255))),
      )
    }
  }
  if (!channels || channels.length !== 3 || channels.some(value => !Number.isFinite(value))) return '#ffffff'
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  // Glow benefits from a dark surround, but dark ink still needs a light surface.
  return luminance > (glow > 0 ? 0.16 : 0.35) ? '#151923' : '#ffffff'
}
