// Pure-math tests for the 3D cube viewer: extents/aspect, plane
// parametrization (the uv <-> data-layout contract the shader relies
// on), camera projection/ray consistency, quad picking, ticks.

import {
  cubeExtents, planeQuad, cubeEdges, OrbitCamera, intersectQuad,
  niceTicks, transformPoint, mat4Multiply, mat4Perspective, mat4LookAt,
} from '../viewer/cube3d';

const GEOM = { nIl: 100, nXl: 200, ns: 50 };
const MANIFEST = {
  geometry: {
    il: { min: 1000, step: 2, count: 100 },
    xl: { min: 2000, step: 1, count: 200 },
    ns: 50,
    dt_us: 4000,
    corners: {
      first: { x: 0, y: 0 },
      // 25 m per crossline step, 50 m per inline step
      last: { x: 199 * 25, y: 99 * 50 },
    },
  },
};

describe('cubeExtents', () => {
  it('carries the true ground aspect from corners, normalized to 1', () => {
    const e = cubeExtents(MANIFEST, GEOM, 1);
    // ground: X = 200 xl * 25 m = 5000 m, Z = 100 il * 50 m = 5000 m
    expect(e.X).toBeCloseTo(1);
    expect(e.Z).toBeCloseTo(1);
    expect(e.D).toBeCloseTo(0.6);
  });

  it('falls back to index counts without corners and scales D by vexag', () => {
    const e = cubeExtents(null, GEOM, 2);
    expect(e.X).toBeCloseTo(1);          // 200 crosslines is the max extent
    expect(e.Z).toBeCloseTo(0.5);        // 100 inlines
    expect(e.D).toBeCloseTo(1.2);
  });
});

describe('planeQuad', () => {
  const ext = { X: 1, D: 0.6, Z: 0.5 };

  it('inline: u spans time downward, v spans crosslines', () => {
    const q = planeQuad('inline', 49, GEOM, ext);   // one before centre of 100
    expect(q.origin[2]).toBeCloseTo(((49 + 0.5) / 100) * 0.5);
    expect(q.du).toEqual([0, -0.6, 0]);             // u = sample axis, down
    expect(q.dv).toEqual([1, 0, 0]);                // v = crossline axis
    expect(q.origin[1]).toBe(0);                    // hangs from the top face
  });

  it('time: lies flat at its sample depth, u = crossline, v = inline', () => {
    const q = planeQuad('time', 24, GEOM, ext);
    expect(q.origin[1]).toBeCloseTo(-((24 + 0.5) / 50) * 0.6);
    expect(q.du).toEqual([1, 0, 0]);
    expect(q.dv).toEqual([0, 0, 0.5]);
  });

  it('boundary planes stay inside the cube', () => {
    for (const [o, max] of [['inline', 99], ['xline', 199], ['time', 49]]) {
      for (const idx of [0, max]) {
        const q = planeQuad(o, idx, GEOM, ext);
        for (const k of [0, 1, 2]) {
          const lo = Math.min(q.origin[k], q.origin[k] + q.du[k] + q.dv[k]);
          const hi = Math.max(q.origin[k], q.origin[k] + q.du[k] + q.dv[k]);
          expect(lo).toBeGreaterThanOrEqual(k === 1 ? -0.6 - 1e-9 : -1e-9);
          expect(hi).toBeLessThanOrEqual(k === 0 ? 1 + 1e-9 : k === 1 ? 1e-9 : 0.5 + 1e-9);
        }
      }
    }
  });
});

describe('cubeEdges', () => {
  it('emits 12 segments spanning the box', () => {
    const s = cubeEdges({ X: 1, D: 0.6, Z: 0.5 });
    expect(s.length).toBe(12 * 6);
    let minY = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < s.length; i += 3) {
      minY = Math.min(minY, s[i + 1]);
      maxX = Math.max(maxX, s[i]);
    }
    expect(minY).toBeCloseTo(-0.6);
    expect(maxX).toBeCloseTo(1);
  });
});

describe('OrbitCamera', () => {
  it('projects its target to the viewport centre', () => {
    const cam = new OrbitCamera();
    cam.fitTo({ X: 1, D: 0.6, Z: 0.5 });
    const mvp = cam.viewProj(800, 600);
    const s = cam.project(mvp, cam.target, 800, 600);
    expect(s.x).toBeCloseTo(400, 0);
    expect(s.y).toBeCloseTo(300, 0);
  });

  it('centre-pixel ray hits the plane through the target', () => {
    const cam = new OrbitCamera();
    const ext = { X: 1, D: 0.6, Z: 0.5 };
    cam.fitTo(ext);
    const ray = cam.ray(400, 300, 800, 600);
    // quad centred on the target, facing roughly the camera
    const q = planeQuad('time', 24, { ...GEOM, ns: 50 }, ext);
    // move the quad to pass exactly through target depth
    q.origin[1] = cam.target[1];
    const hit = intersectQuad(ray, q);
    expect(hit).not.toBeNull();
    expect(hit.u).toBeCloseTo(0.5, 1);
    expect(hit.v).toBeCloseTo(0.5, 1);
  });

  it('dolly and pitch clamp to sane ranges', () => {
    const cam = new OrbitCamera();
    cam.dolly(1e9);
    expect(cam.dist).toBeLessThanOrEqual(cam.maxDist);
    cam.orbit(0, 100);
    expect(cam.pitch).toBeLessThanOrEqual(1.5);
  });
});

describe('intersectQuad', () => {
  const quad = { origin: [0, 0, 0], du: [1, 0, 0], dv: [0, 1, 0] };

  it('returns quad coordinates for a straight hit', () => {
    const hit = intersectQuad(
      { origin: [0.25, 0.75, 5], dir: [0, 0, -1] }, quad,
    );
    expect(hit.u).toBeCloseTo(0.25);
    expect(hit.v).toBeCloseTo(0.75);
    expect(hit.t).toBeCloseTo(5);
  });

  it('misses outside the rectangle and behind the origin', () => {
    expect(intersectQuad({ origin: [1.5, 0.5, 5], dir: [0, 0, -1] }, quad)).toBeNull();
    expect(intersectQuad({ origin: [0.5, 0.5, -5], dir: [0, 0, -1] }, quad)).toBeNull();
    expect(intersectQuad({ origin: [0.5, 0.5, 5], dir: [1, 0, 0] }, quad)).toBeNull();
  });
});

describe('matrix helpers', () => {
  it('lookAt + perspective put a point in front of the eye at ndc centre', () => {
    const proj = mat4Perspective(Math.PI / 3, 1, 0.1, 100);
    const view = mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const mvp = mat4Multiply(proj, view);
    const p = transformPoint(mvp, [0, 0, 0]);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.w).toBeGreaterThan(0);
  });
});

describe('niceTicks', () => {
  it('produces round values inside the range', () => {
    const t = niceTicks(1000, 1398, 5);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t[0]).toBeGreaterThanOrEqual(1000);
    expect(t[t.length - 1]).toBeLessThanOrEqual(1398);
    for (const v of t) expect(v % 100).toBe(0);
  });

  it('degenerate range collapses to one tick', () => {
    expect(niceTicks(5, 5, 4)).toEqual([5]);
  });
});
