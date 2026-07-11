// Pure-math tests for the 3D interpretation geometry: horizon grid ->
// triangle mesh (null holes, decimation, planeQuad-consistent
// coordinates), fault sticks -> polylines and lofted ribbons.

import {
  horizonMesh, faultPolylines, resamplePolyline, faultRibbonMesh,
} from '../viewer/interpMesh';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const GEOM = { nIl: 4, nXl: 5, ns: 100 };

const flatGrid = (sample, geom = GEOM) =>
  new Float32Array(geom.nIl * geom.nXl).fill(sample);

describe('horizonMesh', () => {
  it('places vertices at texel centres in normalized cube space', () => {
    const mesh = horizonMesh(flatGrid(49.5), GEOM);
    expect(mesh.vertexCount).toBe(4 * 5);
    // vertex (il=0, xl=0)
    expect(mesh.positions[0]).toBeCloseTo(0.5 / 5);      // x = (xl+0.5)/nXl
    expect(mesh.positions[1]).toBeCloseTo(-0.5);         // y = -(s+0.5)/ns
    expect(mesh.positions[2]).toBeCloseTo(0.5 / 4);      // z = (il+0.5)/nIl
    // full lattice: 2 triangles per cell
    expect(mesh.triangleCount).toBe((4 - 1) * (5 - 1) * 2);
  });

  it('drops triangles that touch a null pick but keeps the rest of the quad', () => {
    const grid = flatGrid(10);
    grid[0] = NULL_F32;                       // kill corner (il 0, xl 0)
    const mesh = horizonMesh(grid, GEOM);
    // the corner cell keeps exactly 1 of its 2 triangles
    expect(mesh.triangleCount).toBe((4 - 1) * (5 - 1) * 2 - 1);
    // no triangle references vertex 0
    for (const i of mesh.indices) expect(i).not.toBe(0);
  });

  it('returns an empty index list for an all-null grid', () => {
    const mesh = horizonMesh(flatGrid(NULL_VALUE), GEOM);
    expect(mesh.triangleCount).toBe(0);
  });

  it('decimates large grids but keeps the survey edges', () => {
    const geom = { nIl: 100, nXl: 200, ns: 50 };
    const grid = new Float32Array(geom.nIl * geom.nXl).fill(25);
    const mesh = horizonMesh(grid, geom, { maxDim: 10 });
    expect(mesh.vertexCount).toBeLessThanOrEqual(21 * 21);
    // max x must reach the last crossline's texel centre
    let maxX = 0;
    let maxZ = 0;
    for (let v = 0; v < mesh.vertexCount; v++) {
      maxX = Math.max(maxX, mesh.positions[v * 3]);
      maxZ = Math.max(maxZ, mesh.positions[v * 3 + 2]);
    }
    expect(maxX).toBeCloseTo((geom.nXl - 0.5) / geom.nXl);
    expect(maxZ).toBeCloseTo((geom.nIl - 0.5) / geom.nIl);
  });
});

describe('faultPolylines', () => {
  it('emits a GL_LINES soup per stick in cube space', () => {
    const sticks = [
      { points: [{ il: 0, xl: 0, s: 9.5 }, { il: 0, xl: 2, s: 39.5 }, { il: 0, xl: 4, s: 79.5 }] },
      { points: [{ il: 2, xl: 1, s: 19.5 }] },     // single point: no segment
    ];
    const soup = faultPolylines(sticks, GEOM);
    expect(soup.length).toBe(2 * 2 * 3);            // 2 segments x 2 endpoints x xyz
    expect(soup[0]).toBeCloseTo(0.5 / 5);           // first point x
    expect(soup[1]).toBeCloseTo(-0.1);              // y = -(9.5+0.5)/100
  });
});

describe('resamplePolyline', () => {
  it('is uniform in arc length and keeps the endpoints', () => {
    const pts = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];  // total length 2
    const rs = resamplePolyline(pts, 5);
    expect(rs[0]).toEqual([0, 0, 0]);
    expect(rs[4]).toEqual([1, 1, 0]);
    expect(rs[2]).toEqual([1, 0, 0]);               // halfway = the corner
    expect(rs[1][0]).toBeCloseTo(0.5);
  });
});

describe('faultRibbonMesh', () => {
  const stick = (il, reversed = false) => {
    const pts = [
      { il, xl: 0, s: 10 }, { il, xl: 2, s: 40 }, { il, xl: 4, s: 80 },
    ];
    return { points: reversed ? pts.reverse() : pts };
  };

  it('lofts consecutive sticks into a quad strip', () => {
    const mesh = faultRibbonMesh([stick(0), stick(2)], GEOM, { samples: 4 });
    expect(mesh.positions.length).toBe(2 * 4 * 3);
    expect(mesh.indices.length).toBe((4 - 1) * 6);  // 2 tris per quad
  });

  it('re-orients a reversed stick so the ribbon does not bowtie', () => {
    const straight = faultRibbonMesh([stick(0), stick(2)], GEOM, { samples: 4 });
    const flipped = faultRibbonMesh([stick(0), stick(2, true)], GEOM, { samples: 4 });
    // after auto-orientation both rail layouts are identical
    expect(Array.from(flipped.positions)).toEqual(Array.from(straight.positions));
  });

  it('returns an empty mesh for fewer than two usable sticks', () => {
    const mesh = faultRibbonMesh([stick(0)], GEOM);
    expect(mesh.indices.length).toBe(0);
  });
});
