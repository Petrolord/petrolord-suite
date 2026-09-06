// Minimal raw-WebGL2 scene renderer for framework windows (Earth
// Modeling EM6, 2026-09-06): line sets (GL_LINES soups) and triangle
// meshes with a colour per vertex, both in normalized model space scaled
// by u_scale = (X, D, Z) so a vertical-exaggeration change is a uniform
// update. Faceted two-sided shading from screen-space derivatives, no
// normals. The shader shapes follow Seismolord's CubeRenderer; this one
// has no textures. preserveDrawingBuffer stays on for PNG snapshots.

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

const MESH_VERT = `#version 300 es
in vec3 a_pos;
in vec3 a_col;
uniform mat4 u_mvp;
uniform vec3 u_scale;
out vec3 v_world;
out vec3 v_col;
void main() {
  v_world = a_pos * u_scale;
  v_col = a_col;
  gl_Position = u_mvp * vec4(v_world, 1.0);
}`;

const MESH_FRAG = `#version 300 es
precision highp float;
in vec3 v_world;
in vec3 v_col;
uniform float u_alpha;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(v_world), dFdy(v_world)));
  float nl = abs(dot(n, normalize(vec3(0.4, 0.8, 0.45))));
  outColor = vec4(v_col * (0.6 + 0.4 * nl), u_alpha);
}`;

const BG = { dark: [2 / 255, 6 / 255, 23 / 255, 1], light: [1, 1, 1, 1] };

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  return sh;
}
function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export class SceneRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.scale = [1, 1, 1];
    this.lineProg = link(gl, LINE_VERT, LINE_FRAG);
    this.meshProg = link(gl, MESH_VERT, MESH_FRAG);
    this.lu = { mvp: gl.getUniformLocation(this.lineProg, 'u_mvp'), scale: gl.getUniformLocation(this.lineProg, 'u_scale'), color: gl.getUniformLocation(this.lineProg, 'u_color') };
    this.mu = { mvp: gl.getUniformLocation(this.meshProg, 'u_mvp'), scale: gl.getUniformLocation(this.meshProg, 'u_scale'), alpha: gl.getUniformLocation(this.meshProg, 'u_alpha') };
    this.lines = new Map();
    this.meshes = new Map();
  }

  setScale(x, d, z) { this.scale = [x, d, z]; }

  /** @param {{positions: Float32Array, color: number[], alpha?: number, scaled?: boolean}} spec */
  setLineSet(id, spec) {
    const { gl } = this;
    let e = this.lines.get(id);
    if (!e) {
      e = { vao: gl.createVertexArray(), buf: gl.createBuffer() };
      gl.bindVertexArray(e.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, e.buf);
      const a = gl.getAttribLocation(this.lineProg, 'a_pos');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
      this.lines.set(id, e);
    } else {
      gl.bindVertexArray(e.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, e.buf);
    }
    gl.bufferData(gl.ARRAY_BUFFER, spec.positions, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    e.count = spec.positions.length / 3;
    e.color = spec.color || [0.7, 0.7, 0.7];
    e.alpha = spec.alpha ?? 1;
    e.scaled = spec.scaled !== false;
  }

  /** @param {{positions: Float32Array, colors: Float32Array, indices: Uint32Array, alpha?: number}} spec */
  setMesh(id, spec) {
    const { gl } = this;
    if (!spec || !spec.indices.length) { this.removeMesh(id); return; }
    let e = this.meshes.get(id);
    if (!e) {
      e = { vao: gl.createVertexArray(), posBuf: gl.createBuffer(), colBuf: gl.createBuffer(), idxBuf: gl.createBuffer() };
      gl.bindVertexArray(e.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, e.posBuf);
      const ap = gl.getAttribLocation(this.meshProg, 'a_pos');
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, e.colBuf);
      const ac = gl.getAttribLocation(this.meshProg, 'a_col');
      gl.enableVertexAttribArray(ac);
      gl.vertexAttribPointer(ac, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e.idxBuf);
      this.meshes.set(id, e);
    } else {
      gl.bindVertexArray(e.vao);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, e.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, spec.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, e.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, spec.colors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, spec.indices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    e.count = spec.indices.length;
    e.alpha = spec.alpha ?? 1;
  }

  removeMesh(id) {
    const e = this.meshes.get(id);
    if (!e) return;
    const { gl } = this;
    gl.deleteBuffer(e.posBuf); gl.deleteBuffer(e.colBuf); gl.deleteBuffer(e.idxBuf); gl.deleteVertexArray(e.vao);
    this.meshes.delete(id);
  }
  removeLineSet(id) {
    const e = this.lines.get(id);
    if (!e) return;
    this.gl.deleteBuffer(e.buf); this.gl.deleteVertexArray(e.vao);
    this.lines.delete(id);
  }
  /** Drop every line set and mesh whose id is not in `keep`. */
  prune(keep) {
    for (const id of [...this.lines.keys()]) if (!keep.has(id)) this.removeLineSet(id);
    for (const id of [...this.meshes.keys()]) if (!keep.has(id)) this.removeMesh(id);
  }

  draw(mvp, background = 'dark') {
    const { gl, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const bg = BG[background] || BG.dark;
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const sc = this.scale;
    if (this.meshes.size) {
      gl.useProgram(this.meshProg);
      gl.uniformMatrix4fv(this.mu.mvp, false, mvp);
      gl.uniform3f(this.mu.scale, sc[0], sc[1], sc[2]);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      for (const m of this.meshes.values()) {
        gl.uniform1f(this.mu.alpha, m.alpha);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(this.lu.mvp, false, mvp);
    for (const l of this.lines.values()) {
      if (!l.count) continue;
      gl.uniform3f(this.lu.scale, l.scaled ? sc[0] : 1, l.scaled ? sc[1] : 1, l.scaled ? sc[2] : 1);
      gl.uniform4f(this.lu.color, l.color[0], l.color[1], l.color[2], l.alpha);
      gl.bindVertexArray(l.vao);
      gl.drawArrays(gl.LINES, 0, l.count);
    }
    gl.bindVertexArray(null);
  }

  snapshot() { return this.canvas.toDataURL('image/png'); }

  dispose() {
    const { gl } = this;
    for (const id of [...this.lines.keys()]) this.removeLineSet(id);
    for (const id of [...this.meshes.keys()]) this.removeMesh(id);
    gl.deleteProgram(this.lineProg);
    gl.deleteProgram(this.meshProg);
  }
}
