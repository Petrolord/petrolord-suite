// Analytic harness fixture (Earth Modeling G8.2): the SAME model the
// oracle goldens were generated from (tools/validation/earthmodel/
// genfixtures.py) — three planar surfaces, an L-shaped fault polygon
// (blocks census {0: 326, 1: 174}), four wells (one deviated) with
// tops, zone intervals, and planar zone properties. The Playwright
// suite asserts the ORACLE'S numbers off the rendered UI, so every
// constant here must stay in lockstep with genfixtures.py.
//
// Surfaces are seeded directly ON the goldens' model frame (the model
// frame is the top surface's frame in v1), so harness volumes match
// the goldens' zone tables: zone-A total bulk = 45,000,000 m3.

import { minCurvature, positionAtMd } from '../engine/wellties';

export const MODEL_SPEC = { x0: 1000, y0: 2000, dx: 50, dy: 50, nx: 25, ny: 20 };

export const PLANES = {
  TopA: (x, y) => 1500 + 0.05 * (x - 1000) + 0.02 * (y - 2000),
  TopB: (x, y) => 1530 + 0.06 * (x - 1000) + 0.02 * (y - 2000),
  BaseB: (x, y) => 1561 + 0.02 * (x - 1000) + 0.02 * (y - 2000),
};

export const FAULT_POLYGON = [
  [975, 1975], [1575, 1975], [1575, 2430], [1275, 2430], [1275, 2975], [975, 2975],
];

// Planar zone-property fields evaluated at each zone-A control point
// (offsets from (1000, 2000)), keyed by the registry publish keys.
const PROP_PLANES = {
  phi_avg: [0.32, -4.0e-5, -1.0e-5],
  sw_avg: [0.25, 2.0e-5, 0.0],
  ntg: [0.80, 0.0, -2.0e-5],
};

const WELLS = [
  { name: 'W1', x: 1100, y: 2100, kb: 25,
    deviation: [{ md: 2000, inc: 0, azi: 0 }],
    tops: { TopA: 1530, TopB: 1565, BaseB: 1595 },
    zones: { A: [1530, 1565], B: [1565, 1595] } },
  { name: 'W2', x: 1400, y: 2200, kb: 30,
    deviation: [{ md: 1200, inc: 0, azi: 0 }, { md: 1500, inc: 45, azi: 90 }, { md: 1900, inc: 45, azi: 90 }],
    tops: { TopA: 1580, TopB: 1700, BaseB: 1760 },
    zones: { A: [1580, 1700], B: [1700, 1760] } },
  { name: 'W3', x: 1900, y: 2700, kb: 20,
    deviation: [{ md: 1800, inc: 0, azi: 0 }],
    tops: { TopA: 1580, TopB: 1625, BaseB: 1655 },
    zones: { A: [1580, 1625], B: [1625, 1655] } },
  { name: 'W4', x: 2050, y: 2150, kb: 28,
    deviation: [{ md: 1800, inc: 0, azi: 0 }],
    tops: { TopA: 1584, TopB: 1630, BaseB: 1660 },
    zones: { A: [1584, 1630], B: [1630, 1660] } },
];

const propAt = (coeffs, x, y) => coeffs[0] + coeffs[1] * (x - 1000) + coeffs[2] * (y - 2000);

/** Surface grid (Float32Array) of a fixture plane on the model frame. */
export function planeGrid(planeName) {
  const { x0, y0, dx, dy, nx, ny } = MODEL_SPEC;
  const z = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) z[r * nx + c] = PLANES[planeName](x0 + c * dx, y0 + r * dy);
  }
  return z;
}

/** Wells in the registry row shape, zone properties evaluated on the
 *  planar fields at the engine-computed zone midpoints (exactly the
 *  genfixtures construction). */
export function fixtureWells() {
  return WELLS.map((w, i) => {
    const traj = minCurvature(w.deviation, w.kb, w.x, w.y);
    return {
      id: `em-w${i + 1}`,
      user_id: 'user-dev',
      organization_id: null,
      is_own: true,
      name: w.name,
      surface_x: w.x,
      surface_y: w.y,
      kb_m: w.kb,
      deviation: w.deviation,
      tops: Object.entries(w.tops).map(([name, md], ti) => ({ id: `em-w${i + 1}-t${ti}`, name, md_m: md })),
      zones: Object.entries(w.zones).map(([name, [top, base]], zi) => {
        const pos = positionAtMd(traj, (top + base) / 2);
        const properties = {};
        for (const [key, coeffs] of Object.entries(PROP_PLANES)) {
          properties[key] = propAt(coeffs, pos.x, pos.y);
        }
        return { id: `em-w${i + 1}-z${zi}`, name, top_md_m: top, base_md_m: base, properties };
      }),
    };
  });
}
