// Pure 3D math for the cube viewer — matrices, orbit camera, plane
// geometry, ray picking, tick generation. No WebGL here (jest-testable);
// CubeRenderer consumes these.
//
// Model space (right-handed, y up):
//   x: crossline direction, [0, X]
//   y: time/depth, 0 at the first sample DOWN to -D (domain rule: depth
//      increases downward)
//   z: inline direction, [0, Z]
// X and Z carry the survey's true ground aspect when the manifest has
// corner coordinates (normalized so max(X, Z) = 1); D is a display height
// scaled by the vertical exaggeration (time has no intrinsic ground
// scale).

import { surveySpacing } from './annotations';

// ---- mat4 (column-major, WebGL layout) --------------------------------

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(eye, target, up) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  const x = [
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0],
  ];
  zl = Math.hypot(x[0], x[1], x[2]) || 1;
  x[0] /= zl; x[1] /= zl; x[2] /= zl;
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

export function transformPoint(m, p) {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return {
    x: (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    y: (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    z: (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
    w,
  };
}

// ---- survey cube geometry ---------------------------------------------

/**
 * Normalized cube extents. Ground aspect from manifest corners when
 * available (else index-count aspect); D = 0.6 * vexag so the cube reads
 * like a survey box at vexag 1.
 * @returns {{X:number, D:number, Z:number}}
 */
export function cubeExtents(manifest, geom, vexag = 1) {
  const sp = manifest ? surveySpacing(manifest) : null;
  const wx = geom.nXl * (sp ? sp.xlSpacing : 1);
  const wz = geom.nIl * (sp ? sp.ilSpacing : 1);
  const m = Math.max(wx, wz) || 1;
  return { X: wx / m, D: 0.6 * Math.max(vexag, 1e-3), Z: wz / m };
}

/**
 * A slice plane as a parametric quad: point(u, v) = origin + u*du + v*dv,
 * with (u, v) EXACTLY the assembled slice's normalized texture coords
 * (u = data width axis: samples on sections, crosslines on time slices;
 * v = trace axis: crosslines / inlines). Sections hang downward from the
 * top face; time slices lie flat at their sample depth.
 * @param {'inline'|'xline'|'time'} orientation
 */
export function planeQuad(orientation, index, geom, ext) {
  const { X, D, Z } = ext;
  if (orientation === 'inline') {
    const z0 = ((index + 0.5) / geom.nIl) * Z;
    return { origin: [0, 0, z0], du: [0, -D, 0], dv: [X, 0, 0] };
  }
  if (orientation === 'xline') {
    const x0 = ((index + 0.5) / geom.nXl) * X;
    return { origin: [x0, 0, 0], du: [0, -D, 0], dv: [0, 0, Z] };
  }
  const y0 = -((index + 0.5) / geom.ns) * D;
  return { origin: [0, y0, 0], du: [X, 0, 0], dv: [0, 0, Z] };
}

/** 12 cube edges as a flat xyz line-segment list (24 vertices). */
export function cubeEdges(ext) {
  const { X, D, Z } = ext;
  const c = [
    [0, 0, 0], [X, 0, 0], [X, 0, Z], [0, 0, Z],          // top face
    [0, -D, 0], [X, -D, 0], [X, -D, Z], [0, -D, Z],      // bottom face
  ];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const out = new Float32Array(pairs.length * 6);
  pairs.forEach(([a, b], i) => {
    out.set(c[a], i * 6);
    out.set(c[b], i * 6 + 3);
  });
  return out;
}

// ---- orbit camera ------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class OrbitCamera {
  constructor() {
    this.yaw = -0.6;            // azimuth, radians
    this.pitch = 0.42;          // elevation, radians (+ = looking down)
    this.dist = 3;
    this.target = [0.5, -0.3, 0.5];
    this.fov = (35 * Math.PI) / 180;
    this.minDist = 0.2;
    this.maxDist = 40;
  }

  /** Frame the whole cube with a comfortable margin. */
  fitTo(ext) {
    this.target = [ext.X / 2, -ext.D / 2, ext.Z / 2];
    const radius = 0.5 * Math.hypot(ext.X, ext.D, ext.Z);
    this.dist = clamp((radius / Math.sin(this.fov / 2)) * 1.1,
      this.minDist, this.maxDist);
  }

  eye() {
    const cp = Math.cos(this.pitch);
    return [
      this.target[0] + this.dist * cp * Math.sin(this.yaw),
      this.target[1] + this.dist * Math.sin(this.pitch),
      this.target[2] + this.dist * cp * Math.cos(this.yaw),
    ];
  }

  orbit(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, -1.5, 1.5);
  }

  dolly(factor) {
    this.dist = clamp(this.dist * factor, this.minDist, this.maxDist);
  }

  /** Screen-pixel pan: shift the target along the camera's right/up. */
  pan(dxPx, dyPx, viewH) {
    const { right, up } = this.#basis();
    const worldPerPx = (2 * this.dist * Math.tan(this.fov / 2)) / Math.max(viewH, 1);
    for (let i = 0; i < 3; i++) {
      this.target[i] += (-dxPx * right[i] + dyPx * up[i]) * worldPerPx;
    }
  }

  #basis() {
    const eye = this.eye();
    const f = [
      this.target[0] - eye[0], this.target[1] - eye[1], this.target[2] - eye[2],
    ];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    const fwd = [f[0] / fl, f[1] / fl, f[2] / fl];
    let right = [fwd[2], 0, -fwd[0]];           // cross(fwd, worldUp=[0,1,0])
    const rl = Math.hypot(right[0], right[1], right[2]) || 1;
    right = [right[0] / rl, right[1] / rl, right[2] / rl];
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0],
    ];
    return { fwd, right, up };
  }

  viewProj(viewW, viewH) {
    const aspect = Math.max(viewW, 1) / Math.max(viewH, 1);
    const proj = mat4Perspective(this.fov, aspect,
      Math.max(this.dist / 100, 0.01), this.dist * 10 + 10);
    const view = mat4LookAt(this.eye(), this.target, [0, 1, 0]);
    return mat4Multiply(proj, view);
  }

  /** Model point -> CSS-pixel screen point (null when behind the eye). */
  project(mvp, p, viewW, viewH) {
    const c = transformPoint(mvp, p);
    if (c.w <= 0) return null;
    return {
      x: (c.x * 0.5 + 0.5) * viewW,
      y: (1 - (c.y * 0.5 + 0.5)) * viewH,
      depth: c.z,
    };
  }

  /** Pixel -> world ray {origin, dir}. */
  ray(sx, sy, viewW, viewH) {
    const { fwd, right, up } = this.#basis();
    const tanF = Math.tan(this.fov / 2);
    const aspect = Math.max(viewW, 1) / Math.max(viewH, 1);
    const nx = ((sx / Math.max(viewW, 1)) * 2 - 1) * tanF * aspect;
    const ny = (1 - (sy / Math.max(viewH, 1)) * 2) * tanF;
    const dir = [
      fwd[0] + nx * right[0] + ny * up[0],
      fwd[1] + nx * right[1] + ny * up[1],
      fwd[2] + nx * right[2] + ny * up[2],
    ];
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return { origin: this.eye(), dir: [dir[0] / dl, dir[1] / dl, dir[2] / dl] };
  }
}

// ---- ray / plane-quad intersection -------------------------------------

/**
 * Intersect a ray with a parametric quad (origin + u*du + v*dv,
 * 0 <= u,v <= 1). Returns {u, v, t} (t = ray distance) or null.
 */
export function intersectQuad(ray, quad) {
  // Solve o + t*d = q0 + u*du + v*dv  (3 equations, unknowns t, u, v)
  const [dx, dy, dz] = ray.dir;
  const { du, dv } = quad;
  // column matrix [ -d | du | dv ] * [t, u, v]^T = o - q0... rearranged:
  const a = [-dx, -dy, -dz];
  const b = du;
  const c = dv;
  const r = [
    ray.origin[0] - quad.origin[0],
    ray.origin[1] - quad.origin[1],
    ray.origin[2] - quad.origin[2],
  ];
  const det = a[0] * (b[1] * c[2] - b[2] * c[1])
    - b[0] * (a[1] * c[2] - a[2] * c[1])
    + c[0] * (a[1] * b[2] - a[2] * b[1]);
  if (Math.abs(det) < 1e-12) return null;       // ray parallel to plane
  const det3 = (p, q, s) => p[0] * (q[1] * s[2] - q[2] * s[1])
    - q[0] * (p[1] * s[2] - p[2] * s[1])
    + s[0] * (p[1] * q[2] - p[2] * q[1]);
  const t = det3(r, b, c) / det;
  const u = det3(a, r, c) / det;
  const v = det3(a, b, r) / det;
  if (t <= 0 || u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v, t };
}

// ---- axis ticks ---------------------------------------------------------

/** ~n nice tick values spanning [min, max] (inclusive-ish). */
export function niceTicks(min, max, n = 5) {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return [min];
  const span = max - min;
  const raw = span / Math.max(n - 1, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : Number(v.toPrecision(12)));
  }
  return out.length ? out : [min];
}
