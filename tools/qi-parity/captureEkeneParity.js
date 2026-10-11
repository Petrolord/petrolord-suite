/* global test, expect */
/**
 * Records the QI Studio service outputs on Ekene kit cases BEFORE the QI maths
 * moves into the engines (QI course gate E2, 2026-10-11), so the parity test
 * (src/pages/apps/QIStudio/__tests__/qiEngineParity.test.js) can prove the
 * shims give the same numbers afterwards.
 *
 * The inputs come from the Ekene demo kit (tools/demo-dataset buildKit, the
 * generator behind kit v3/v4 the QI videos were recorded on): Ekene-1 to -4
 * and -8 logs converted to two-way time on a 2 ms grid, synthetic traces at
 * the wells from those logs, the Ekene top-sand structure gridded around the
 * field, and an amplitude map bright above the oil-water contact.
 *
 * Run once on the pre-move tree (buildKit takes about 100 s):
 *   npx jest --rootDir . --testMatch '**' + '/tools/qi-parity/captureEkeneParity.js' --testTimeout=600000
 * It writes src/pages/apps/QIStudio/__tests__/fixtures/qiEngineParity.ekene.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildKit } from '../demo-dataset/build.mjs';
import { LOCKED } from '../demo-dataset/spine.mjs';
import { shueyTerms } from '../../packages/engines/engines/qi/avo';
import { forwardPoststack } from '../../packages/engines/engines/qi/inversion';
import { forwardFatti } from '../../packages/engines/engines/qi/prestackInversion';
import { runParityCases, roundInputs, hydrate } from './parityCases';

const DT = 2;
const NS = 320;
const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8'];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ricker = (fp, dtMs, half) => Array.from({ length: 2 * half + 1 }, (_, i) => {
  const t = ((i - half) * dtMs) / 1000; const a = (Math.PI * fp * t) ** 2;
  return (1 - 2 * a) * Math.exp(-a);
});

/** Logs of one well on the 2 ms time grid, by block averaging; returns the grid start too. */
function wellInTime(b, t0Ms) {
  const rows = b.rows;
  let twt = (2 * rows[0].tvd / 1500) * 1000; // water and shallow section at 1500 m/s
  const acc = Array.from({ length: NS }, () => ({ n: 0, ai: 0, si: 0, rho: 0, phi: 0, vpvs: 0, code: [] }));
  let topTwt = null;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) twt += (2 * (rows[i].tvd - rows[i - 1].tvd) / rows[i].vp_m_s) * 1000;
    const r = rows[i];
    if (topTwt == null && r.layerKey === 'EKENE') topTwt = twt;
    const k = Math.floor((twt - t0Ms) / DT);
    if (k < 0 || k >= NS) continue;
    const a = acc[k];
    a.n += 1; a.ai += Math.log(r.ai); a.si += Math.log(r.si); a.rho += Math.log(r.rhob * 1000); a.phi += r.phit; a.vpvs += r.vpvs;
    a.code.push(r.vsh > 0.35 ? 1 : (r.fluid === 'oil' ? 3 : 2));
  }
  const pick = (f) => acc.map((a) => (a.n ? f(a) : NaN));
  const mode = (arr) => { const c = new Map(); for (const v of arr) c.set(v, (c.get(v) || 0) + 1); let best = NaN; let bn = -1; for (const [v, n] of c) if (n > bn) { best = v; bn = n; } return best; };
  return {
    topTwt,
    ln_ai: pick((a) => a.ai / a.n), ln_si: pick((a) => a.si / a.n), ln_rho: pick((a) => a.rho / a.n),
    phit: pick((a) => a.phi / a.n), vpvs: pick((a) => a.vpvs / a.n), facies: pick((a) => mode(a.code)),
  };
}

/** Mean contrasts across the EKENE top, for the modelled intercept and gradient. */
function contrastAtTop(b) {
  const i = b.rows.findIndex((r) => r.layerKey === 'EKENE');
  const mean = (lo, hi, f) => { let s = 0; for (let k = lo; k < hi; k++) s += f(b.rows[k]); return s / (hi - lo); };
  const up = { vp: mean(i - 20, i, (r) => r.vp_m_s), vs: mean(i - 20, i, (r) => r.vs_m_s), rho: mean(i - 20, i, (r) => r.rhob) };
  const dn = { vp: mean(i, i + 20, (r) => r.vp_m_s), vs: mean(i, i + 20, (r) => r.vs_m_s), rho: mean(i, i + 20, (r) => r.rhob) };
  const m = (k) => (up[k] + dn[k]) / 2;
  return { dVpVp: (dn.vp - up.vp) / m('vp'), dVsVs: (dn.vs - up.vs) / m('vs'), dRhoRho: (dn.rho - up.rho) / m('rho'), vsVp: m('vs') / m('vp') };
}

function buildInputs() {
  const kit = buildKit();
  const built = WELLS.map((n) => kit.built.find((b) => b.well.name === n));
  // a common 2 ms window that holds every well's Ekene top
  const tops = built.map((b) => wellInTime(b, 0).topTwt);
  const t0Ms = DT * Math.floor((Math.min(...tops) - 220) / DT);
  const logs = built.map((b) => wellInTime(b, t0Ms));
  const rnd = mulberry32(20261011);
  const noise = (s) => (rnd() - 0.5) * 2 * s;

  const wells = built.map((b, k) => ({ name: b.well.name, il: 1000 + 7 * k, xl: 2000 + 5 * k, x: b.well.x, y: b.well.y, ...logs[k], topTwt: logs[k].topTwt - t0Ms }));
  // a 6 ms log gap in Ekene-2 (a washout), so the hold-fill and coverage masks matter
  for (let i = 140; i < 143; i++) { wells[1].ln_ai[i] = NaN; wells[1].ln_si[i] = NaN; wells[1].ln_rho[i] = NaN; }

  const wavelet = ricker(28, DT, 20);
  const fill = (a) => { const o = a.slice(); let last = o.find(Number.isFinite); for (let i = 0; i < o.length; i++) { if (Number.isFinite(o[i])) last = o[i]; else o[i] = last; } return o; };
  const fullTraces = wells.map((w) => Array.from(forwardPoststack(Float64Array.from(fill(w.ln_ai)), wavelet), (v) => 3.7e4 * v + noise(120)));
  fullTraces[3].fill(1e30, 0, 12); // dead samples at the start of one trace
  const thetaDeg = [10, 20, 30];
  const vsVp = 0.55;
  const angleWavelets = [ricker(30, DT, 20), ricker(27, DT, 20), ricker(24, DT, 20)].map((w, k) => w.map((v) => v * (1 - 0.15 * k)));
  const tracesByWell = wells.map((w) => thetaDeg.map((th, k) => Array.from(forwardFatti({ lnAi: Float64Array.from(fill(w.ln_ai)), lnSi: Float64Array.from(fill(w.ln_si)), lnRho: Float64Array.from(fill(w.ln_rho)) }, [th], [angleWavelets[k]], vsVp)[0], (v) => v + noise(0.004))));
  const aiTraces = wells.map((w) => fill(w.ln_ai).map((v) => Math.exp(v) * (1 + noise(0.03))));
  const vpvsTraces = wells.map((w) => fill(w.vpvs).map((v) => v * (1 + noise(0.02))));

  const avoRows = built.map((b, k) => {
    const t = shueyTerms(contrastAtTop(b));
    const g = 0.0123 * (1 + noise(0.08));
    return {
      name: b.well.name,
      modelled: { A: t.A, B: t.B },
      substituted: { A: t.A * 1.2, B: t.B * 0.9 },
      observed: k === 4 ? null : { A: g * t.A + noise(2e-4), B: g * t.B + noise(4e-4) },
    };
  });
  avoRows.push({ name: 'Ekene-9', modelled: { A: 0.1, B: -0.3 }, observed: { A: 0.001, B: -0.003 }, error: 'no density log' });

  // the Ekene top-sand structure on an 81 x 81, 50 m grid around Ekene-1, as elevation
  const e1 = built[0].well;
  const nx = 81; const ny = 81; const dx = 50;
  const ox = Math.round(e1.x - 40 * dx); const oy = Math.round(e1.y - 40 * dx);
  const elev = [];
  const bright = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const d = kit.geo.topSandAt(ox + c * dx, oy + r * dx);
      elev.push(-d);
      bright.push(d <= LOCKED.owc_m ? 1 + 0.2 * Math.sin(c / 5) : 0.15 + 0.05 * Math.cos(r / 7));
    }
  }

  const inputs = JSON.parse(JSON.stringify(roundInputs({
    dtMs: DT, ns: NS, t0Ms, wavelet, thetaDeg, vsVp, wells, fullTraces, tracesByWell, aiTraces, vpvsTraces, avoRows,
    surface: { nx, ny, dx, origin_x: ox, origin_y: oy, elev, bright, crestX: e1.x + 120, crestY: e1.y - 80 },
  })));
  return inputs;
}

test('capture the QI Studio outputs on the Ekene cases', () => {
  // QI_PARITY_CACHE: a scratch file that keeps the built inputs between runs (buildKit is slow)
  const cache = process.env.QI_PARITY_CACHE;
  let inputs;
  if (cache && fs.existsSync(cache)) inputs = JSON.parse(fs.readFileSync(cache, 'utf8'));
  else { inputs = buildInputs(); if (cache) fs.writeFileSync(cache, JSON.stringify(inputs)); }
  const outputs = runParityCases(hydrate(inputs));
  const dest = path.join(__dirname, '../../src/pages/apps/QIStudio/__tests__/fixtures/qiEngineParity.ekene.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify({ $comment: 'QI Studio outputs on Ekene kit cases recorded before the QI maths moved into the engines (QI course gate E2, 2026-10-11). Written by tools/qi-parity/captureEkeneParity.js on Suite 5df9d9410 (engines cc4c62d); checked by qiEngineParity.test.js.', inputs, outputs })}\n`);
  expect(outputs.blindAbsolute.length).toBe(WELLS.length);
});
