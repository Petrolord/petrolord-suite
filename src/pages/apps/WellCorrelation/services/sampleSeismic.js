// Synthetic "KETA 3D" seismic volume under the sample section (Seismolord
// U2-002 harness and tests). Closed form, no RNG: Ricker reflectors whose
// middle event follows the sample Dome time surface,
// TWT = 1373 + 0.01 (x - 501000) ms, so the backdrop, the Dome horizon and
// the wells' TWT tops line up by construction. Bricks are 64 cubes built on
// demand, the Seismolord brick layout ((il * 64 + xl) * 64 + sample).

export const KETA3D = Object.freeze({
  id: 'vol-keta',
  name: 'KETA 3D',
  crs: null,
  geometry: {
    il: { min: 1, step: 1, count: 60 },
    xl: { min: 1, step: 1, count: 100 },
    ns: 500,
    dt_us: 4000,
    affine: { origin: { x: 500000, y: 6699000 }, il_vec: { x: 0, y: 50 }, xl_vec: { x: 50, y: 0 } },
  },
});

const B = 64;
const NULL_F32 = Math.fround(1.0e30);
const EVENTS = [[-120, 0.6], [-60, -0.8], [0, 1], [70, -0.9], [150, 0.7]];
const ricker = (tMs, fHz = 25) => {
  const a = (Math.PI * fHz * tMs / 1000) ** 2;
  return (1 - 2 * a) * Math.exp(-a);
};

/** Amplitude at a lattice sample (a Ricker beyond 120 ms of its event is below 1e-30 and taken as 0). */
export function ketaAmplitude(il, xl, s) {
  const x = 500000 + xl * 50;
  const dome = 1373 + 0.01 * (x - 501000);
  const t = s * 4;
  let v = 0;
  for (const [dt, a] of EVENTS) {
    const u = t - (dome + dt);
    if (u > -120 && u < 120) v += a * ricker(u);
  }
  return v + 0.02 * Math.sin(0.05 * t + 0.1 * il);
}

export function ketaGeom() {
  const g = KETA3D.geometry;
  return {
    nIl: g.il.count, nXl: g.xl.count, ns: g.ns, brickSize: B,
    grid: [Math.ceil(g.il.count / B), Math.ceil(g.xl.count / B), Math.ceil(g.ns / B)],
  };
}

/** getBrick(bi, bj, bk) for the synthetic volume, memoised. */
export function ketaBrickSource() {
  const geom = ketaGeom();
  const cache = new Map();
  const getBrick = (bi, bj, bk) => {
    const key = `${bi}-${bj}-${bk}`;
    if (!cache.has(key)) {
      const d = new Float32Array(B * B * B).fill(NULL_F32);
      for (let li = 0; li < B; li++) {
        const il = bi * B + li;
        if (il >= geom.nIl) break;
        for (let lj = 0; lj < B; lj++) {
          const xl = bj * B + lj;
          if (xl >= geom.nXl) break;
          for (let lk = 0; lk < B; lk++) {
            const s = bk * B + lk;
            if (s >= geom.ns) break;
            d[(li * B + lj) * B + lk] = ketaAmplitude(il, xl, s);
          }
        }
      }
      cache.set(key, d);
    }
    return Promise.resolve(cache.get(key));
  };
  return { geom, getBrick, bricksBuilt: () => cache.size };
}
