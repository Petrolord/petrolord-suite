// Raw WebGL2 slice renderer (playbook: no three.js / canvas-2D for the
// seismic panel). Amplitudes live in an R32F texture exactly as stored;
// ALL display math — colormap, gain, polarity, trace balance, null
// masking, symmetric clip around zero — happens in the fragment shader
// and never touches the data (domain rule: gain/AGC in shader only).

import { COLOR_MAPS } from '@/utils/colorMaps';

/** Colormaps offered by Seismolord (playbook defaults first). */
export const SEISMIC_COLORMAPS = [
  { key: 'seismic_rwb', label: 'Red-White-Blue' },
  { key: 'jet', label: 'Seismic rainbow' },
  { key: 'seismic', label: 'Blue-White-Red' },
  { key: 'grayscale', label: 'Grayscale' },
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

uniform sampler2D u_data;      // R32F amplitudes, x = sample, y = trace
uniform sampler2D u_lut;       // 256x1 RGBA colormap
uniform sampler2D u_traceRms;  // R32F per-trace rms, x = trace
uniform float u_gain;          // display gain multiplier
uniform float u_polarity;      // +1 SEG normal, -1 reversed
uniform float u_clip;          // symmetric clip amplitude (maps to LUT ends)
uniform int   u_traceBalance;  // 1 = divide by per-trace rms
uniform int   u_transpose;     // 1 = sections (screen x = trace, y = sample)
uniform vec4  u_nullColor;

void main() {
  // sections: horizontal = trace, vertical = time increasing DOWNWARD
  // (v_uv.y is 1 at screen top, so the sample coordinate is 1 - v_uv.y)
  vec2 t = u_transpose == 1 ? vec2(1.0 - v_uv.y, v_uv.x) : vec2(v_uv.x, 1.0 - v_uv.y);
  float amp = texture(u_data, t).r;
  if (abs(amp) > 1.0e29) { outColor = u_nullColor; return; }
  float scale = 1.0;
  if (u_traceBalance == 1) {
    float rms = texture(u_traceRms, vec2(t.y, 0.5)).r;
    scale = rms > 0.0 ? 1.0 / rms : 0.0;
  }
  float a = amp * scale * u_gain * u_polarity;
  // symmetric colorbar around zero (playbook display default)
  float x = clamp(0.5 + 0.5 * a / u_clip, 0.0, 1.0);
  outColor = texture(u_lut, vec2(x, 0.5));
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

export class SliceRenderer {
  /** @param {HTMLCanvasElement|OffscreenCanvas} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.params = { gain: 1, polarity: 1, clip: 1, traceBalance: false, transpose: true };
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
    this.linearFloat = Boolean(gl.getExtension('OES_texture_float_linear'));

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
    }
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
      'u_clip', 'u_traceBalance', 'u_transpose', 'u_nullColor']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.uniform1i(this.u.u_data, 0);
    gl.uniform1i(this.u.u_lut, 1);
    gl.uniform1i(this.u.u_traceRms, 2);
    gl.uniform4f(this.u.u_nullColor, 0.25, 0.25, 0.28, 1.0);

    this.dataTex = this.#makeTex(gl.NEAREST);
    this.lutTex = this.#makeTex(gl.NEAREST);      // NEAREST: deterministic self-test
    this.rmsTex = this.#makeTex(gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.setColormap(this.colormapKey);
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

  /** Build the 256x1 RGBA LUT from the shared suite colormaps. */
  setColormap(key) {
    const map = COLOR_MAPS[key];
    if (!map) throw new Error(`Unknown colormap: ${key}`);
    this.colormapKey = key;
    this.lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = map.fn(i / 255);
      this.lut[i * 4] = r;
      this.lut[i * 4 + 1] = g;
      this.lut[i * 4 + 2] = b;
      this.lut[i * 4 + 3] = 255;
    }
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

  /** @param {Partial<{gain:number, polarity:1|-1, clip:number, traceBalance:boolean}>} p */
  setParams(p) {
    Object.assign(this.params, p);
    this.#applyParams();
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
   * same NEAREST sampling, same clip/gain math.
   * @param {{data: Float32Array, width: number, height: number,
   *          traceRms: Float32Array|null}} slice
   * @param {number} px canvas width @param {number} py canvas height
   */
  referenceRender(slice, px, py) {
    const { params, lut } = this;
    const out = new Uint8Array(px * py * 4);
    const nullC = [64, 64, 71, 255];
    for (let y = 0; y < py; y++) {
      for (let x = 0; x < px; x++) {
        // match gl_FragCoord centres and readPixels' bottom-up rows
        const u0 = (x + 0.5) / px;
        const v0 = (y + 0.5) / py;
        const tu = params.transpose ? 1 - v0 : u0;
        const tv = params.transpose ? u0 : 1 - v0;
        const sx = Math.min(slice.width - 1, Math.floor(tu * slice.width));
        const sy = Math.min(slice.height - 1, Math.floor(tv * slice.height));
        const amp = slice.data[sy * slice.width + sx];
        const o = (y * px + x) * 4;
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
