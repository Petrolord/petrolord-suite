// The QI showcase video's prestack demo file: kit v4's NMO-corrected gathers
// with multiples and random noise added, so QI Studio's Conditioning section
// (Radon multiple removal, f-x noise attenuation) has something to remove.
// The kit gathers are clean modelled primaries; this variant is derived from
// them deterministically (fixed seed), so the file is the same on every run.
//
//   EKENE3D-v4-gathers-nmo-multiples.sgy
//     every byte of every trace header and of the file headers is the kit's,
//     except card C 2 of the text header, which says it is this variant.
//     The samples are   primaries + multiples + noise, where
//     multiples(t, x) = sum_k a_k * near(t - tau_k - q_k (x / xmax)^2)
//       near  = the gather's own nearest-offset trace (the primaries),
//               tapered to the source window of each multiple,
//       x     = offset, xmax = 2500 m (the far bin),
//       tau   = the multiple's delay at zero offset, q its residual moveout
//               after NMO at the far bin (positive: undercorrected, the way
//               a multiple at the primaries' velocity looks).
//     MULTIPLES below lists them. The first lands the strong 925 ms event
//     just under the Ekene Sand top (about 1290 ms).
//     noise = Gaussian (fixed seed) band-limited by a 30 Hz Ricker, scaled to
//             NOISE_FRAC of the kit gathers' RMS.
//     The kit's mute is kept: a sample that is exactly zero in the kit stays
//     exactly zero.
//   qi-showcase-truth.json  the parameters above and the measured RMS of each
//                           part, for the narration.
//
//   node tools/demo-video/seed/qi_showcase_assets.mjs [outDir] [--kit DIR]
// Upload EKENE3D-v4-gathers-nmo-multiples.sgy to the ekene-demo-v4 release.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const out = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || '/root/demo-video-work/qisc-assets';
const KIT = opt('kit', process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4');
const SRC = path.join(KIT, '04-seismic/gathers/EKENE3D-v4-gathers-nmo.sgy');
const NAME = 'EKENE3D-v4-gathers-nmo-multiples.sgy';

// [source window from, to (ms), delay tau (ms), residual moveout q at the far bin (ms), amplitude]
export const MULTIPLES = [
  { from: 860, to: 1000, tau: 390, q: 90, a: -0.55, label: 'interbed multiple of the 925 ms event, under the Ekene Sand top' },
  { from: 120, to: 700, tau: 760, q: 150, a: -0.35, label: 'long-period surface multiple of the shallow section' },
  { from: 860, to: 1000, tau: 780, q: 190, a: 0.25, label: 'second order of the 925 ms event' },
];
export const NOISE_FRAC = 0.22;
const SEED = 20261016;

const buf = fs.readFileSync(SRC);
const dtUs = buf.readUInt16BE(3200 + 16);
const ns = buf.readUInt16BE(3200 + 20);
const fmt = buf.readUInt16BE(3200 + 24);
if (fmt !== 5) throw new Error(`expected IEEE float (format 5), got ${fmt}`);
const dt = dtUs / 1000;
const TL = 240 + ns * 4;
const ntr = (buf.length - 3600) / TL;
if (!Number.isInteger(ntr)) throw new Error('trace length does not divide the file');
const offsetOf = (k) => buf.readInt32BE(3600 + k * TL + 36);
// gathers are consecutive traces sharing a CDP (bytes 21-24)
const cdpOf = (k) => buf.readInt32BE(3600 + k * TL + 20);
const readTrace = (k) => { const a = new Float64Array(ns); const o = 3600 + k * TL + 240; for (let i = 0; i < ns; i++) a[i] = buf.readFloatBE(o + 4 * i); return a; };

let xmax = 0; for (let k = 0; k < ntr; k++) xmax = Math.max(xmax, offsetOf(k));

// fixed-seed Gaussian (Park-Miller + Box-Muller)
let s = SEED % 2147483647;
const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
const rickerW = []; { const f = 30; for (let i = -12; i <= 12; i++) { const a = (Math.PI * f * i * dt / 1000) ** 2; rickerW.push((1 - 2 * a) * Math.exp(-a)); } }
const bandNoise = () => {
  const w = new Float64Array(ns + rickerW.length); for (let i = 0; i < w.length; i++) w[i] = gauss();
  const o = new Float64Array(ns); for (let i = 0; i < ns; i++) { let v = 0; for (let j = 0; j < rickerW.length; j++) v += rickerW[j] * w[i + j]; o[i] = v; }
  return o;
};
let nrms = 0; { const t = bandNoise(); for (const v of t) nrms += v * v; nrms = Math.sqrt(nrms / ns); }

// kit RMS over live samples
let ss = 0; let nn = 0;
for (let k = 0; k < ntr; k += 7) { const t = readTrace(k); for (const v of t) if (v !== 0) { ss += v * v; nn++; } }
const kitRms = Math.sqrt(ss / nn);
const noiseScale = (NOISE_FRAC * kitRms) / nrms;

// linear-interpolated sample of a trace at fractional index, with a cosine taper to [from, to] ms
const tapered = (tr, tMs, from, to) => {
  if (tMs < from || tMs > to) return 0;
  const edge = 20; const w = Math.min(1, (tMs - from) / edge, (to - tMs) / edge);
  const x = tMs / dt; const i = Math.floor(x); const f = x - i;
  if (i < 0 || i + 1 >= ns) return 0;
  return (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, w))) * (tr[i] * (1 - f) + tr[i + 1] * f);
};

const outBuf = Buffer.from(buf);
// text header card C 2 (EBCDIC): say this is the demo variant
{
  const card = 'C 2 SURVEY EKENE 3D V4 NMO GATHERS WITH MULTIPLES AND NOISE - DEMO VARIANT'.padEnd(80, ' ');
  const e = Buffer.from(card, 'latin1');
  const toEbcdic = (c) => { const m = { ' ': 0x40, '-': 0x60, '.': 0x4b, '/': 0x61 }; if (m[c] != null) return m[c]; const n = c.charCodeAt(0);
    if (n >= 48 && n <= 57) return 0xf0 + n - 48; if (n >= 65 && n <= 73) return 0xc1 + n - 65; if (n >= 74 && n <= 82) return 0xd1 + n - 74; if (n >= 83 && n <= 90) return 0xe2 + n - 83; return 0x40; };
  for (let i = 0; i < 80; i++) outBuf[80 + i] = toEbcdic(String.fromCharCode(e[i]));
}
const acc = { prim: 0, mult: 0, noise: 0, n: 0, target: { prim: 0, mult: 0, n: 0 } };
let k = 0;
while (k < ntr) {
  const c = cdpOf(k); let e = k; while (e < ntr && cdpOf(e) === c) e++;
  // nearest-offset trace of this gather
  let nk = k; for (let j = k; j < e; j++) if (offsetOf(j) < offsetOf(nk)) nk = j;
  const near = readTrace(nk);
  for (let j = k; j < e; j++) {
    const tr = readTrace(j); const r2 = (offsetOf(j) / xmax) ** 2; const noise = bandNoise();
    const o = 3600 + j * TL + 240;
    for (let i = 0; i < ns; i++) {
      if (tr[i] === 0) continue; // the kit's mute stays exact
      const t = i * dt;
      let m = 0; for (const M of MULTIPLES) m += M.a * tapered(near, t - M.tau - M.q * r2, M.from, M.to);
      const n = noiseScale * noise[i];
      outBuf.writeFloatBE(tr[i] + m + n, o + 4 * i);
      acc.prim += tr[i] ** 2; acc.mult += m * m; acc.noise += n * n; acc.n++;
      if (t >= 1200 && t <= 1400) { acc.target.prim += tr[i] ** 2; acc.target.mult += m * m; acc.target.n++; }
    }
  }
  k = e;
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, NAME), outBuf);
const rms = (x, n) => Math.sqrt(x / n);
const truth = {
  file: NAME, source: 'EKENE3D-v4-gathers-nmo.sgy (kit v4)', traces: ntr, ns, dtMs: dt, xmaxM: xmax, seed: SEED,
  multiples: MULTIPLES, noiseFraction: NOISE_FRAC,
  rms: { primaries: rms(acc.prim, acc.n), multiples: rms(acc.mult, acc.n), noise: rms(acc.noise, acc.n) },
  target1200to1400ms: { primaries: rms(acc.target.prim, acc.target.n), multiples: rms(acc.target.mult, acc.target.n) },
};
truth.signalToNoiseDb = 20 * Math.log10(truth.rms.primaries / truth.rms.noise);
fs.writeFileSync(path.join(out, 'qi-showcase-truth.json'), JSON.stringify(truth, null, 2));
console.log(`wrote ${path.join(out, NAME)} (${outBuf.length} bytes, ${ntr} traces)`);
console.log(JSON.stringify(truth.rms), 'S/N dB', truth.signalToNoiseDb.toFixed(1), 'target', JSON.stringify(truth.target1200to1400ms));
