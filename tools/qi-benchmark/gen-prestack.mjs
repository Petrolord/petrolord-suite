// Synthetic NMO-corrected prestack gathers with known truth (QI round 3,
// prestack conditioning live check; not shipped). Every CDP holds three
// primaries with their own intercept and gradient (in (x/xmax)^2), three
// parabolic multiples (one starting on a primary) and, with --noise, random
// noise. The truth is a function of the offset and time only, so the
// analysis can rebuild it for any CDP. Bundled with esbuild (it imports the
// engines' SEG-Y writer) and run with node on the worker host.
// usage: node gen-prestack.mjs <out.sgy> [--multiples 1] [--noise 0.06] [--nil 24] [--nxl 24]
import fs from 'node:fs';
import { writeSegy } from '../../packages/engines/engines/seismolord/segyWrite.js';

export const NS = 500; export const DT = 4; export const W = 100; export const NB = 24;
export const OFFS = Array.from({ length: NB }, (_, b) => (b + 0.5) * W);
export const XM = OFFS[NB - 1];
export const PRIM = [[500, 1, -0.6], [1000, 0.7, 0.5], [1500, -0.5, -0.4]];
export const MULT = [[750, 0.8, 80], [1000, 0.6, 140], [1250, -0.6, 120]];
const ricker = (t) => { const a = (Math.PI * 25 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
export const prim = (x, i) => PRIM.reduce((s, [t0, A, B]) => s + (A + B * (x / XM) ** 2) * ricker(i * DT - t0), 0);
export const mult = (x, i) => MULT.reduce((s, [t0, a, q]) => s + a * ricker(i * DT - t0 - q * (x / XM) ** 2), 0);

if (process.argv[1] && process.argv[1].endsWith('gen-prestack.mjs')) {
  const out = process.argv[2];
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const withM = arg('multiples', 1) > 0; const noise = arg('noise', 0); const nil = arg('nil', 24); const nxl = arg('nxl', 24);
  let seed = 11; const u = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const g = () => { let s = 0; for (let k = 0; k < 12; k++) s += u(); return s; };
  const traces = [];
  for (let i = 0; i < nil; i++) for (let j = 0; j < nxl; j++) for (const o of OFFS) {
    traces.push({ il: 1001 + i, xl: 2001 + j, x: 500000 + 25 * j, y: 6000000 + 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => prim(o, s) + (withM ? mult(o, s) : 0) + noise * g()) });
  }
  fs.writeFileSync(out, writeSegy({ lines: ['PETROLORD QI ROUND 3 SYNTHETIC PRESTACK GATHERS, NMO-CORRECTED, KNOWN TRUTH'], dtUs: DT * 1000, ns: NS, traces }));
  console.log(`wrote ${out}: ${traces.length} traces, ${nil} x ${nxl} CDPs, ${NB} offsets, multiples ${withM}, noise ${noise}`);
}
