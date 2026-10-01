// Raw WebGL2 renderer for the 3D cube window (playbook: no three.js).
// Draws textured slice planes (inline / crossline / time / boundary
// faces) plus the survey-box wireframe. Amplitude shading is byte-for-
// byte the same GLSL as the 2D viewer (shaderChunks), so the two windows
// can never disagree about what an amplitude looks like.

import {
  SAMPLING_GLSL, DISPLAY_GLSL, OVERLAY_GLSL, makeSamplingGlsl, buildLut, linkProgram,
} from './shaderChunks';

const PLANE_VERT = `#version 300 es
in vec2 a_uv;
uniform mat4 u_mvp;
uniform vec3 u_origin;
uniform vec3 u_du;
uniform vec3 u_dv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec3 p = u_origin + a_uv.x * u_du + a_uv.y * u_dv;
  gl_Position = u_mvp * vec4(p, 1.0);
}`;

const PLANE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 outColor;
${SAMPLING_GLSL}
${makeSamplingGlsl('B')}
${DISPLAY_GLSL}
${OVERLAY_GLSL}
void main() {
  vec4 c = shadeAmp(v_uv);
  // U2-017 co-render in 3D: the same blend as the 2D window (shaderChunks)
  if (u_overlayOn == 1 && !primaryIsNull(v_uv)) c = blendOverlay(v_uv, c);
  outColor = c;
}`;

// Lines and meshes take positions in NORMALIZED cube space (interpMesh
// convention) scaled by u_scale = (X, D, Z), so vexag / extent changes
// are uniform updates. Cube edges pass u_scale = 1 (already ext-space).
const LINE_VERT = `#version 300 es
in vec3 a_pos;
uniform mat4 u_mvp;
uniform vec3 u_scale;
void main() { gl_Position = u_mvp * vec4(a_pos * u_scale, 1.0); }`;

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }`;

// Interpretation surfaces (horizons, fault ribbons): flat solid color
// with faceted two-sided shading from screen-space derivatives — no
// normal attribute, so non-uniform u_scale needs no normal matrix.
const MESH_VERT = `#version 300 es
in vec3 a_pos;
uniform mat4 u_mvp;
uniform vec3 u_scale;
out vec3 v_world;
void main() {
  v_world = a_pos * u_scale;
  gl_Position = u_mvp * vec4(v_world, 1.0);
}`;

const MESH_FRAG = `#version 300 es
precision highp float;
in vec3 v_world;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(v_world), dFdy(v_world)));
  float nl = abs(dot(n, normalize(vec3(0.4, 0.8, 0.45))));
  outColor = vec4(u_color.rgb * (0.55 + 0.45 * nl), u_color.a);
}`;

const BG = {
  dark: [2 / 255, 6 / 255, 23 / 255, 1],        // slate-950
  light: [1, 1, 1, 1],
};
const EDGE_COLOR = {
  dark: [0.58, 0.64, 0.72, 0.9],                // slate-400ish
  light: [0.28, 0.33, 0.41, 0.9],               // slate-600ish
};

export class CubeRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.planes = new Map();      // id -> {quad, tex, rmsTex, w, h}
    this.meshes = new Map();      // id -> {vao, posBuf, idxBuf, count, color, opacity}
    this.lineSets = new Map();    // id -> {vao, buf, count, color}
    this.scale = [1, 1, 1];       // (X, D, Z) applied to mesh/lineSet space
    this.display = {
      gain: 1, polarity: 1, clip: 1, traceBalance: false, interpolate: true,
    };
    this.colormapKey = null;
    this.lut = null;
    // U2-017 co-render: overlay display params (null = off), its LUT, and
    // per-plane overlay slices (drawn only where dims match the plane's)
    this.overlay = null;
    this.colormapKeyB = 'viridis';
    this.reverseB = false;
    this.lutB = null;
    this.pendingSlicesB = new Map();
    this.background = 'dark';
    this.edges = null;            // Float32Array segment soup
    this.contextLost = false;
    this.onRestore = null;
    this.pendingSlices = new Map();   // id -> slice, re-uploaded on restore
    this.pendingMeshes = new Map();   // id -> mesh spec, re-uploaded on restore
    this.pendingLineSets = new Map(); // id -> line spec, re-uploaded on restore

    this.handleContextLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.handleContextRestored = () => {
      this.contextLost = false;
      this.#initGL();
      for (const [id, entry] of this.pendingSlices) {
        this.setPlane(id, entry.slice, entry.quad);
      }
      for (const [id, slice] of this.pendingSlicesB) this.setPlaneB(id, slice);
      for (const [id, spec] of this.pendingMeshes) this.setMesh(id, spec);
      for (const [id, spec] of this.pendingLineSets) this.setLineSet(id, spec);
      if (this.edges) this.setEdges(this.edges);
      if (this.onRestore) this.onRestore();
    };
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.#initGL();
  }

  #initGL() {
    const { gl } = this;
    this.planes.clear();
    this.meshes.clear();
    this.lineSets.clear();

    this.planeProg = linkProgram(gl, PLANE_VERT, PLANE_FRAG);
    this.lineProg = linkProgram(gl, LINE_VERT, LINE_FRAG);
    this.meshProg = linkProgram(gl, MESH_VERT, MESH_FRAG);
    this.mu = {
      u_mvp: gl.getUniformLocation(this.meshProg, 'u_mvp'),
      u_scale: gl.getUniformLocation(this.meshProg, 'u_scale'),
      u_color: gl.getUniformLocation(this.meshProg, 'u_color'),
    };

    this.pu = {};
    for (const n of ['u_mvp', 'u_origin', 'u_du', 'u_dv', 'u_data', 'u_lut',
      'u_traceRms', 'u_traceBalance', 'u_interp', 'u_gain', 'u_polarity',
      'u_clip', 'u_nullColor',
      // U2-017 overlay family (same names as the 2D renderer)
      'u_dataB', 'u_lutB', 'u_traceRmsB', 'u_agcB', 'u_traceBalanceB',
      'u_useAgcB', 'u_interpB', 'u_gainB', 'u_polarityB', 'u_clipB',
      'u_overlayOn', 'u_blendMode', 'u_overlayOpacity']) {
      this.pu[n] = gl.getUniformLocation(this.planeProg, n);
    }
    this.lu = {
      u_mvp: gl.getUniformLocation(this.lineProg, 'u_mvp'),
      u_scale: gl.getUniformLocation(this.lineProg, 'u_scale'),
      u_color: gl.getUniformLocation(this.lineProg, 'u_color'),
    };

    // unit quad (triangle strip) shared by every plane
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(this.planeProg, 'a_uv');
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    this.lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    const aPos = gl.getAttribLocation(this.lineProg, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    this.lineVertCount = 0;
    gl.bindVertexArray(null);

    this.lutTex = this.#makeTex();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.useProgram(this.planeProg);
    gl.uniform1i(this.pu.u_data, 0);
    gl.uniform1i(this.pu.u_lut, 1);
    gl.uniform1i(this.pu.u_traceRms, 2);
    gl.uniform4f(this.pu.u_nullColor, 0.25, 0.25, 0.28, 1.0);
    gl.uniform1i(this.pu.u_dataB, 4);
    gl.uniform1i(this.pu.u_lutB, 5);
    gl.uniform1i(this.pu.u_traceRmsB, 6);
    gl.uniform1i(this.pu.u_agcB, 7);
    gl.uniform1i(this.pu.u_useAgcB, 0);
    gl.uniform1i(this.pu.u_overlayOn, 0);
    this.lutTexB = this.#makeTex();

    if (this.colormapKey) {
      this.setColormap(this.colormapKey, { force: true, reverse: this.reverse });
    }
    this.setColormapB(this.colormapKeyB, { force: true, reverse: this.reverseB });
  }

  /** U2-017: the overlay LUT (same no-op / force semantics as setColormap). */
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

  /** U2-017: overlay display params ({gain, polarity, clip, traceBalance, opacity, mode}) or null. */
  setOverlay(p) {
    this.overlay = p || null;
  }

  /**
   * U2-017: the overlay volume's slice for one plane (same orientation and
   * index on the same lattice), or null to clear it.
   */
  setPlaneB(id, slice) {
    const entry = this.planes.get(id);
    if (!slice) {
      this.pendingSlicesB.delete(id);
      if (entry) entry.bDims = null;
      return;
    }
    this.pendingSlicesB.set(id, slice);
    if (this.contextLost || !entry) return;
    const { gl } = this;
    if (!entry.texB) { entry.texB = this.#makeTex(); entry.rmsTexB = this.#makeTex(); }
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, entry.texB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, slice.width, slice.height, 0, gl.RED, gl.FLOAT, slice.data);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, entry.rmsTexB);
    const rms = slice.traceRms || new Float32Array(slice.height).fill(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, rms.length, 1, 0, gl.RED, gl.FLOAT, rms);
    entry.bDims = [slice.width, slice.height];
  }

  /** The overlay draws on a plane only when armed and its dims match. */
  overlayActiveFor(id) {
    const p = this.planes.get(id);
    return Boolean(this.overlay && p && p.bDims && p.dims && p.bDims[0] === p.dims[0] && p.bDims[1] === p.dims[1]);
  }

  #makeTex() {
    const { gl } = this;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  setColormap(key, { force = false, reverse = false } = {}) {
    if (!force && key === this.colormapKey && reverse === this.reverse && this.lut) return;
    this.lut = buildLut(key, reverse);
    this.colormapKey = key;
    this.reverse = reverse;
    if (this.contextLost) return;
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, this.lut);
  }

  /** @param {Partial<{gain, polarity, clip, traceBalance, interpolate}>} p */
  setDisplay(p) {
    Object.assign(this.display, p);
  }

  setBackground(mode) {
    this.background = mode === 'light' ? 'light' : 'dark';
  }

  /**
   * Upload / replace one plane. `slice` is an assembleSlice() result;
   * `quad` a planeQuad() result. Passing a null slice removes the plane.
   */
  setPlane(id, slice, quad) {
    if (!slice) {
      const old = this.planes.get(id);
      if (old && !this.contextLost) {
        this.gl.deleteTexture(old.tex);
        this.gl.deleteTexture(old.rmsTex);
        if (old.texB) { this.gl.deleteTexture(old.texB); this.gl.deleteTexture(old.rmsTexB); }
      }
      this.planes.delete(id);
      this.pendingSlices.delete(id);
      this.pendingSlicesB.delete(id);
      return;
    }
    this.pendingSlices.set(id, { slice, quad });
    if (this.contextLost) return;
    const { gl } = this;
    let entry = this.planes.get(id);
    if (!entry) {
      entry = { tex: this.#makeTex(), rmsTex: this.#makeTex() };
      this.planes.set(id, entry);
    }
    entry.quad = quad;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, slice.width, slice.height, 0,
      gl.RED, gl.FLOAT, slice.data);
    entry.dims = [slice.width, slice.height];
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, entry.rmsTex);
    const rms = slice.traceRms || new Float32Array(slice.height).fill(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, rms.length, 1, 0,
      gl.RED, gl.FLOAT, rms);
  }

  /** Update a plane's position without re-uploading its texture. */
  setPlaneQuad(id, quad) {
    const entry = this.planes.get(id);
    if (entry) entry.quad = quad;
    const pending = this.pendingSlices.get(id);
    if (pending) pending.quad = quad;
  }

  hasPlane(id) { return this.planes.has(id); }

  /** Cube wireframe (+ any extra line segments), xyz soup. */
  setEdges(segments) {
    this.edges = segments;
    if (this.contextLost) return;
    const { gl } = this;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, segments, gl.DYNAMIC_DRAW);
    this.lineVertCount = segments.length / 3;
    gl.bindVertexArray(null);
  }

  /** Cube-space scale (X, D, Z) applied to meshes and line sets. */
  setScale(x, d, z) {
    this.scale = [x, d, z];
  }

  /**
   * Upload / replace an interpretation surface. Positions are normalized
   * cube space (interpMesh); passing null removes the mesh.
   * @param {?{positions: Float32Array, indices: Uint32Array,
   *           color: number[], opacity?: number}} spec
   */
  setMesh(id, spec) {
    const { gl } = this;
    if (!spec || spec.indices.length === 0) {
      const old = this.meshes.get(id);
      if (old && !this.contextLost) {
        gl.deleteBuffer(old.posBuf);
        gl.deleteBuffer(old.idxBuf);
        gl.deleteVertexArray(old.vao);
      }
      this.meshes.delete(id);
      this.pendingMeshes.delete(id);
      return;
    }
    this.pendingMeshes.set(id, spec);
    if (this.contextLost) return;
    let entry = this.meshes.get(id);
    if (!entry) {
      entry = {
        vao: gl.createVertexArray(),
        posBuf: gl.createBuffer(),
        idxBuf: gl.createBuffer(),
      };
      gl.bindVertexArray(entry.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.posBuf);
      const aPos = gl.getAttribLocation(this.meshProg, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.idxBuf);
      this.meshes.set(id, entry);
    } else {
      gl.bindVertexArray(entry.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.posBuf);
    }
    gl.bufferData(gl.ARRAY_BUFFER, spec.positions, gl.DYNAMIC_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, spec.indices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    entry.count = spec.indices.length;
    entry.color = spec.color;
    entry.opacity = spec.opacity == null ? 1 : spec.opacity;
  }

  /**
   * Upload / replace a line overlay (GL_LINES soup in normalized cube
   * space — fault sticks). Passing null removes it.
   * @param {?{positions: Float32Array, color: number[]}} spec
   */
  setLineSet(id, spec) {
    const { gl } = this;
    if (!spec || spec.positions.length === 0) {
      const old = this.lineSets.get(id);
      if (old && !this.contextLost) {
        gl.deleteBuffer(old.buf);
        gl.deleteVertexArray(old.vao);
      }
      this.lineSets.delete(id);
      this.pendingLineSets.delete(id);
      return;
    }
    this.pendingLineSets.set(id, spec);
    if (this.contextLost) return;
    let entry = this.lineSets.get(id);
    if (!entry) {
      entry = { vao: gl.createVertexArray(), buf: gl.createBuffer() };
      gl.bindVertexArray(entry.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.buf);
      const aPos = gl.getAttribLocation(this.lineProg, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      this.lineSets.set(id, entry);
    } else {
      gl.bindVertexArray(entry.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.buf);
    }
    gl.bufferData(gl.ARRAY_BUFFER, spec.positions, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    entry.count = spec.positions.length / 3;
    entry.color = spec.color;
  }

  /** @param {Float32Array} mvp @param {string[]} order plane ids to draw */
  render(mvp, order) {
    if (this.contextLost) return;
    const { gl, display } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const bg = BG[this.background];
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.planeProg);
    gl.uniformMatrix4fv(this.pu.u_mvp, false, mvp);
    gl.uniform1f(this.pu.u_gain, display.gain);
    gl.uniform1f(this.pu.u_polarity, display.polarity);
    gl.uniform1f(this.pu.u_clip, Math.max(display.clip, 1e-30));
    gl.uniform1i(this.pu.u_traceBalance, display.traceBalance ? 1 : 0);
    gl.uniform1i(this.pu.u_interp, display.interpolate ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    const ov = this.overlay;
    if (ov) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.lutTexB);
      gl.uniform1f(this.pu.u_gainB, ov.gain ?? 1);
      gl.uniform1f(this.pu.u_polarityB, ov.polarity ?? 1);
      gl.uniform1f(this.pu.u_clipB, Math.max(ov.clip ?? 1, 1e-30));
      gl.uniform1i(this.pu.u_traceBalanceB, ov.traceBalance ? 1 : 0);
      gl.uniform1i(this.pu.u_interpB, display.interpolate ? 1 : 0);
      gl.uniform1i(this.pu.u_blendMode, ov.mode === 'multiply' ? 1 : 0);
      gl.uniform1f(this.pu.u_overlayOpacity, Math.min(1, Math.max(0, ov.opacity ?? 0.5)));
    }
    gl.bindVertexArray(this.quadVao);
    // planes are opaque; the depth buffer resolves intersections, so
    // draw order does not matter for correctness
    for (const id of order) {
      const p = this.planes.get(id);
      if (!p) continue;
      gl.uniform3f(this.pu.u_origin, p.quad.origin[0], p.quad.origin[1], p.quad.origin[2]);
      gl.uniform3f(this.pu.u_du, p.quad.du[0], p.quad.du[1], p.quad.du[2]);
      gl.uniform3f(this.pu.u_dv, p.quad.dv[0], p.quad.dv[1], p.quad.dv[2]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, p.rmsTex);
      const on = this.overlayActiveFor(id);
      gl.uniform1i(this.pu.u_overlayOn, on ? 1 : 0);
      if (on) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, p.texB);
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, p.rmsTexB);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // opaque interpretation surfaces, slightly pulled toward the eye so
    // a horizon lying exactly on a time slice still wins the depth test
    const sc = this.scale;
    const opaque = [];
    const translucent = [];
    for (const m of this.meshes.values()) {
      (m.opacity < 1 ? translucent : opaque).push(m);
    }
    if (opaque.length || translucent.length) {
      gl.useProgram(this.meshProg);
      gl.uniformMatrix4fv(this.mu.u_mvp, false, mvp);
      gl.uniform3f(this.mu.u_scale, sc[0], sc[1], sc[2]);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -1);
      for (const m of opaque) {
        gl.uniform4f(this.mu.u_color, m.color[0], m.color[1], m.color[2], 1);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(this.lu.u_mvp, false, mvp);
    if (this.lineVertCount) {
      const ec = EDGE_COLOR[this.background];
      gl.uniform3f(this.lu.u_scale, 1, 1, 1);       // edges are ext-space
      gl.uniform4f(this.lu.u_color, ec[0], ec[1], ec[2], ec[3]);
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, this.lineVertCount);
    }
    if (this.lineSets.size) {
      gl.uniform3f(this.lu.u_scale, sc[0], sc[1], sc[2]);
      for (const l of this.lineSets.values()) {
        const a = l.color.length > 3 ? l.color[3] : 1;
        // translucent line sets (fault opacity setting) need blending;
        // opaque ones keep the original blend-free path
        if (a < 1) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.uniform4f(this.lu.u_color, l.color[0], l.color[1], l.color[2], a);
        gl.bindVertexArray(l.vao);
        gl.drawArrays(gl.LINES, 0, l.count);
        if (a < 1) gl.disable(gl.BLEND);
      }
    }

    if (translucent.length) {
      gl.useProgram(this.meshProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const m of translucent) {
        gl.uniform4f(this.mu.u_color, m.color[0], m.color[1], m.color[2], m.opacity);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    const { gl } = this;
    for (const p of this.planes.values()) {
      gl.deleteTexture(p.tex);
      gl.deleteTexture(p.rmsTex);
      if (p.texB) { gl.deleteTexture(p.texB); gl.deleteTexture(p.rmsTexB); }
    }
    this.pendingSlicesB.clear();
    this.planes.clear();
    this.pendingSlices.clear();
    for (const m of this.meshes.values()) {
      gl.deleteBuffer(m.posBuf);
      gl.deleteBuffer(m.idxBuf);
      gl.deleteVertexArray(m.vao);
    }
    this.meshes.clear();
    this.pendingMeshes.clear();
    for (const l of this.lineSets.values()) {
      gl.deleteBuffer(l.buf);
      gl.deleteVertexArray(l.vao);
    }
    this.lineSets.clear();
    this.pendingLineSets.clear();
    gl.deleteTexture(this.lutTex);
    gl.deleteProgram(this.planeProg);
    gl.deleteProgram(this.lineProg);
    gl.deleteProgram(this.meshProg);
  }
}
