import type { DrawItem } from '../core/types'
import { canvas2dRenderer, type PaintRenderer } from './canvas2d'
import type { PaintContext } from './surfaces'

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 center;
layout(location=1) in vec2 radius;
layout(location=2) in vec2 rotation;
layout(location=3) in vec4 color;
uniform vec2 viewport;
out vec2 local;
out vec4 tint;
void main() {
  vec2 corners[6] = vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  // Pad the quad for antialiasing; the ellipse boundary remains at radius.
  vec2 corner = corners[gl_VertexID];
  vec2 p = corner * (radius + vec2(1.0));
  local = p / radius;
  p = vec2(p.x*rotation.x-p.y*rotation.y, p.x*rotation.y+p.y*rotation.x) + center;
  gl_Position = vec4(p.x/viewport.x*2.0-1.0, 1.0-p.y/viewport.y*2.0, 0, 1);
  tint = color;
}`
const fragment = `#version 300 es
precision highp float;
in vec2 local;
in vec4 tint;
out vec4 result;
void main() {
  vec2 dx = dFdx(local), dy = dFdy(local);
  float distance = length(local);
  float footprint = length(dx) + length(dy);
  float coverage = 0.0;
  if (distance < 1.0-footprint) coverage = 64.0;
  else if (distance <= 1.0+footprint) {
    for (int x=0; x<8; x++) for (int y=0; y<8; y++) {
      vec2 samplePosition = local + dx*((float(x)+0.5)/8.0-0.5) + dy*((float(y)+0.5)/8.0-0.5);
      coverage += 1.0-step(1.0, dot(samplePosition, samplePosition));
    }
  }
  float alpha = tint.a * coverage / 64.0;
  result = vec4(tint.rgb*alpha, alpha);
}`

/** Instanced circles/ellipses in painter order. Effects, images and paths use 2D. */
export function createGpuRenderer(): PaintRenderer & { dispose(): void; batches: number } {
  let surface: OffscreenCanvas | undefined
  let gl: WebGL2RenderingContext | null = null
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let viewport: WebGLUniformLocation | null = null
  let data = new Float32Array(0)
  const colors = new Map<string, number[]>()
  const api = {
    // Avoid a GPU readback into a new, differently-sized 2D surface per stroke.
    // The scheduler already holds the completed canvas between stepped frames.
    cacheRaster(items: DrawItem[], stamps: string[]) {
      return !gl || items.some(item => item.kind === 'segment' || (stamps[item.stampIndex] ?? stamps[0] ?? 'dot') !== 'dot')
    },
    batches: 0,
    paint(context: PaintContext, items: DrawItem[], stamps: string[]) {
      const matrix = context.getTransform()
      const eligible = items.length >= 64 && context.globalAlpha === 1 && context.globalCompositeOperation === 'source-over' &&
        matrix.a === 1 && matrix.d === 1 && matrix.b === 0 && matrix.c === 0 &&
        context.canvas.width <= 4096 && context.canvas.height <= 4096 && items.every(item =>
          item.kind !== 'segment' && (stamps[item.stampIndex] ?? stamps[0] ?? 'dot') === 'dot' &&
          item.blur === 0 && item.glow === 0 && item.shadow.opacity === 0 && /^#[0-9a-f]{6}$/i.test(item.color))
      if (!gl || !program || !buffer || gl.isContextLost() || !eligible) {
        canvas2dRenderer.paint(context, items, stamps); return
      }
      const width = context.canvas.width, height = context.canvas.height
      if (surface!.width !== width || surface!.height !== height) { surface!.width = width; surface!.height = height }
      gl.viewport(0, 0, width, height)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.uniform2f(viewport, width, height)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      const length = items.length * 10
      if (data.length < length) data = new Float32Array(length)
      let offset = 0
      for (const item of items) {
        let color = colors.get(item.color)
        if (!color) {
          const hex = Number.parseInt(item.color.slice(1), 16)
          color = [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
          if (colors.size >= 256) colors.clear()
          colors.set(item.color, color)
        }
        const radius = Math.max(0.4, item.size / 2)
        data.set([item.x + matrix.e, item.y + matrix.f, radius * (item.scaleX ?? 1), radius * (item.scaleY ?? 1),
          Math.cos(item.rotation), Math.sin(item.rotation), ...color, item.opacity], offset)
        offset += 10
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, length), gl.DYNAMIC_DRAW)
      for (const [location, size, offset] of [[0,2,0], [1,2,8], [2,2,16], [3,4,24]]) {
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 40, offset)
        gl.vertexAttribDivisor(location, 1)
      }
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, items.length)
      context.save(); context.setTransform(1,0,0,1,0,0); context.drawImage(surface!, 0, 0); context.restore()
      api.batches++
    },
    dispose() {
      if (gl) { gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext() }
      gl = null; data = new Float32Array(0); colors.clear()
    },
  }
  try {
    if (typeof OffscreenCanvas === 'undefined') return api
    surface = new OffscreenCanvas(1, 1)
    gl = surface.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!gl) return api
    const compile = (type: number, source: string) => {
      const shader = gl!.createShader(type)!
      gl!.shaderSource(shader, source); gl!.compileShader(shader)
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        const error = gl!.getShaderInfoLog(shader); gl!.deleteShader(shader); throw new Error(error ?? 'Shader compilation failed')
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment)
    program = gl.createProgram()!
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GPU renderer unavailable')
    buffer = gl.createBuffer(); viewport = gl.getUniformLocation(program, 'viewport')
  } catch { api.dispose() }
  return api
}
