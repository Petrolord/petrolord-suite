// Reads a gather_panel export (input store beside its conditioned copy) and
// measures, against the generator's truth: the multiple (or noise) energy
// removed in dB and each primary's intercept and gradient error, per CDP.
// usage: node analyse-prestack.mjs <panel.json>  (written by drive-qi.mjs op 'panel')
import fs from 'node:fs';
import { NB, DT, OFFS, XM, PRIM, prim } from './gen-prestack.mjs';

const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { gathers, window: win } = p.meta; const nw = win.ns; const t0 = win.t0_ms;
const at = (st, q, b, i) => p.data[((st * gathers.length + q) * NB + b) * nw + i];
const xs = OFFS.map((x) => (x / XM) ** 2);
const fit = (ys) => { const n = xs.length; const mx = xs.reduce((a, b) => a + b) / n; const my = ys.reduce((a, b) => a + b) / n; let sxy = 0; let sxx = 0; xs.forEach((x, k) => { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) ** 2; }); const B = sxy / sxx; return { A: my - B * mx, B }; };
const rows = gathers.map((gg, q) => {
  let eIn = 0; let eOut = 0;
  for (let b = 0; b < NB; b++) for (let i = 0; i < nw; i++) { const s = Math.round((t0 + i * win.dt_ms) / DT); const tr = prim(OFFS[b], s); eIn += (at(0, q, b, i) - tr) ** 2; eOut += (at(1, q, b, i) - tr) ** 2; }
  const avo = PRIM.map(([tp, A, B]) => { const i = Math.round((tp - t0) / win.dt_ms); const f0 = fit(OFFS.map((_, b) => at(0, q, b, i))); const f1 = fit(OFFS.map((_, b) => at(1, q, b, i))); return { t_ms: tp, A_in_pct: 100 * (f0.A - A) / Math.abs(A), B_in_pct: 100 * (f0.B - B) / Math.abs(B), A_out_pct: 100 * (f1.A - A) / Math.abs(A), B_out_pct: 100 * (f1.B - B) / Math.abs(B) }; });
  return { il: gg.il, xl: gg.xl, removed_db: 10 * Math.log10(eIn / eOut), avo };
});
console.log(JSON.stringify(rows, null, 1));
