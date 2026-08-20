// Raw WebGL2 slice renderer (playbook: no three.js / canvas-2D for the
// seismic panel). Amplitudes live in an R32F texture exactly as stored;
// ALL display math — colormap, gain, polarity, trace balance, null
// masking, symmetric clip around zero — happens in the fragment shader
// and never touches the data (domain rule: gain/AGC in shader only).

import {
  SAMPLING_GLSL, DISPLAY_GLSL, OVERLAY_GLSL, makeSamplingGlsl, buildLut, linkProgram,
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
${makeSamplingGlsl('B')}
${DISPLAY_GLSL}
${OVERLAY_GLSL}
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
  vec4 c = shadeAmp(t);
  // W2.4 co-render: blend the overlay volume over live primary pixels
  // only (null primary keeps the null color, null overlay changes nothing)
  if (u_overlayOn == 1 && !primaryIsNull(t)) c = blendOverlay(t, c);
  outColor = c;
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
    this.reverse = false;
    this.agcMap = null;         // W1.1 windowed-AGC gain map (slice dims)
    this.lastSlice = null;
    this.lastIsSection = true;
    // W2.4 co-render overlay: second volume's slice + display params.
    // The overlay only draws while its slice matches the primary's dims
    // (same lattice, same orientation/index) — a lagging overlay upload
    // silently waits rather than smearing mismatched geometry.
    this.overlay = null;        // {gain, polarity, clip, traceBalance, opacity, mode}
    this.lastSliceB = null;
    this.colormapKeyB = 'viridis';
    this.reverseB = false;
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
        const agc = this.agcMap;              // setSlice clears it
        this.setSlice(this.lastSlice, this.lastIsSection);
        if (agc) this.setAgc(agc);
        if (this.lastSliceB) this.setSliceB(this.lastSliceB);
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
    for (const name of ['u_data', 'u_lut', 'u_traceRms', 'u_agc', 'u_gain',
      'u_polarity', 'u_clip', 'u_traceBalance', 'u_useAgc', 'u_transpose',
      'u_interp', 'u_nullColor', 'u_view', 'u_bgColor',
      // W2.4 overlay family
      'u_dataB', 'u_lutB', 'u_traceRmsB', 'u_agcB', 'u_traceBalanceB',
      'u_useAgcB', 'u_interpB', 'u_gainB', 'u_polarityB', 'u_clipB',
      'u_overlayOn', 'u_blendMode', 'u_overlayOpacity']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.uniform1i(this.u.u_data, 0);
    gl.uniform1i(this.u.u_lut, 1);
    gl.uniform1i(this.u.u_traceRms, 2);
    gl.uniform1i(this.u.u_agc, 3);
    gl.uniform1i(this.u.u_dataB, 4);
    gl.uniform1i(this.u.u_lutB, 5);
    gl.uniform1i(this.u.u_traceRmsB, 6);
    gl.uniform1i(this.u.u_agcB, 7);
    gl.uniform4f(this.u.u_nullColor, 0.25, 0.25, 0.28, 1.0);
    // matches BG_RGBA below and the panel's slate background
    gl.uniform4f(this.u.u_bgColor, 2 / 255, 6 / 255, 23 / 255, 1.0);

    this.dataTex = this.#makeTex(gl.NEAREST);
    this.lutTex = this.#makeTex(gl.NEAREST);      // NEAREST: deterministic self-test
    this.rmsTex = this.#makeTex(gl.NEAREST);
    this.agcTex = this.#makeTex(gl.NEAREST);
    this.dataTexB = this.#makeTex(gl.NEAREST);
    this.lutTexB = this.#makeTex(gl.NEAREST);
    this.rmsTexB = this.#makeTex(gl.NEAREST);
    this.agcTexB = this.#makeTex(gl.NEAREST);     // reserved; overlay AGC is off in v1
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // force: lutTex is brand new
    this.setColormap(this.colormapKey, { force: true, reverse: this.reverse });
    this.setColormapB(this.colormapKeyB, { force: true, reverse: this.reverseB });
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
   * key + reversal are unchanged (the display effect calls this on every
   * gain / clip tweak) — `force` re-uploads after #initGL recreated
   * lutTex; `reverse` flips the map end-for-end.
   */
  setColormap(key, { force = false, reverse = false } = {}) {
    if (!force && key === this.colormapKey && reverse === this.reverse && this.lut) return;
    this.lut = buildLut(key, reverse);          // throws on unknown key
    this.colormapKey = key;
    this.reverse = reverse;
    if (this.contextLost) return;               // re-uploaded on restore
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lut);
  }

  /** Overlay LUT — same no-op / force semantics as setColormap. */
  setColormapB(key, { force = false, reverse = false } = {}) {
    if (!force && key === this.colormapKeyB && reverse === this.reverseB && this.lutB) return;
    this.lutB = buildLut(key, reverse);
    this.colormapKeyB = key;
    this.reverseB = reverse;
    if (this.contextLost) return;
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lutB);
  }

  /**
   * W2.4: upload (or clear) the co-rendered overlay volume's slice —
   * the SAME orientation/index assembled from the second volume, whose
   * lattice is identical (sameLattice gate upstream). The overlay draws
   * only while its dims match the primary's; #applyParams re-derives
   * the on-flag on every change so a stale slice can never smear.
   * @param {{data: Float32Array, width: number, height: number,
   *          traceRms: Float32Array|null}|null} slice
   */
  setSliceB(slice) {
    this.lastSliceB = slice || null;
    if (this.contextLost) return;                 // re-uploaded on restore
    const { gl } = this;
    if (slice) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.dataTexB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, slice.width, slice.height, 0,
        gl.RED, gl.FLOAT, slice.data);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this.rmsTexB);
      const rms = slice.traceRms || new Float32Array(slice.height).fill(1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, rms.length, 1, 0, gl.RED, gl.FLOAT, rms);
    }
    this.#applyParams();
  }

  /**
   * W2.4: overlay display params, or null to turn co-rendering off.
   * @param {{gain?: number, polarity?: 1|-1, clip: number,
   *   traceBalance?: boolean, opacity?: number,
   *   mode?: 'mix'|'multiply'}|null} p
   */
  setOverlay(p) {
    this.overlay = p || null;
    this.#applyParams();
  }

  /** The overlay draws only when armed AND dimension-matched. */
  #overlayActive() {
    return Boolean(this.overlay && this.lastSlice && this.lastSliceB
      && this.lastSliceB.width === this.lastSlice.width
      && this.lastSliceB.height === this.lastSlice.height);
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

    // a new slice invalidates any AGC map (dims / content are per slice);
    // the display effect re-derives and re-sets it right after
    this.agcMap = null;

    this.params.transpose = isSection;
    this.#applyParams();
  }

  /**
   * W1.1 windowed AGC: upload the gain map (engine agcGainMap, SAME dims
   * and layout as the current slice) or pass null to turn AGC off. The
   * shader multiplies it per texel; referenceRender mirrors it, so the
   * GPU==CPU self-test covers the path.
   */
  setAgc(map) {
    this.agcMap = map || null;
    if (this.contextLost) return;               // re-applied on restore
    const { gl } = this;
    gl.useProgram(this.prog);
    if (this.agcMap && this.lastSlice) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.agcTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.lastSlice.width,
        this.lastSlice.height, 0, gl.RED, gl.FLOAT, this.agcMap);
      gl.uniform1i(this.u.u_useAgc, 1);
    } else {
      gl.uniform1i(this.u.u_useAgc, 0);
    }
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
    // the AGC flag re-applies wherever params do (init / setSlice /
    // setParams), so a cleared map can never leave a stale flag behind
    gl.uniform1i(u.u_useAgc, this.agcMap ? 1 : 0);
    gl.uniform1i(u.u_transpose, params.transpose ? 1 : 0);
    gl.uniform1i(u.u_interp, params.interpolate ? 1 : 0);
    gl.uniform4f(u.u_view, this.view[0], this.view[1], this.view[2], this.view[3]);

    // W2.4 overlay family — re-derived here for the same stale-flag
    // reason as u_useAgc
    const ov = this.overlay;
    const on = this.#overlayActive();
    gl.uniform1i(u.u_overlayOn, on ? 1 : 0);
    gl.uniform1i(u.u_useAgcB, 0);                 // overlay AGC off in v1
    gl.uniform1i(u.u_interpB, params.interpolate ? 1 : 0);
    if (ov) {
      gl.uniform1f(u.u_gainB, ov.gain ?? 1);
      gl.uniform1f(u.u_polarityB, ov.polarity ?? 1);
      gl.uniform1f(u.u_clipB, Math.max(ov.clip ?? 1, 1e-30));
      gl.uniform1i(u.u_traceBalanceB, ov.traceBalance ? 1 : 0);
      gl.uniform1i(u.u_blendMode, ov.mode === 'multiply' ? 1 : 0);
      gl.uniform1f(u.u_overlayOpacity, Math.min(1, Math.max(0, ov.opacity ?? 0.5)));
    }
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
        if (this.agcMap) scale *= this.agcMap[sy * slice.width + sx];
        const a = amp * scale * params.gain * params.polarity;
        const t = Math.min(1, Math.max(0, 0.5 + (0.5 * a) / params.clip));
        const li = Math.min(255, Math.floor(t * 256));
        let r8 = lut[li * 4];
        let g8 = lut[li * 4 + 1];
        let b8 = lut[li * 4 + 2];

        // W2.4 overlay mirror: same NEAREST texel of the overlay slice,
        // its own balance/gain/clip/LUT, blended per the shader
        if (this.#overlayActive()) {
          const ov = this.overlay;
          const ampB = this.lastSliceB.data[sy * slice.width + sx];
          if (Math.abs(ampB) <= 1.0e29) {
            let scaleB = 1;
            if (ov.traceBalance && this.lastSliceB.traceRms) {
              const rB = this.lastSliceB.traceRms[sy];
              scaleB = rB > 0 ? 1 / rB : 0;
            }
            const aB = ampB * scaleB * (ov.gain ?? 1) * (ov.polarity ?? 1);
            const tB = Math.min(1, Math.max(0, 0.5 + (0.5 * aB) / Math.max(ov.clip ?? 1, 1e-30)));
            const liB = Math.min(255, Math.floor(tB * 256));
            const op = Math.min(1, Math.max(0, ov.opacity ?? 0.5));
            const [rB8, gB8, bB8] = [this.lutB[liB * 4], this.lutB[liB * 4 + 1], this.lutB[liB * 4 + 2]];
            if (ov.mode === 'multiply') {
              r8 = Math.round(r8 * ((1 - op) + (op * rB8) / 255));
              g8 = Math.round(g8 * ((1 - op) + (op * gB8) / 255));
              b8 = Math.round(b8 * ((1 - op) + (op * bB8) / 255));
            } else {
              r8 = Math.round(r8 * (1 - op) + rB8 * op);
              g8 = Math.round(g8 * (1 - op) + gB8 * op);
              b8 = Math.round(b8 * (1 - op) + bB8 * op);
            }
          }
        }
        out[o] = r8;
        out[o + 1] = g8;
        out[o + 2] = b8;
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
    gl.deleteTexture(this.agcTex);
    gl.deleteTexture(this.dataTexB);
    gl.deleteTexture(this.lutTexB);
    gl.deleteTexture(this.rmsTexB);
    gl.deleteTexture(this.agcTexB);
    gl.deleteProgram(this.prog);
  }
}
