// Raw WebGL2 slice renderer (playbook: no three.js / canvas-2D for the
// seismic panel). Amplitudes live in an R32F texture exactly as stored;
// ALL display math — colormap, gain, polarity, trace balance, null
// masking, symmetric clip around zero — happens in the fragment shader
// and never touches the data (domain rule: gain/AGC in shader only).

import {
  SAMPLING_GLSL, DISPLAY_GLSL, buildLut, linkProgram,
} from './shaderChunks';

/**
 * Colormaps offered by Seismolord (playbook defaults first). Keys resolve
 * in the shared suite COLOR_MAPS registry; every entry feeds the same
 * 256-entry LUT, colorbar and 2D/3D shaders. Diverging maps (white/gray
 * at centre) suit amplitudes with the symmetric clip; sequential maps
 * (viridis…) suit attributes.
 */
export const SEISMIC_COLORMAPS = [
  { key: 'seismic_rwb', label: 'Red-White-Blue' },
  { key: 'seismic', label: 'Blue-White-Red' },
  { key: 'red_white_black', label: 'Red-White-Black' },
  { key: 'cool_warm', label: 'Cool-Warm (diverging)' },
  { key: 'jet', label: 'Seismic rainbow' },
  { key: 'spectrum', label: 'Spectrum' },
  { key: 'grayscale', label: 'Grayscale' },
  { key: 'gray_wb', label: 'Grayscale (reversed)' },
  { key: 'viridis', label: 'Viridis' },
  { key: 'plasma', label: 'Plasma' },
  { key: 'magma', label: 'Magma' },
  { key: 'hot_iron', label: 'Hot iron' },
  { key: 'hsv_cycle', label: 'Phase (cyclic)' },
];

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 outColor;

uniform int   u_transpose;     // 1 = sections (screen x = trace, y = sample)
uniform vec4  u_view;          // visible rect (x0, y0, w, h) in normalized
                               // screen-oriented data space; (0,0,1,1) = all
uniform vec4  u_bgColor;       // outside-the-data background
${SAMPLING_GLSL}
${DISPLAY_GLSL}
void main() {
  // screen-oriented coords: x left->right, y top->down, then the camera
  // rect maps screen onto the visible part of the data (zoom/pan/vexag).
  vec2 suv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 wuv = u_view.xy + suv * u_view.zw;
  if (wuv.x < 0.0 || wuv.x > 1.0 || wuv.y < 0.0 || wuv.y > 1.0) {
    outColor = u_bgColor;
    return;
  }
  // sections: horizontal = trace, vertical = time increasing DOWNWARD
  vec2 t = u_transpose == 1 ? vec2(wuv.y, wuv.x) : wuv;
  outColor = shadeAmp(t);
}`;

export class SliceRenderer {
  /** @param {HTMLCanvasElement|OffscreenCanvas} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.params = {
      gain: 1, polarity: 1, clip: 1, traceBalance: false, transpose: true,
      interpolate: false,
    };
    this.view = [0, 0, 1, 1];   // normalized visible rect (ViewTransform)
    this.colormapKey = SEISMIC_COLORMAPS[0].key;
    this.lastSlice = null;
    this.lastIsSection = true;
    this.contextLost = false;
    /** Optional hook fired after automatic context-loss recovery. */
    this.onRestore = null;

    // Context-loss recovery (Phase 6 hardening): preventDefault marks the
    // context restorable; on restore every GL object is recreated and the
    // last slice re-rendered, so GPU resets / tab eviction don't leave a
    // dead black panel.
    this.handleContextLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.handleContextRestored = () => {
      this.contextLost = false;
      this.#initGL();
      if (this.lastSlice) {
        this.setSlice(this.lastSlice, this.lastIsSection);
        this.render();
      }
      if (this.onRestore) this.onRestore();
    };
    if (canvas.addEventListener) {
      canvas.addEventListener('webglcontextlost', this.handleContextLost);
      canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    }

    this.#initGL();
  }

  /** (Re)create every GL resource — at construction and after restore. */
  #initGL() {
    const { gl } = this;

    const prog = linkProgram(gl, VERT, FRAG);
    this.prog = prog;
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // fullscreen tri
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ['u_data', 'u_lut', 'u_traceRms', 'u_gain', 'u_polarity',
      'u_clip', 'u_traceBalance', 'u_transpose', 'u_interp', 'u_nullColor',
      'u_view', 'u_bgColor']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.uniform1i(this.u.u_data, 0);
    gl.uniform1i(this.u.u_lut, 1);
    gl.uniform1i(this.u.u_traceRms, 2);
    gl.uniform4f(this.u.u_nullColor, 0.25, 0.25, 0.28, 1.0);
    // matches BG_RGBA below and the panel's slate background
    gl.uniform4f(this.u.u_bgColor, 2 / 255, 6 / 255, 23 / 255, 1.0);

    this.dataTex = this.#makeTex(gl.NEAREST);
    this.lutTex = this.#makeTex(gl.NEAREST);      // NEAREST: deterministic self-test
    this.rmsTex = this.#makeTex(gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.setColormap(this.colormapKey, true);   // force: lutTex is brand new
    this.#applyParams();
  }

  #makeTex(filter) {
    const { gl } = this;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /**
   * Build the 256x1 RGBA LUT from the shared suite colormaps. No-op when
   * the key is unchanged (the display effect calls this on every gain /
   * clip tweak) — `force` re-uploads after #initGL recreated lutTex.
   */
  setColormap(key, force = false) {
    if (!force && key === this.colormapKey && this.lut) return;
    this.lut = buildLut(key);                   // throws on unknown key
    this.colormapKey = key;
    if (this.contextLost) return;               // re-uploaded on restore
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lut);
  }

  /**
   * Upload a slice from assembleSlice(): R32F texture, width = samples
   * (or crosslines for time slices), height = traces (or inlines).
   * @param {{data: Float32Array, width: number, height: number,
   *          traceRms: Float32Array|null}} slice
   * @param {boolean} isSection true for inline/xline (transposed display)
   */
  setSlice(slice, isSection = true) {
    this.lastSlice = slice;
    this.lastIsSection = isSection;
    if (this.contextLost) return;                 // re-uploaded on restore
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, slice.width, slice.height, 0,
      gl.RED, gl.FLOAT, slice.data);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.rmsTex);
    const rms = slice.traceRms || new Float32Array(slice.height).fill(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, rms.length, 1, 0, gl.RED, gl.FLOAT, rms);

    this.params.transpose = isSection;
    this.#applyParams();
  }

  /**
   * @param {Partial<{gain:number, polarity:1|-1, clip:number,
   *   traceBalance:boolean, interpolate:boolean}>} p
   * interpolate runs null-aware bicubic resampling in the shader
   * (texelFetch-based — no float-linear extension needed). Off = exact
   * NEAREST texels, which is what referenceRender() models.
   */
  setParams(p) {
    Object.assign(this.params, p);
    this.#applyParams();
  }

  /**
   * Camera: normalized visible rect [x0, y0, w, h] from
   * ViewTransform.viewUniform(). [0,0,1,1] (the default) renders the
   * whole slice exactly as before the camera existed. Runs every camera
   * frame, so it touches only its own uniform (not the full param set).
   */
  setView(rect) {
    this.view = [rect[0], rect[1], rect[2], rect[3]];
    if (this.contextLost) return;               // re-applied on restore
    const { gl } = this;
    gl.useProgram(this.prog);
    gl.uniform4f(this.u.u_view, this.view[0], this.view[1], this.view[2], this.view[3]);
  }

  #applyParams() {
    if (this.contextLost) return;               // re-applied on restore
    const { gl, u, params } = this;
    gl.useProgram(this.prog);
    gl.uniform1f(u.u_gain, params.gain);
    gl.uniform1f(u.u_polarity, params.polarity);
    gl.uniform1f(u.u_clip, Math.max(params.clip, 1e-30));
    gl.uniform1i(u.u_traceBalance, params.traceBalance ? 1 : 0);
    gl.uniform1i(u.u_transpose, params.transpose ? 1 : 0);
    gl.uniform1i(u.u_interp, params.interpolate ? 1 : 0);
    gl.uniform4f(u.u_view, this.view[0], this.view[1], this.view[2], this.view[3]);
  }

  render() {
    if (this.contextLost) return;
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Read back the framebuffer (call immediately after render()). */
  readPixels() {
    const { gl } = this;
    const out = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  /**
   * CPU reference of the full shader path for the self-test: same LUT,
   * same NEAREST sampling, same camera rect, same clip/gain math.
   * (interpolate mode has no CPU reference — the self-test runs NEAREST.)
   * @param {{data: Float32Array, width: number, height: number,
   *          traceRms: Float32Array|null}} slice
   * @param {number} px canvas width @param {number} py canvas height
   */
  referenceRender(slice, px, py) {
    const { params, lut, view } = this;
    const out = new Uint8Array(px * py * 4);
    const nullC = [64, 64, 71, 255];
    const bgC = [2, 6, 23, 255];               // matches u_bgColor
    for (let y = 0; y < py; y++) {
      for (let x = 0; x < px; x++) {
        // match gl_FragCoord centres and readPixels' bottom-up rows
        const u0 = (x + 0.5) / px;
        const v0 = (y + 0.5) / py;
        // screen-oriented (y top-down) then through the camera rect
        const wu = view[0] + u0 * view[2];
        const wv = view[1] + (1 - v0) * view[3];
        const o = (y * px + x) * 4;
        if (wu < 0 || wu > 1 || wv < 0 || wv > 1) {
          out.set(bgC, o);
          continue;
        }
        const tu = params.transpose ? wv : wu;
        const tv = params.transpose ? wu : wv;
        const sx = Math.min(slice.width - 1, Math.floor(tu * slice.width));
        const sy = Math.min(slice.height - 1, Math.floor(tv * slice.height));
        const amp = slice.data[sy * slice.width + sx];
        if (Math.abs(amp) > 1.0e29) {
          out.set(nullC, o);
          continue;
        }
        let scale = 1;
        if (params.traceBalance && slice.traceRms) {
          const r = slice.traceRms[sy];
          scale = r > 0 ? 1 / r : 0;
        }
        const a = amp * scale * params.gain * params.polarity;
        const t = Math.min(1, Math.max(0, 0.5 + (0.5 * a) / params.clip));
        const li = Math.min(255, Math.floor(t * 256));
        out[o] = lut[li * 4];
        out[o + 1] = lut[li * 4 + 1];
        out[o + 2] = lut[li * 4 + 2];
        out[o + 3] = 255;
      }
    }
    return out;
  }

  destroy() {
    if (this.canvas.removeEventListener) {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    }
    const { gl } = this;
    gl.deleteTexture(this.dataTex);
    gl.deleteTexture(this.lutTex);
    gl.deleteTexture(this.rmsTex);
    gl.deleteProgram(this.prog);
  }
}
