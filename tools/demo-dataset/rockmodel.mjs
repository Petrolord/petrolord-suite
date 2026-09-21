// Ekene demonstration dataset — rock, fluids, pressure and log synthesis.
// ============================================================================
// Nothing here is drawn by hand. Saturation comes from the LOCKED Leverett-J
// drainage curve at height above the contact, water resistivity from the
// LOCKED 35,000 ppm brine at formation temperature through the central Rw
// engine, and the sonic is the Eaton inversion of a designed pore pressure
// whose value at the contact is the LOCKED initial reservoir pressure. So a
// presenter who fits a Pickett plot, runs Archie or fits a compaction trend on
// camera recovers a number the reservoir side already published.
//
// Bed character is a function of STRATIGRAPHIC POSITION, not of depth, so the
// same sequence appears in every well at that well's own depths. That is what
// makes the Well Correlation episode filmable.
// ============================================================================

import { rwFromSalinity, rwArps, rwToRwe, rmfeFromRmf, spK } from '../../packages/engines/engines/petrophysics/rw.js';
import { LOCKED, FRAME, PETRO, PRESSURE, OBORO, HORIZONS, TEMP_GRAD_F_PER_M } from './spine.mjs';

const FT_PER_M = 3.280839895013123;
const PSI_PER_FT_WATER = 0.4335;
const LEVERETT_C = 0.21645;

// ------------------------------------------------------------------ noise ---

function hash(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);

// Value noise in one dimension, seeded. Deterministic everywhere.
function noise1(seed, t) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(seed * 374761393 + i * 668265263);
  const b = hash(seed * 374761393 + (i + 1) * 668265263);
  return a + (b - a) * smooth(f);
}

// Fractal sum: a few octaves, so beds sit inside packages.
function fbm(seed, t, octaves = 4) {
  let sum = 0; let amp = 1; let norm = 0; let freq = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * noise1(seed + o * 7919, t * freq);
    norm += amp;
    amp *= 0.5; freq *= 2.1;
  }
  return sum / norm;
}

// --------------------------------------------------------------- sequence ---

// One entry per interval between consecutive horizons. `beds` is how many
// bed-scale cycles the interval carries; `shale` is the baseline clay
// fraction; `amp` how strongly the interval alternates.
export const LAYERS = [
  { key: 'SEABED_BENIN', top: 'SEABED', base: 'BENIN', name: 'Seabed sequence',
    seed: 11, beds: 9,  shale: 0.35, amp: 0.35, phiTop: 0.38, phiBase: 0.33, phiAmp: 0.035, lith: 'CLAYSAND' },
  { key: 'BENIN', top: 'BENIN', base: 'AGBADA', name: 'Benin Formation',
    seed: 23, beds: 26, shale: 0.15, amp: 0.18, phiTop: 0.33, phiBase: 0.27, phiAmp: 0.040, lith: 'SAND' },
  { key: 'AGBADA_U', top: 'AGBADA', base: 'OGBIA', name: 'Agbada upper',
    seed: 37, beds: 11, shale: 0.45, amp: 0.42, phiTop: 0.28, phiBase: 0.24, phiAmp: 0.035, lith: 'INTERBED' },
  { key: 'OGBIA', top: 'OGBIA', base: 'TOP_SAND', name: 'Ogbia Shale',
    seed: 41, beds: 12, shale: 0.78, amp: 0.17, phiTop: 0.22, phiBase: 0.18, phiAmp: 0.018, lith: 'SHALE' },
  { key: 'EKENE', top: 'TOP_SAND', base: 'BASE_SAND', name: 'Ekene Sand',
    seed: 53, beds: 7,  shale: 0.08, amp: 0.10, phiTop: 0.205, phiBase: 0.195, phiAmp: 0.055, lith: 'SAND', reservoir: 'oil' },
  { key: 'AGBADA_L', top: 'BASE_SAND', base: 'OBORO_U', name: 'Agbada lower',
    seed: 61, beds: 10, shale: 0.65, amp: 0.30, phiTop: 0.19, phiBase: 0.16, phiAmp: 0.030, lith: 'INTERBED' },
  { key: 'SUB_UNC', top: 'OBORO_U', base: 'OBORO', name: 'Sub-unconformity shale',
    seed: 71, beds: 5,  shale: 0.85, amp: 0.11, phiTop: 0.16, phiBase: 0.155, phiAmp: 0.015, lith: 'SHALE' },
  { key: 'OBORO', top: 'OBORO', base: 'OBORO_B', name: 'Oboro Sand',
    seed: 83, beds: 8,  shale: 0.11, amp: 0.11, phiTop: 0.195, phiBase: 0.185, phiAmp: 0.050, lith: 'SAND', reservoir: 'gas' },
  { key: 'AGBADA_B', top: 'OBORO_B', base: 'AKATA', name: 'Basal Agbada',
    seed: 97, beds: 9,  shale: 0.60, amp: 0.30, phiTop: 0.15, phiBase: 0.14, phiAmp: 0.028, lith: 'INTERBED' },
  { key: 'AKATA', top: 'AKATA', base: null, name: 'Akata Formation',
    seed: 103, beds: 8, shale: 0.92, amp: 0.06, phiTop: 0.13, phiBase: 0.11, phiAmp: 0.012, lith: 'SHALE' },
];

// --------------------------------------------------------------- saturation ---

// Sw from the LOCKED Leverett-J drainage curve. Verified against the fixture's
// own documented crest value: at the 20.2818603515625 m maximum oil column the
// crest drains to Sw 0.3506, which is the number the generator's design note
// states. See DemoDataset-PLAN §4.4.
export function makeSaturationHeight({ k_md, phi, sigma, thetaDeg, gammaW, gammaHc, jSpec }) {
  const sigmaCos = sigma * Math.cos((thetaDeg * Math.PI) / 180);
  const factor = sigmaCos / (LEVERETT_C * Math.sqrt(k_md / phi));
  const dGamma = gammaW - gammaHc;
  if (dGamma <= 0) throw new Error('density contrast must be positive');
  const perFt = PSI_PER_FT_WATER * dGamma;
  // h at which Sw* = 1 (Sw = Swirr-normalised 1, i.e. Sw = 1): the entry height.
  const entryFt = (jSpec.a * factor) / perFt;
  const entry_m = entryFt / FT_PER_M;
  return {
    entry_m,
    // Height above the FREE WATER LEVEL, in metres.
    // J = a * Sw*^-b with b = 1, so Sw* inverts in closed form.
    swAtHeightAboveFwl(h_m) {
      if (h_m <= 0) return 1;
      const h_ft = h_m * FT_PER_M;
      const swStar = Math.min(1, ((jSpec.a * factor) / (perFt * h_ft)) ** (1 / jSpec.b));
      return Math.min(1, jSpec.Swirr + (1 - jSpec.Swirr) * swStar);
    },
  };
}

const oilGamma = 141.5 / (131.5 + LOCKED.api);

export const OIL_SH = makeSaturationHeight({
  k_md: LOCKED.k_md, phi: LOCKED.phi,
  sigma: LOCKED.sigma_dyncm, thetaDeg: LOCKED.thetaDeg,
  gammaW: LOCKED.gammaW, gammaHc: oilGamma, jSpec: LOCKED.jTrue,
});

export const GAS_SH = makeSaturationHeight({
  k_md: OBORO.k_md, phi: OBORO.phi,
  sigma: 50, thetaDeg: 0,
  gammaW: LOCKED.gammaW, gammaHc: 0.18,
  jSpec: { a: 0.22, b: 1.0, Swirr: OBORO.swirr },
});

// Contacts are flat, so they live in TVDSS. The LOCKED contact is quoted as
// 1560 m below KB on a vertical well, and every well shares the platform KB.
export const OIL_CONTACT_TVDSS = LOCKED.owc_m - FRAME.kb_m;
export const GAS_CONTACT_TVDSS = OBORO.gwc_m - FRAME.kb_m;
export const OIL_FWL_TVDSS = OIL_CONTACT_TVDSS + OIL_SH.entry_m;
export const GAS_FWL_TVDSS = GAS_CONTACT_TVDSS + GAS_SH.entry_m;

// ------------------------------------------------------------- temperature ---

export const tempF = (tvdss_m) => FRAME.seabed_temp_f + TEMP_GRAD_F_PER_M * tvdss_m;

// Rw from the LOCKED salinity through the central engine, at 75 degF and then
// carried to formation temperature by Arps.
export const RW_75F = rwFromSalinity(LOCKED.salinity_ppm, 75);
export const rwAt = (tF) => rwArps(RW_75F, 75, tF);

// ---------------------------------------------------------------- pressure ---

const smoothstep = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

// Normal pore pressure: a connected brine column from sea level.
export const pnPsi = (tvdss_m) => PSI_PER_FT_WATER * LOCKED.gammaW * tvdss_m * FT_PER_M;

export function makePressureModel() {
  const datumTvd = PRESSURE.datum_md;                       // vertical well: MD = TVD below KB
  const emwOf = (p_psi, tvd_kb_m) => p_psi / (0.052 * tvd_kb_m * FT_PER_M);
  const emwAtDatum = emwOf(LOCKED.pi_psia, datumTvd);        // 12.0246 ppg, from the LOCKED Pi
  const emwNormal = (tvd_kb_m) => emwOf(pnPsi(tvd_kb_m - FRAME.kb_m), tvd_kb_m);

  // EMW profile: normal to the ramp top, smoothstep to the locked reservoir
  // value at the datum, then linear to the design value at TD.
  function emwAt(tvd_kb_m) {
    if (tvd_kb_m <= PRESSURE.ramp_top_md) return emwNormal(tvd_kb_m);
    if (tvd_kb_m <= datumTvd) {
      const t = (tvd_kb_m - PRESSURE.ramp_top_md) / (datumTvd - PRESSURE.ramp_top_md);
      const n = emwNormal(tvd_kb_m);
      return n + (emwAtDatum - n) * smoothstep(t);
    }
    const t = (tvd_kb_m - datumTvd) / (FRAME.td_md - datumTvd);
    return emwAtDatum + (PRESSURE.emw_at_td_ppg - emwAtDatum) * Math.min(1, t);
  }

  const ppPsi = (tvd_kb_m) => emwAt(tvd_kb_m) * 0.052 * tvd_kb_m * FT_PER_M;
  return { emwAt, ppPsi, emwAtDatum, emwOf, emwNormal, datumTvd };
}

export const PRESSURE_MODEL = makePressureModel();

// Normal compaction trend for the sonic, in depth below the mudline.
export const dtNormal = (belowMudline_m) =>
  PETRO.dt_matrix_us_ft
  + (PETRO.dt_mudline_us_ft - PETRO.dt_matrix_us_ft)
    * Math.exp(-PETRO.compaction_c_per_m * Math.max(0, belowMudline_m));

// ------------------------------------------------------------ log synthesis ---

// Where a sample sits in the sequence: which layer, and how far through it.
function locate(tops, md) {
  for (const L of LAYERS) {
    const a = tops.find((t) => t.key === L.top);
    if (!a) continue;
    const b = L.base ? tops.find((t) => t.key === L.base) : null;
    const base = b ? b.md : Infinity;
    if (md >= a.md && md < base) {
      const span = Number.isFinite(base) ? base - a.md : 400;
      return { layer: L, u: (md - a.md) / span, top: a.md, span };
    }
  }
  return null;
}

/**
 * Synthesise the full sample set for one well.
 * `shaleBedThreshold` and `phiScale` are solved by the caller so the Ekene
 * Sand reproduces the LOCKED NTG 0.8 and net porosity 0.20.
 */
export function synthesiseWell({ well, tops, survey, tvdAtMd, geo, tuning }) {
  const { shaleBedThreshold, phiScale } = tuning;
  const step = FRAME.sample_step_m;
  const tdMd = survey.stations[survey.stations.length - 1].md;
  const startMd = Math.ceil(FRAME.mudline_md / step) * step;
  const wellSeed = Array.from(well.name).reduce((a, c) => a + c.charCodeAt(0), 0);

  const rows = [];
  for (let md = startMd; md <= tdMd + 1e-9; md += step) {
    const loc = locate(tops, md);
    if (!loc) continue;
    const { layer, u } = loc;
    const tvd = tvdAtMd(survey.stations, md);
    const tvdss = tvd - FRAME.kb_m;
    const belowMudline = tvd - FRAME.mudline_md;

    // --- lithology. Shared across wells at the same stratigraphic position,
    // with a small well-specific overlay so the section is correlatable but
    // not cloned.
    const shared = fbm(layer.seed, u * layer.beds, 4);
    const local = fbm(layer.seed + wellSeed * 13, u * layer.beds * 2.7, 3);
    const s = 0.85 * shared + 0.15 * local;

    let vsh;
    if (layer.reservoir) {
      // A clean sand with shale streaks: mostly clean, occasionally a bed.
      vsh = s > shaleBedThreshold
        ? layer.shale + (0.95 - layer.shale) * ((s - shaleBedThreshold) / (1 - shaleBedThreshold)) ** 0.7
        : layer.shale + layer.amp * (s - 0.5);
    } else {
      vsh = layer.shale + layer.amp * 2 * (s - 0.5);
    }
    vsh = Math.min(0.98, Math.max(0.02, vsh));

    // --- porosity. A trend through the layer plus bed-scale variation, part
    // of it correlated with the clay fraction (better-sorted rock is cleaner
    // AND more porous) and part independent. Without the spread a Pickett plot
    // has no leverage, which is also true of real rock with no spread.
    const phiNoise = fbm(layer.seed + 1777, u * layer.beds * 1.6, 3) - 0.5;
    const phiTrend = layer.phiTop + (layer.phiBase - layer.phiTop) * u
      + (layer.phiAmp ?? 0.03) * 2 * (0.55 * phiNoise + 0.45 * (0.5 - s));
    const scale = layer.reservoir === 'oil' ? phiScale : 1;
    let phit = phiTrend * scale * (1 - 0.28 * vsh) + 0.055 * vsh;
    phit = Math.min(0.42, Math.max(0.02, phit));
    const phie = Math.max(0.005, phit - vsh * 0.075);

    // --- fluids
    let fluid = 'brine';
    let sw = 1;
    if (layer.reservoir === 'oil' && tvdss < OIL_CONTACT_TVDSS) {
      fluid = 'oil';
      sw = OIL_SH.swAtHeightAboveFwl(OIL_FWL_TVDSS - tvdss);
    } else if (layer.reservoir === 'gas' && tvdss < GAS_CONTACT_TVDSS) {
      fluid = 'gas';
      sw = GAS_SH.swAtHeightAboveFwl(GAS_FWL_TVDSS - tvdss);
    }
    // Shale beds inside a reservoir hold no movable hydrocarbon.
    if (vsh > 0.5) { sw = Math.min(1, sw + (1 - sw) * ((vsh - 0.5) / 0.5)); }

    const tF = tempF(tvdss);
    const rw = rwAt(tF);

    // --- curves
    const gr = PETRO.gr_clean + vsh * (PETRO.gr_shale - PETRO.gr_clean)
      + 2.5 * (fbm(layer.seed + 555, u * layer.beds * 9, 2) - 0.5);

    const rhoMa = PETRO.rho_ma_sand + PETRO.rho_ma_shale_add * vsh;
    const sxo = fluid === 'gas' ? PETRO.sxo_gas : (fluid === 'oil' ? PETRO.sxo_oil : 1);
    const rhoHc = fluid === 'gas' ? PETRO.rho_gas : PETRO.rho_oil;
    const rhoFl = fluid === 'brine' ? PETRO.rho_brine
      : PETRO.rho_brine * sxo + rhoHc * (1 - sxo);
    const rhob = rhoMa * (1 - phit) + rhoFl * phit;

    const sgFlushed = fluid === 'gas' ? 1 - sxo : 0;
    const nphi = phit * (1 - PETRO.nphi_gas_factor * sgFlushed)
      + PETRO.nphi_shale_excess * vsh;

    const pef = PETRO.pef_sand + (PETRO.pef_shale - PETRO.pef_sand) * vsh;

    // Archie in the clean rock, with a parallel shale conductivity term so
    // shales read low without breaking the clean-sand Pickett line.
    const { a, m, n } = PETRO.archie;
    const cClean = (phie ** m * sw ** n) / (a * rw);
    const ct = cClean + vsh / PETRO.r_shale;
    const rt = 1 / ct;
    const swXo = Math.min(1, sw + (1 - sw) * sxo);
    const rmf = rwArps(PETRO.rmf_ohm_m_at_75f, 75, tF);
    const rxo = 1 / ((phie ** m * swXo ** n) / (a * rmf) + vsh / PETRO.r_shale);

    // SP through the central Rw engine's own chain, so the Studio's SP tool
    // inverts it back to this Rw. Above the Bateman-Konen band (the shallow,
    // cooler, fresher section) the engine returns NaN by design, so fall back
    // to the standard 0.85 convention the filtrate side already uses there.
    const rweChart = rwToRwe(rw, tF);
    const rwe = Number.isFinite(rweChart) ? rweChart : 0.85 * rw;
    const rmfe = rmfeFromRmf(PETRO.rmf_ohm_m_at_75f, 75, tF).rmfe;
    const ssp = -spK(tF) * Math.log10(rmfe / rwe);
    const sp = ssp * (1 - vsh) ** 1.3 + 4 * (fbm(layer.seed + 909, u * 6, 2) - 0.5);

    // Caliper: gauge in sand, washed out in the softer shales.
    const bit = PETRO.bit_sizes.find(([lo, hi]) => md >= lo && md < hi)?.[2] ?? 8.5;
    const wash = Math.max(0, vsh - 0.55) * 2.4 * (0.5 + fbm(layer.seed + 313, u * layer.beds * 4, 2));
    const cali = bit + wash;

    rows.push({
      md, tvd, tvdss, belowMudline, layerKey: layer.key, lith: layer.lith,
      u, vsh, phit, phie, sw, fluid, tF, rw, gr, rhob, nphi, pef, rt, rxo, sp, cali,
    });
  }

  // --- overburden: seawater, then the integral of the generated bulk density.
  let ob = PSI_PER_FT_WATER * FRAME.seawater_sg * FRAME.water_depth_m * FT_PER_M;
  let prevTvd = FRAME.mudline_md;
  for (const r of rows) {
    const dz = Math.max(0, r.tvd - prevTvd);
    ob += PSI_PER_FT_WATER * r.rhob * dz * FT_PER_M;
    prevTvd = r.tvd;
    r.obPsi = ob;
    r.pnPsi = pnPsi(r.tvdss);
    r.ppPsi = PRESSURE_MODEL.ppPsi(r.tvd);
    r.obEmw = ob / (0.052 * r.tvd * FT_PER_M);
    r.ppEmw = r.ppPsi / (0.052 * r.tvd * FT_PER_M);
    const k = PRESSURE.poisson / (1 - PRESSURE.poisson);
    r.fgPsi = r.ppPsi + (r.obPsi - r.ppPsi) * k;
    r.fgEmw = r.fgPsi / (0.052 * r.tvd * FT_PER_M);
  }

  // --- sonic: shales are the exact Eaton inversion of the designed pressure,
  // so fitting a compaction trend and running Eaton at exponent 3 recovers it.
  // Sands follow Wyllie with a compaction factor, and the log is the clay
  // fraction blend of the two.
  for (const r of rows) {
    const dtn = dtNormal(r.belowMudline);
    const num = r.obPsi - r.pnPsi;
    const den = r.obPsi - r.ppPsi;
    const dtShale = den > 1 ? dtn * (num / den) ** (1 / PRESSURE.eaton_exponent) : dtn;
    const dtFluid = r.fluid === 'gas' ? 250 : (r.fluid === 'oil' ? 210 : 189);
    const bcp = 1.45;
    const dtSand = PETRO.dt_matrix_us_ft + r.phit * (dtFluid - PETRO.dt_matrix_us_ft) * bcp;
    const w = Math.min(1, Math.max(0, (r.vsh - 0.15) / 0.55));
    r.dt = dtSand * (1 - w) + dtShale * w;
    r.dtNormal = dtn;
    r.dtShale = dtShale;
    r.vp_m_s = 1e6 / r.dt / FT_PER_M;
  }

  return rows;
}
