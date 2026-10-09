// Tool response: what a logging tool would record from the generated rock
// (kit v2, 2026-10-08). The rows the generator builds are the TRUTH: every
// gate and every locked number is computed from them, unchanged. The LAS
// files carry MEASUREMENTS of that truth, made the way real tools make them:
//
//   1. vertical resolution: each tool averages over its own window
//      (Gaussian, full width at half maximum below); resistivity tools
//      average conductivity, so they filter 1/R;
//   2. measurement noise at typical tool precision, seeded and deterministic;
//   3. borehole effects where the shales wash out: the density pad lifts off
//      and reads low, the correction curve DRHO flags it, the neutron reads
//      high.
//
// Without these the crossplots showed every bed as a thin streak (Pickett
// most of all), which no real well does. Owner review, 2026-10-08.
import { PETRO } from './spine.mjs';

const STEP_M = 0.1524;

// FWHM of each tool's vertical response (m), and its noise
const TOOLS = {
  GR:   { fwhm: 0.60, noise: (v) => 0.35 * Math.sqrt(Math.max(v, 1)) },  // counting statistics
  RHOB: { fwhm: 0.45, noise: () => 0.008 },
  NPHI: { fwhm: 0.60, noise: () => 0.010 },
  DT:   { fwhm: 0.60, noise: () => 1.1 },
  PEF:  { fwhm: 0.20, noise: () => 0.07 },
  SP:   { fwhm: 2.00, noise: () => 0.6 },
  CALI: { fwhm: 0.15, noise: () => 0.03 },
  RT:   { fwhm: 0.9, logNoise: 0.022, conductive: true },   // deep induction
  RXO:  { fwhm: 0.25, logNoise: 0.03, conductive: true },    // micro-resistivity
  // v3: dipole shear, appended last so every earlier curve keeps its noise
  DTS:  { fwhm: 0.60, noise: () => 2.2 },
};

// deterministic standard normal from (seed, curve, index)
function hash32(a) {
  let h = a | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function gauss(seed, k, i) {
  const u1 = Math.max(1e-12, hash32(seed * 7919 + k * 104729 + i * 2 + 1));
  const u2 = hash32(seed * 7919 + k * 104729 + i * 2 + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function gaussianFilter(values, fwhmM) {
  const sigma = fwhmM / 2.355 / STEP_M;
  if (sigma < 0.3) return Float64Array.from(values);
  const half = Math.ceil(3 * sigma);
  const w = [];
  for (let j = -half; j <= half; j++) w.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let s = 0; let ws = 0;
    for (let j = -half; j <= half; j++) {
      const k = i + j;
      if (k < 0 || k >= values.length) continue;
      s += values[k] * w[j + half]; ws += w[j + half];
    }
    out[i] = s / ws;
  }
  return out;
}

const bitAt = (md) => PETRO.bit_sizes.find(([lo, hi]) => md >= lo && md < hi)?.[2] ?? 8.5;
const MUD_DENSITY = 1.2; // g/cc, water-based mud in the 8.5 in and 12.25 in holes

/**
 * @param {Array<object>} rows truth rows from synthesiseWell
 * @param {string} wellName seeds the noise, so each well is its own run
 * @returns {Array<object>} LAS rows: md, CALI, GR, SP, RHOB, DRHO, NPHI, DT, RT, RXO, PEF, DTS
 */
export function measureLogs(rows, wellName) {
  const seed = Array.from(wellName).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const n = rows.length;
  const col = (k) => Float64Array.from(rows, (r) => r[k]);
  const truth = {
    GR: col('gr'), RHOB: col('rhob'), NPHI: col('nphi'), DT: col('dt'), PEF: col('pef'),
    SP: col('sp'), CALI: col('cali'), RT: col('rt'), RXO: col('rxo'), DTS: col('dts'),
  };
  const out = {};
  let k = 0;
  for (const [key, tool] of Object.entries(TOOLS)) {
    k += 1;
    const src = tool.conductive ? Float64Array.from(truth[key], (v) => 1 / v) : truth[key];
    const f = gaussianFilter(src, tool.fwhm);
    out[key] = Float64Array.from(f, (v, i) => {
      if (tool.conductive) return (1 / v) * 10 ** (tool.logNoise * gauss(seed, k, i));
      return v + tool.noise(v) * gauss(seed, k, i);
    });
  }

  // A washed-out stretch in the middle of the Ogbia Shale, the seal above the
  // reservoir: water-sensitive shale that caves while the well is open. The
  // generated caliper alone stayed within 1.5 in of gauge, so no well had a
  // bad-hole interval for the QC lesson to find. Shale only (vsh > 0.6), so
  // no reservoir number moves.
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    if (r.layerKey !== 'OGBIA' || r.vsh < 0.6) continue;
    const t = (r.u - 0.35) / 0.3;                               // 35 to 65 % down the shale
    if (t <= 0 || t >= 1) continue;
    out.CALI[i] += 3.2 * Math.sin(Math.PI * t) ** 2 * (0.75 + 0.5 * hash32(seed + i * 17));
  }

  // borehole: washout beyond an inch over gauge degrades the pad tools
  const DRHO = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const wash = out.CALI[i] - bitAt(rows[i].md);
    const bad = Math.max(0, wash - 1.0);
    const lift = Math.min(0.35, bad * 0.18);                 // fraction of mud seen
    if (lift > 0) {
      out.RHOB[i] = out.RHOB[i] * (1 - lift) + MUD_DENSITY * lift;
      out.NPHI[i] += 0.06 * Math.min(1, bad / 1.5);
      out.PEF[i] = out.PEF[i] * (1 - lift) + 0.4 * lift;
    }
    DRHO[i] = 0.004 * gauss(seed, 99, i) + (lift > 0 ? 0.03 + lift * 0.45 : 0);
  }

  const r3 = (v) => Number(v.toFixed(4));
  return rows.map((r, i) => ({
    md: r.md,
    CALI: out.CALI[i], GR: Math.max(0, out.GR[i]), SP: out.SP[i],
    RHOB: out.RHOB[i], DRHO: r3(DRHO[i]), NPHI: out.NPHI[i], DT: out.DT[i],
    RT: out.RT[i], RXO: out.RXO[i], PEF: Math.max(0.5, out.PEF[i]), DTS: out.DTS[i],
  }));
}
