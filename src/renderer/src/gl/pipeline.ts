import quadVert from './shaders/quad.vert?raw'
import adjustFrag from './shaders/adjust.frag?raw'
import { bakeCurveLut } from '@shared/curve'
import { IDENTITY_CURVE, type EditParams } from '@shared/editParams'

export interface HistogramData {
  r: Uint32Array
  g: Uint32Array
  b: Uint32Array
  luma: Uint32Array
  /** Number of pixels sampled (for normalization). */
  total: number
}

const HIST_SIZE = 128

/**
 * WebGL2 preview pipeline: one pointwise adjustment pass rendered straight to
 * the canvas. render() is a pure function of (image texture, EditParams) —
 * all edit state lives outside the GPU.
 */
export class GLPipeline {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation>()
  private imageTex: WebGLTexture | null = null
  private curveTex: WebGLTexture
  private histFbo: WebGLFramebuffer
  private histTex: WebGLTexture
  private histPixels = new Uint8Array(HIST_SIZE * HIST_SIZE * 4)
  private lastCurveKey = ''
  imageWidth = 0
  imageHeight = 0

  constructor(private canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer keeps the canvas readable after compositing —
    // needed for screenshot-based testing and cheap "copy preview" features.
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl

    this.program = this.createProgram(quadVert, adjustFrag)

    // Identity curve LUT so the shader can sample unconditionally.
    this.curveTex = this.createLutTexture()
    this.uploadCurve(bakeCurveLut(IDENTITY_CURVE))

    // Small offscreen target for histogram sampling.
    this.histTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.histTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, HIST_SIZE, HIST_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
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
    this.imageTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    this.imageWidth = bitmap.width
    this.imageHeight = bitmap.height
  }

  get hasImage(): boolean {
    return this.imageTex !== null
  }

  /** Draw the adjusted image, letterboxed into the current canvas size. */
  render(params: EditParams): void {
    const gl = this.gl
    if (!this.imageTex) return

    this.updateCurveIfNeeded(params)

    const cw = this.canvas.width
    const ch = this.canvas.height
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, cw, ch)
    gl.clearColor(0.094, 0.094, 0.094, 1) // matches --bg-app #181818
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Aspect-fit letterbox with a small margin.
    const margin = 24
    const scale = Math.min((cw - margin * 2) / this.imageWidth, (ch - margin * 2) / this.imageHeight)
    const w = Math.max(1, Math.round(this.imageWidth * scale))
    const h = Math.max(1, Math.round(this.imageHeight * scale))
    gl.viewport(Math.round((cw - w) / 2), Math.round((ch - h) / 2), w, h)

    this.drawPass(params, 1)
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
    this.drawPass(params, 0)
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
    gl.deleteTexture(this.curveTex)
    gl.deleteTexture(this.histTex)
    gl.deleteFramebuffer(this.histFbo)
    gl.deleteProgram(this.program)
  }

  // ---------- internals ----------

  private drawPass(params: EditParams, flipY: number): void {
    const gl = this.gl
    gl.useProgram(this.program)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex)
    gl.uniform1i(this.loc('u_image'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
    gl.uniform1i(this.loc('u_curve'), 1)

    gl.uniform1f(this.loc('u_flipY'), flipY)
    gl.uniform1f(this.loc('u_exposure'), params.exposure)
    gl.uniform1f(this.loc('u_contrast'), params.contrast / 100)
    gl.uniform1f(this.loc('u_highlights'), params.highlights / 100)
    gl.uniform1f(this.loc('u_shadows'), params.shadows / 100)
    gl.uniform1f(this.loc('u_whites'), params.whites / 100)
    gl.uniform1f(this.loc('u_blacks'), params.blacks / 100)
    gl.uniform1f(this.loc('u_temp'), params.temp / 100)
    gl.uniform1f(this.loc('u_tint'), params.tint / 100)
    gl.uniform1f(this.loc('u_vibrance'), params.vibrance / 100)
    gl.uniform1f(this.loc('u_saturation'), params.saturation / 100)
    gl.uniform1f(this.loc('u_vignette'), params.vignette / 100)
    gl.uniform1f(this.loc('u_grain'), params.grain / 100)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
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

  private createLutTexture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return tex
  }

  private loc(name: string): WebGLUniformLocation | null {
    let u = this.uniforms.get(name)
    if (u === undefined) {
      const found = this.gl.getUniformLocation(this.program, name)
      if (found) {
        this.uniforms.set(name, found)
        u = found
      }
    }
    return u ?? null
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
