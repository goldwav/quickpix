import quadVert from './shaders/quad.vert?raw'
import adjustFrag from './shaders/adjust.frag?raw'
import detailFrag from './shaders/detail.frag?raw'
import { bakeCurveLut } from '@shared/curve'
import { IDENTITY_CURVE, type CropState, type EditParams } from '@shared/editParams'

export interface HistogramData {
  r: Uint32Array
  g: Uint32Array
  b: Uint32Array
  luma: Uint32Array
  /** Number of pixels sampled (for normalization). */
  total: number
}

export interface FitRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ViewTransform {
  /** 1 = fit; >1 zooms in. */
  zoom: number
  /** Pan offset in device pixels. */
  panX: number
  panY: number
}

export interface RenderOptions {
  /** Render the full uncropped frame (used by the crop tool). */
  ignoreCrop?: boolean
  view?: ViewTransform
}

const HIST_SIZE = 128
/** Cap on the intermediate FBO used by the detail pass (memory guard). */
const MAX_WORK_DIM = 4096

interface CropUniforms {
  originX: number
  originY: number
  sizeX: number
  sizeY: number
  cos: number
  sin: number
  scale: number
  outW: number
  outH: number
}

/**
 * WebGL2 preview pipeline. Pass 1 (adjust) does geometry + all pointwise
 * color work; pass 2 (detail) adds sharpen/clarity and only runs when needed.
 * render() is a pure function of (image texture, EditParams).
 */
export class GLPipeline {
  private gl: WebGL2RenderingContext
  private adjustProg: WebGLProgram
  private detailProg: WebGLProgram
  private uniformCache = new Map<string, WebGLUniformLocation | null>()
  private imageTex: WebGLTexture | null = null
  private curveTex: WebGLTexture
  private histFbo: WebGLFramebuffer
  private histTex: WebGLTexture
  private histPixels = new Uint8Array(HIST_SIZE * HIST_SIZE * 4)
  private workFbo: WebGLFramebuffer | null = null
  private workTex: WebGLTexture | null = null
  private workW = 0
  private workH = 0
  private lastCurveKey = ''
  /** Letterbox rect of the last on-screen render, in device pixels. */
  lastFitRect: FitRect = { x: 0, y: 0, w: 0, h: 0 }
  imageWidth = 0
  imageHeight = 0

  constructor(private canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer keeps the canvas readable after compositing —
    // needed for screenshot-based testing and cheap "copy preview" features.
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl

    this.adjustProg = this.createProgram(quadVert, adjustFrag)
    this.detailProg = this.createProgram(quadVert, detailFrag)

    // Identity curve LUT so the shader can sample unconditionally.
    this.curveTex = this.createTexture(gl.LINEAR)
    this.uploadCurve(bakeCurveLut(IDENTITY_CURVE))

    // Small offscreen target for histogram sampling.
    this.histTex = this.createTexture(gl.NEAREST)
    gl.bindTexture(gl.TEXTURE_2D, this.histTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, HIST_SIZE, HIST_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    this.histFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.histFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.histTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>)['__qpPipeline'] = this
    }
  }

  setImage(bitmap: ImageBitmap): void {
    const gl = this.gl
    if (this.imageTex) gl.deleteTexture(this.imageTex)
    this.imageTex = this.createTexture(gl.LINEAR)
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    this.imageWidth = bitmap.width
    this.imageHeight = bitmap.height
  }

  get hasImage(): boolean {
    return this.imageTex !== null
  }

  /** Draw the adjusted image, letterboxed into the current canvas size. */
  render(params: EditParams, opts: RenderOptions = {}): void {
    const gl = this.gl
    if (!this.imageTex) return

    this.updateCurveIfNeeded(params)
    const crop = this.cropUniforms(opts.ignoreCrop ? null : params.crop)
    const needDetail = params.sharpen > 0 || params.clarity !== 0

    const cw = this.canvas.width
    const ch = this.canvas.height
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, cw, ch)
    gl.clearColor(0.094, 0.094, 0.094, 1) // matches --bg-app #181818
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Aspect-fit letterbox with a small margin, then apply zoom/pan.
    const margin = 24
    const zoom = opts.view?.zoom ?? 1
    const scale = Math.min((cw - margin * 2) / crop.outW, (ch - margin * 2) / crop.outH) * zoom
    const w = Math.max(1, Math.round(crop.outW * scale))
    const h = Math.max(1, Math.round(crop.outH * scale))
    const fit: FitRect = {
      x: Math.round((cw - w) / 2 + (opts.view?.panX ?? 0)),
      y: Math.round((ch - h) / 2 + (opts.view?.panY ?? 0)),
      w,
      h
    }
    this.lastFitRect = fit

    if (!needDetail) {
      gl.viewport(fit.x, fit.y, fit.w, fit.h)
      this.drawAdjust(params, crop, 1)
      return
    }

    // Two-pass: adjust into work FBO, then detail to screen.
    const workScale = Math.min(1, MAX_WORK_DIM / Math.max(crop.outW, crop.outH))
    const ww = Math.max(1, Math.round(crop.outW * workScale))
    const wh = Math.max(1, Math.round(crop.outH * workScale))
    this.ensureWorkTarget(ww, wh)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.workFbo)
    gl.viewport(0, 0, ww, wh)
    this.drawAdjust(params, crop, 0)

    gl.bindTexture(gl.TEXTURE_2D, this.workTex)
    gl.generateMipmap(gl.TEXTURE_2D)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(fit.x, fit.y, fit.w, fit.h)
    this.drawDetail(params, ww, wh, 1)
  }

  /** Render small and read back to build the histogram. Call throttled. */
  computeHistogram(params: EditParams): HistogramData {
    const gl = this.gl
    const r = new Uint32Array(256)
    const g = new Uint32Array(256)
    const b = new Uint32Array(256)
    const luma = new Uint32Array(256)
    if (!this.imageTex) return { r, g, b, luma, total: 0 }

    this.updateCurveIfNeeded(params)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.histFbo)
    gl.viewport(0, 0, HIST_SIZE, HIST_SIZE)
    // Detail pass barely affects a 128px histogram — adjust pass is enough.
    this.drawAdjust(params, this.cropUniforms(params.crop), 0)
    gl.readPixels(0, 0, HIST_SIZE, HIST_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, this.histPixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    const px = this.histPixels
    for (let i = 0; i < px.length; i += 4) {
      const pr = px[i]
      const pg = px[i + 1]
      const pb = px[i + 2]
      r[pr]++
      g[pg]++
      b[pb]++
      luma[Math.round(0.2126 * pr + 0.7152 * pg + 0.0722 * pb)]++
    }
    return { r, g, b, luma, total: HIST_SIZE * HIST_SIZE }
  }

  dispose(): void {
    const gl = this.gl
    if (this.imageTex) gl.deleteTexture(this.imageTex)
    if (this.workTex) gl.deleteTexture(this.workTex)
    if (this.workFbo) gl.deleteFramebuffer(this.workFbo)
    gl.deleteTexture(this.curveTex)
    gl.deleteTexture(this.histTex)
    gl.deleteFramebuffer(this.histFbo)
    gl.deleteProgram(this.adjustProg)
    gl.deleteProgram(this.detailProg)
  }

  // ---------- internals ----------

  /** Output dims + rotation uniforms for a crop (or identity for null). */
  private cropUniforms(crop: CropState | null): CropUniforms {
    const W = this.imageWidth
    const H = this.imageHeight
    if (!crop) {
      return { originX: 0, originY: 0, sizeX: 1, sizeY: 1, cos: 1, sin: 0, scale: 1, outW: W, outH: H }
    }
    const theta = (crop.angle * Math.PI) / 180
    const ac = Math.abs(Math.cos(theta))
    const as = Math.abs(Math.sin(theta))
    // Auto-fill: shrink the sampling frame so the rotated frame stays inside
    // the source image (no blank corners while straightening).
    const k = Math.min(W / (W * ac + H * as), H / (W * as + H * ac))
    return {
      originX: crop.left,
      originY: crop.top,
      sizeX: crop.width,
      sizeY: crop.height,
      cos: Math.cos(theta),
      sin: Math.sin(theta),
      scale: k,
      outW: Math.max(1, Math.round(crop.width * W)),
      outH: Math.max(1, Math.round(crop.height * H))
    }
  }

  private drawAdjust(params: EditParams, crop: CropUniforms, flipY: number): void {
    const gl = this.gl
    gl.useProgram(this.adjustProg)
    const loc = (n: string): WebGLUniformLocation | null => this.loc(this.adjustProg, 'a:', n)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex)
    gl.uniform1i(loc('u_image'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
    gl.uniform1i(loc('u_curve'), 1)

    gl.uniform1f(loc('u_flipY'), flipY)
    gl.uniform1f(loc('u_exposure'), params.exposure)
    gl.uniform1f(loc('u_contrast'), params.contrast / 100)
    gl.uniform1f(loc('u_highlights'), params.highlights / 100)
    gl.uniform1f(loc('u_shadows'), params.shadows / 100)
    gl.uniform1f(loc('u_whites'), params.whites / 100)
    gl.uniform1f(loc('u_blacks'), params.blacks / 100)
    gl.uniform1f(loc('u_temp'), params.temp / 100)
    gl.uniform1f(loc('u_tint'), params.tint / 100)
    gl.uniform1f(loc('u_vibrance'), params.vibrance / 100)
    gl.uniform1f(loc('u_saturation'), params.saturation / 100)
    gl.uniform1f(loc('u_vignette'), params.vignette / 100)
    gl.uniform1f(loc('u_grain'), params.grain / 100)

    gl.uniform1fv(loc('u_hslHue'), params.hsl.hue.map((v) => v / 100))
    gl.uniform1fv(loc('u_hslSat'), params.hsl.sat.map((v) => v / 100))
    gl.uniform1fv(loc('u_hslLum'), params.hsl.lum.map((v) => v / 100))
    gl.uniform1f(loc('u_splitShadowHue'), params.split.shadowHue / 360)
    gl.uniform1f(loc('u_splitShadowSat'), params.split.shadowSat / 100)
    gl.uniform1f(loc('u_splitHighHue'), params.split.highlightHue / 360)
    gl.uniform1f(loc('u_splitHighSat'), params.split.highlightSat / 100)
    gl.uniform1f(loc('u_splitBalance'), params.split.balance / 100)

    gl.uniform2f(loc('u_cropOrigin'), crop.originX, crop.originY)
    gl.uniform2f(loc('u_cropSize'), crop.sizeX, crop.sizeY)
    gl.uniform2f(loc('u_imageSize'), this.imageWidth, this.imageHeight)
    gl.uniform1f(loc('u_rotCos'), crop.cos)
    gl.uniform1f(loc('u_rotSin'), crop.sin)
    gl.uniform1f(loc('u_rotScale'), crop.scale)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private drawDetail(params: EditParams, texW: number, texH: number, flipY: number): void {
    const gl = this.gl
    gl.useProgram(this.detailProg)
    const loc = (n: string): WebGLUniformLocation | null => this.loc(this.detailProg, 'd:', n)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.workTex)
    gl.uniform1i(loc('u_tex'), 0)
    gl.uniform1f(loc('u_flipY'), flipY)
    gl.uniform2f(loc('u_texel'), 1 / texW, 1 / texH)
    gl.uniform1f(loc('u_sharpen'), params.sharpen / 100)
    gl.uniform1f(loc('u_clarity'), params.clarity / 100)
    // Blur radius for clarity scales with resolution: level ≈ size/64 px.
    gl.uniform1f(loc('u_clarityLod'), Math.max(2, Math.log2(Math.max(texW, texH) / 64)))

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private ensureWorkTarget(w: number, h: number): void {
    if (this.workTex && this.workW === w && this.workH === h) return
    const gl = this.gl
    if (this.workTex) gl.deleteTexture(this.workTex)
    if (this.workFbo) gl.deleteFramebuffer(this.workFbo)
    this.workTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.workTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h)
    this.workFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.workFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.workTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.workW = w
    this.workH = h
  }

  private updateCurveIfNeeded(params: EditParams): void {
    const key = JSON.stringify(params.curve)
    if (key === this.lastCurveKey) return
    this.lastCurveKey = key
    this.uploadCurve(bakeCurveLut(params.curve))
  }

  private uploadCurve(lut: Uint8Array): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut)
  }

  private createTexture(filter: number): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    return tex
  }

  private loc(program: WebGLProgram, prefix: string, name: string): WebGLUniformLocation | null {
    const key = prefix + name
    let u = this.uniformCache.get(key)
    if (u === undefined) {
      u = this.gl.getUniformLocation(program, name)
      this.uniformCache.set(key, u)
    }
    return u
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, src: string): WebGLShader => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`)
      }
      return shader
    }
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSrc))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSrc))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`)
    }
    return program
  }
}
