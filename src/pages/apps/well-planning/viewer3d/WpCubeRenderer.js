// Minimal raw-WebGL2 line renderer for the Well Design Studio 3D view
// (WD5). Line-segment soups only — well paths, EOU rings, targets,
// tops, axes — no textures, no three.js (house playbook). Camera math
// is shared with the Seismolord cube window (viewer/cube3d.js — pure,
// jest-tested, app-agnostic); only the GL layer lives here.
// preserveDrawingBuffer stays on so the snapshot button can read the
// canvas after the frame.

const LINE_VERT = `#version 300 es
in vec3 a_pos;
uniform mat4 u_mvp;
void main() { gl_Position = u_mvp * vec4(a_pos, 1.0); }`;

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

export function cssColorToRgb(css) {
  const m = /^#([0-9a-f]{6})$/i.exec(css || '');
  if (!m) return [0.6, 0.65, 0.72];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export class WpCubeRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.lineSets = new Map(); // id -> {vao, buf, count, color, alpha, width}
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, LINE_VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, LINE_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    this.prog = prog;
    this.uMvp = gl.getUniformLocation(prog, 'u_mvp');
    this.uColor = gl.getUniformLocation(prog, 'u_color');
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  /** Replace one named line set (positions: Float32Array xyz soup). */
  setLineSet(id, { positions, color = [0.6, 0.65, 0.72], alpha = 1 }) {
    const { gl } = this;
    let entry = this.lineSets.get(id);
    if (!entry) {
      const vao = gl.createVertexArray();
      const buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      entry = { vao, buf, count: 0, color, alpha };
      this.lineSets.set(id, entry);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    entry.count = positions.length / 3;
    entry.color = color;
    entry.alpha = alpha;
  }

  removeLineSet(id) {
    const entry = this.lineSets.get(id);
    if (!entry) return;
    this.gl.deleteVertexArray(entry.vao);
    this.gl.deleteBuffer(entry.buf);
    this.lineSets.delete(id);
  }

  /** Drop every set whose id is not in keep. */
  prune(keep) {
    for (const id of [...this.lineSets.keys()]) {
      if (!keep.has(id)) this.removeLineSet(id);
    }
  }

  /** @param {Float32Array} mvp @param {'light'|'dark'} background */
  draw(mvp, background = 'light') {
    const { gl, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    if (background === 'dark') gl.clearColor(2 / 255, 6 / 255, 23 / 255, 1);
    else gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uMvp, false, mvp);
    for (const entry of this.lineSets.values()) {
      if (!entry.count) continue;
      gl.uniform4f(this.uColor, entry.color[0], entry.color[1], entry.color[2], entry.alpha);
      gl.bindVertexArray(entry.vao);
      gl.drawArrays(gl.LINES, 0, entry.count);
    }
    gl.bindVertexArray(null);
  }

  /** PNG data URL of the last drawn frame. */
  snapshot() {
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    for (const id of [...this.lineSets.keys()]) this.removeLineSet(id);
    this.gl.deleteProgram(this.prog);
  }
}
