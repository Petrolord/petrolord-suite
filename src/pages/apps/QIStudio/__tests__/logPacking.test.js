import { packLog, unpackLog } from '../services/logPacking';

// a log on the volume's time axis: gaps above and below the logged interval
const NS = 951;
const lnLog = (seed) => Array.from({ length: NS }, (_, i) => (i < 300 || i > 900 ? NaN : 15 + 0.6 * Math.sin(i / (17 + seed)) + 0.002 * ((i * 7919 * (seed + 1)) % 97)));

test('a packed log comes back on the same axis, gaps kept, within half a step', () => {
  const v = lnLog(1); v[500] = NaN;
  const p = packLog(v);
  expect(p).toMatchObject({ packed: 1, ns: NS, i0: 300, n: 601 });
  const back = unpackLog(JSON.parse(JSON.stringify(p)));
  expect(back).toHaveLength(NS);
  for (let i = 0; i < NS; i++) {
    if (Number.isFinite(v[i])) expect(Math.abs(back[i] - v[i])).toBeLessThanOrEqual(p.step / 2 + 1e-12);
    else expect(back[i]).toBeNaN();
  }
  expect(p.step).toBeLessThan(3e-5);
});

test('whole numbers (facies codes) are exact; an empty log and plain arrays read back', () => {
  const codes = Array.from({ length: 50 }, (_, i) => (i % 7 === 0 ? NaN : i % 3));
  const back = unpackLog(packLog(codes));
  codes.forEach((c, i) => (Number.isFinite(c) ? expect(back[i]).toBe(c) : expect(back[i]).toBeNaN()));
  expect(unpackLog(packLog([NaN, null, NaN]))).toEqual([NaN, NaN, NaN]);
  expect(unpackLog([1, null, 2])).toEqual([1, NaN, 2]);
  const flat = unpackLog(packLog([NaN, 3.25, 3.25]));
  expect(flat[1]).toBe(3.25);
});

test('four wells of AI, SI and density fit the 64 KB job limit packed; as plain numbers they do not (the Ekene failure)', () => {
  const wells = [0, 1, 2, 3].map((k) => ({ name: `W${k}`, il: k, xl: k, ln_ai: lnLog(k), ln_si: lnLog(k + 4), ln_rho: lnLog(k + 8) }));
  const plain = JSON.stringify({ wells });
  const packed = JSON.stringify({ wells: wells.map((w) => ({ ...w, ln_ai: packLog(w.ln_ai), ln_si: packLog(w.ln_si), ln_rho: packLog(w.ln_rho) })) });
  expect(plain.length).toBeGreaterThan(65536);
  expect(packed.length).toBeLessThan(65536 / 3);
});

test('a damaged packed log is refused', () => {
  const p = packLog(lnLog(2));
  expect(() => unpackLog({ ...p, n: p.n + 1 })).toThrow(/damaged/);
  expect(() => unpackLog({ ns: 3 })).toThrow(/neither an array nor a packed log/);
});
