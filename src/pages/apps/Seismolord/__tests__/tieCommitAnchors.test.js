// A committed tie is the well's whole time-depth carried through the tie
// warp. It used to be the anchors alone: a two-anchor tie stored a two-level
// set (the reservoir extrapolated from one line) and a one-anchor tie a
// one-level set that effectiveCheckshots ignores (found 2026-10-09).
import { denseTieWarp } from '../components/SyntheticsPanel';
import { effectiveCheckshots } from '../services/wellsService';
import { makeTieWarp, warpToCheckshots } from '../../../../../packages/engines/engines/seismolord/tieWarp';

// the synthetic's time-depth: 0 to 1500 ms over 0 to 2000 m, faster with depth
const toTvdss = (t) => (t < 0 || t > 1500 ? null : 2000 * (t / 1500) ** 1.2);
toTvdss.range = [0, 1500];

test('one anchor (a bulk shift) commits the whole time-depth, shifted', () => {
  const rows = warpToCheckshots(denseTieWarp(makeTieWarp([{ synTwtMs: 1200, seisTwtMs: 1196 }]), toTvdss.range), toTvdss);
  expect(rows.length).toBeGreaterThan(50);
  expect(rows[0].tvdssM).toBeCloseTo(0, 6);
  expect(rows[rows.length - 1].tvdssM).toBeCloseTo(2000, 6);
  for (const r of rows) expect(r.twtMs - (1500 * (r.tvdssM / 2000) ** (1 / 1.2))).toBeCloseTo(-4, 6);
  const used = effectiveCheckshots({ checkshots: [], checkshots_derived: { rows: rows.map((r) => ({ tvdss_m: r.tvdssM, twt_ms: r.twtMs })) } });
  expect(used.derived).toBe(true);
});

test('two shallow anchors: the reservoir keeps the deeper anchor\'s shift instead of a straight-line extrapolation', () => {
  const warp = makeTieWarp([{ synTwtMs: 150, seisTwtMs: 150 }, { synTwtMs: 970, seisTwtMs: 966 }]);
  const dense = warpToCheckshots(denseTieWarp(warp, toTvdss.range), toTvdss);
  const at = (rows, z) => { let i = 1; while (i < rows.length - 1 && rows[i].tvdssM < z) i++; const f = (z - rows[i - 1].tvdssM) / (rows[i].tvdssM - rows[i - 1].tvdssM); return rows[i - 1].twtMs + f * (rows[i].twtMs - rows[i - 1].twtMs); };
  const z = 1700;
  const truth = 1500 * (z / 2000) ** (1 / 1.2) - 4;
  expect(Math.abs(at(dense, z) - truth)).toBeLessThan(1);
  // negative control: the anchors alone extrapolate the reservoir from one line
  const sparse = warpToCheckshots(warp, toTvdss);
  expect(sparse).toHaveLength(2);
  const slope = (sparse[1].twtMs - sparse[0].twtMs) / (sparse[1].tvdssM - sparse[0].tvdssM);
  const extrap = sparse[1].twtMs + slope * (z - sparse[1].tvdssM);
  expect(Math.abs(extrap - truth)).toBeGreaterThan(20);
});
