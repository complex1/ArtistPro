import type { GpuBackend } from './backend'
import { createCpuBackend } from './backendCpu'

const VERT = `#version 300 es
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUv);
}
`

const WARP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uDisp;
uniform vec2 uSize;
out vec4 fragColor;
void main() {
  vec2 disp = texture(uDisp, vUv).rg * 2.0 - 1.0;
  vec2 uv = vUv - disp * 32.0 / uSize;
  fragColor = texture(uTex, uv);
}
`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(log ?? 'compile')
  }
  return shader
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()
  if (!p) throw new Error('program')
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  }
  return p
}

export function createWebgl2Backend(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): GpuBackend {
  const gl = canvas.getContext('webgl2', {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    alpha: true,
  })
  if (!gl) throw new Error('WebGL2 is not available')
  const cpu = createCpuBackend(width, height, null)
  const blit = program(gl, VERT, FRAG)
  const warpProg = program(gl, VERT, WARP)
  const vao = gl.createVertexArray()
  const buffer = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0, -1, 1, 0, 0]),
    gl.STATIC_DRAW,
  )
  const stride = 16
  const aPos = gl.getAttribLocation(blit, 'aPos')
  const aUv = gl.getAttribLocation(blit, 'aUv')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(aUv)
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8)

  const display = gl.createTexture()
  const dispTex = gl.createTexture()
  const upload = (texture: WebGLTexture | null, pixels: Uint8ClampedArray, w: number, h: number) => {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  }

  const drawTexture = (prog: WebGLProgram) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(prog)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  const backend: GpuBackend = {
    kind: 'webgl2',
    get width() {
      return cpu.width
    },
    get height() {
      return cpu.height
    },
    createSurface: (id) => cpu.createSurface(id),
    destroySurface: (id) => cpu.destroySurface(id),
    clear: (id, color) => cpu.clear(id, color),
    fillRect: (id, rect, color) => cpu.fillRect(id, rect, color),
    stampDab: (target, dab, clip) => cpu.stampDab(target, dab, clip),
    beginStroke: () => cpu.beginStroke(),
    stampStrokeDab: (dab, clip) => cpu.stampStrokeDab(dab, clip),
    previewStroke: (target, color, opacity, erase) =>
      cpu.previewStroke(target, color, opacity, erase),
    applyStrokeFromSource: (source, target, color, opacity, erase, rect) =>
      cpu.applyStrokeFromSource(source, target, color, opacity, erase, rect),
    mergeStroke: (target, color, opacity, erase) =>
      cpu.mergeStroke(target, color, opacity, erase),
    clearStroke: () => cpu.clearStroke(),
    read: (id, rect) => cpu.read(id, rect),
    write: (id, pixels, rect) => cpu.write(id, pixels, rect),
    copySurface: (src, dst) => cpu.copySurface(src, dst),
    warp: (src, dst, sample, clip, options) => cpu.warp(src, dst, sample, clip, options),
    composite: (layers, background) => cpu.composite(layers, background),
    present(pixels) {
      if (canvas.width !== cpu.width) canvas.width = cpu.width
      if (canvas.height !== cpu.height) canvas.height = cpu.height
      upload(display, pixels, cpu.width, cpu.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, display)
      gl.useProgram(blit)
      gl.uniform1i(gl.getUniformLocation(blit, 'uTex'), 0)
      drawTexture(blit)
    },
    resize(nextWidth, nextHeight) {
      cpu.resize(nextWidth, nextHeight)
    },
    dispose() {
      cpu.dispose()
      gl.deleteProgram(blit)
      gl.deleteProgram(warpProg)
      gl.deleteTexture(display)
      gl.deleteTexture(dispTex)
    },
  }
  return backend
}
