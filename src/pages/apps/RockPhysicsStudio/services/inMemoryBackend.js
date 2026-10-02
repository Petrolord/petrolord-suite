// In-memory backend for the /dev/rock-physics-studio harness and
// jest: the workstation drivable without auth or DB (the harness
// philosophy). Same interface as registryBackend.
//
// The seeded well is built FROM THE ORACLE GOLDENS' anchor cases so
// the e2e suite asserts the oracle's numbers straight off the screen:
// - BRINE SAND zone: constant Vp 3200 / Vs 1800 / rho 2.25 g/cc /
//   PHIE 0.25 — the gassmann.log_domain golden's starting state.
//   Substituting brine(60degC, 25MPa, S 0.035) -> gas(g 0.6) with
//   K_min 37 GPa must show Vp 2905.70, Vs 1890.98, rho 2038.71.
// - Shale background: Vp 2900 / Vs 1330 / rho 2.29 — the upper
//   halfspace of every Rutherford-Williams AVO golden.
// - GAS SAND zone: Vp 2540 / Vs 1620 / rho 2.09 — the class-III
//   lower halfspace, so the interface at "Top Gas Sand" must read
//   A = -0.1118, B = -0.2437, class III.
// A second, org-shared well has NO DTS so the estimated-Vs provenance
// badge path is drivable.

import { brine, gas, woodMix } from '../engine/fluids';
import { MINERALS } from '../engine/minerals';
import { substituteVels } from '../engine/gassmann';
import { gardnerRho } from '../engine/pseudoSonic';
import { makeHarnessSharing, colleagueShared } from '@/lib/recordSharing';

let seq = 0;
const nextId = (p) => { seq += 1; return `${p}-${seq}`; };

const DEPTH_START = 2000;
const DEPTH_STOP = 2100;
const STEP = 0.5;

// intervals are INCLUSIVE both ends, matching prep.zoneIndices, so a
// zone's samples are exactly its layer's constants (exactness is the
// point of the fixture)
const LAYERS = [
  { name: 'BRINE SAND', top: 2020, base: 2040, vp: 3200, vs: 1800, rhoGcc: 2.25, phie: 0.25, vsh: 0 },
  { name: 'GAS SAND', top: 2060, base: 2080, vp: 2540, vs: 1620, rhoGcc: 2.09, phie: 0.25, vsh: 0 },
];
const SHALE = { vp: 2900, vs: 1330, rhoGcc: 2.29, phie: 0.08, vsh: 1 };

function layerAt(d) {
  return LAYERS.find((l) => d >= l.top && d <= l.base) || SHALE;
}

function buildCurves({ withDts }) {
  const n = Math.round((DEPTH_STOP - DEPTH_START) / STEP) + 1;
  const c = { DEPT: [], DT: [], RHOB: [], PHIE: [], VSH: [] };
  if (withDts) c.DTS = [];
  for (let i = 0; i < n; i++) {
    const d = DEPTH_START + i * STEP;
    const L = layerAt(d);
    c.DEPT.push(d);
    c.DT.push(1e6 / L.vp);            // US/M
    if (withDts) c.DTS.push(1e6 / L.vs);
    c.RHOB.push(L.rhoGcc);            // G/C3
    c.PHIE.push(L.phie);
    c.VSH.push(L.vsh);
  }
  return c;
}

const CURVE_UNITS = { DEPT: 'M', DT: 'US/M', DTS: 'US/M', RHOB: 'G/C3', PHIE: 'V/V', VSH: 'V/V' };

// RP-U1 evidence wells (harness flags, never in the default list):
// - hostile (?hostile=1): a Schlumberger-named export (TDEP, DTCO, DTSM,
//   RHOZ) with sonic and shear in us/ft and NO unit, density in kg/m3,
//   total porosity in percent with no unit, -999 nulls, a shaly band and an
//   SW log over a gas leg: every reading rule of RP-U1-002..006 at once
// - long (?long=1): 5000 m of log at 0.1524 m (32,809 samples) with one
//   4000 m zone, the PL10 scale case
function hostileCurves() {
  const curves = { TDEP: [], DTCO: [], DTSM: [], RHOZ: [], PHIT: [], VSH: [], SW: [] };
  for (let d = 2000; d <= 2100; d += 0.5) {
    const sandy = d >= 2020 && d <= 2050;
    const gasLeg = d >= 2020 && d < 2035;
    const vp = sandy ? (gasLeg ? 2700 : 3150) : 2900;
    const vs = sandy ? (gasLeg ? 1700 : 1750) : 1330;
    const rho = sandy ? (gasLeg ? 2.08 : 2.24) : 2.29;
    curves.TDEP.push(d);
    curves.DTCO.push((1e6 * 0.3048) / vp);     // us/ft, unit left blank
    curves.DTSM.push((1e6 * 0.3048) / vs);     // us/ft, unit left blank
    curves.RHOZ.push(d === 2041 ? -999 : rho * 1000); // kg/m3 with one vendor null
    curves.PHIT.push(sandy ? 26 : 9);          // percent, unit left blank
    curves.VSH.push(sandy ? (d > 2045 ? 0.6 : 0.08) : 0.85);
    curves.SW.push(gasLeg ? 0.25 : 1);
  }
  return curves;
}
const HOSTILE_UNITS = { TDEP: 'M', DTCO: '', DTSM: '', RHOZ: 'KG/M3', PHIT: '', VSH: 'V/V', SW: 'V/V' };

function longCurves() {
  const step = 0.1524;
  const n = Math.round(5000 / step) + 1;
  const c = { DEPT: new Float64Array(n), DT: new Float64Array(n), RHOB: new Float64Array(n), PHIE: new Float64Array(n), VSH: new Float64Array(n) };
  for (let i = 0; i < n; i++) {
    const d = 500 + i * step;
    const cyc = Math.sin(d / 7);
    c.DEPT[i] = d;
    c.DT[i] = 1e6 / (2400 + 0.25 * d + 150 * cyc);
    c.RHOB[i] = 2.15 + 0.00004 * d + 0.05 * cyc;
    c.PHIE[i] = Math.max(0.04, 0.28 - 0.00004 * d - 0.04 * cyc);
    c.VSH[i] = 0.5 + 0.45 * cyc;
  }
  return { curves: c, n, step };
}

// RP-U2-002 evidence well (?trend=1): 400 m of 6 m sand and shale beds on a
// brine trend (mudrock-line shear with a deterministic scatter, Gardner
// density), measured shear, and one gas bed (2000 to 2012 m, Sw 0.2) whose
// logged Vp, Vs and density are the Gassmann gas state of its wet rock at
// the default conditions, with an SW log. Taking the gas out through the
// SW log returns the wet trend, so the fluid line has a known answer.
export const TREND_GAS = Object.freeze({ top: 2000, base: 2012, sw: 0.2, phi: 0.24 });
function trendCurves() {
  const cond = { tC: 60, pMPa: 25, salinity: 0.035 };
  const br = brine(cond.tC, cond.pMPa, cond.salinity);
  const g = gas(cond.tC, cond.pMPa, 0.6);
  const mixed = woodMix([{ ...br, sat: TREND_GAS.sw }, { ...g, sat: 1 - TREND_GAS.sw }]);
  const kmin = MINERALS.quartz.k;
  const c = { DEPT: [], DT: [], DTS: [], RHOB: [], PHIE: [], VSH: [], SW: [] };
  const wet = { vp: [], vs: [], rho: [] };
  for (let d = 1800; d <= 2200 + 1e-9; d += 0.5) {
    const bed = Math.floor((d - 1800) / 6);
    const sand = bed % 2 === 0;
    const vp = 2650 + 55 * ((bed * 7) % 11) + 3 * bed + (sand ? 180 : 0);
    const vs = 0.8621 * vp - 1172.4 + 6 * (((bed * 5) % 7) - 3);
    const rho = gardnerRho(vp);
    const inGas = d >= TREND_GAS.top && d <= TREND_GAS.base;
    let s = { vp, vs, rho };
    if (inGas) s = substituteVels(vp, vs, rho, kmin, TREND_GAS.phi, br, mixed);
    wet.vp.push(vp); wet.vs.push(vs); wet.rho.push(rho);
    c.DEPT.push(d);
    c.DT.push(1e6 / s.vp);
    c.DTS.push(1e6 / s.vs);
    c.RHOB.push(s.rho / 1000);
    c.PHIE.push(inGas ? TREND_GAS.phi : sand ? 0.24 : 0.08);
    c.VSH.push(inGas ? 0.05 : sand ? 0.1 : 0.8);
    c.SW.push(inGas ? TREND_GAS.sw : 1);
  }
  return { curves: c, wet };
}
// RP-U2-007 evidence wells (?nosonic=1): a well with density, resistivity,
// porosity and VSH but NO sonic, and a calibration well that has one. Both
// follow Gardner with a = 0.245 and Faust with 2100 exactly, with a
// deterministic 3 percent wobble on the true velocity, so a calibration has
// a known answer and the misfit a known size.
export const NOSONIC_TRUTH = Object.freeze({ gardnerA: 0.245, faustGamma: 2100 });
function sonicPairCurves(withSonic, offset) {
  const c = { DEPT: [], RHOB: [], RT: [], PHIE: [], VSH: [] };
  if (withSonic) c.DT = [];
  const truth = [];
  for (let d = 1500; d <= 1700 + 1e-9; d += 0.5) {
    const k = Math.round((d - 1500) * 2) + offset;
    const sand = d >= 1560 && d <= 1600;
    const rt = (sand ? 6 : 1.8) * (1 + 0.25 * Math.sin(k / 9));
    const vpFaust = 0.3048 * NOSONIC_TRUTH.faustGamma * ((d / 0.3048) * rt) ** (1 / 6);
    const vp = vpFaust * (1 + 0.03 * Math.sin(k / 5));
    const rho = 1000 * NOSONIC_TRUTH.gardnerA * (vpFaust / 0.3048) ** 0.25;
    truth.push(vp);
    c.DEPT.push(d); c.RHOB.push(rho / 1000); c.RT.push(rt);
    c.PHIE.push(sand ? 0.24 : 0.07); c.VSH.push(sand ? 0.1 : 0.8);
    if (withSonic) c.DT.push(1e6 / vp);
  }
  return { curves: c, truth };
}
/** The true Vp of the no-sonic well, for tests. */
export const noSonicTruth = () => sonicPairCurves(false, 0).truth;

// RP-U2-009 evidence well (?minerals=1): a mixed carbonate and sand section
// with measured sonic and shear, and the three mineral-fraction curves
// Petrophysics Studio's mineral model publishes (bulk fractions: they sum
// to one with the porosity), with its provenance. 2100 to 2110 m is pure
// calcite, 2110 to 2120 m half quartz and half dolomite, 2120 to 2130 m
// has no fractions (a refused sample).
function mineralCurves() {
  const c = { DEPT: [], DT: [], DTS: [], RHOB: [], PHIE: [], VSH: [], V_QUARTZ: [], V_CALCITE: [], V_DOLOMITE: [] };
  for (let d = 2090; d <= 2140 + 1e-9; d += 0.5) {
    const phi = 0.15;
    const solid = 1 - phi;
    let q = 1; let ca = 0; let dol = 0;
    if (d >= 2100 && d < 2110) { q = 0; ca = 1; } else if (d >= 2110 && d < 2120) { q = 0.5; dol = 0.5; }
    const none = d >= 2120 && d < 2130;
    c.DEPT.push(d); c.DT.push(1e6 / 4200); c.DTS.push(1e6 / 2400); c.RHOB.push(2.45); c.PHIE.push(phi); c.VSH.push(0.02);
    c.V_QUARTZ.push(none ? NaN : q * solid); c.V_CALCITE.push(none ? NaN : ca * solid); c.V_DOLOMITE.push(none ? NaN : dol * solid);
  }
  return c;
}
const MINERAL_PROVENANCE = Object.freeze({
  computed: true, engine: 'petrophysics-studio', operation: 'mineral-model', pipeline_version: 7,
  model: { minerals: ['quartz', 'calcite', 'dolomite'] }, tools: ['RHOB', 'NPHI', 'PEF'],
});

/** The wet (brine) truth of the trend well, for tests. */
export const trendWellTruth = () => trendCurves().wet;

export function makeInMemoryBackend({ hostile = false, long = false, trend = false, nosonic = false, minerals = false, pp = false, shared = false, sharing: sharingOpts = {} } = {}) {
  const curveStore = new Map();
  const logsByWell = new Map();
  const topsByWell = new Map();
  const zonesByWell = new Map();
  const wells = [];

  const addWell = ({ name, isOwn, org, withDts }) => {
    const id = nextId('well');
    wells.push({
      id,
      user_id: isOwn ? 'user-dev' : 'user-other',
      organization_id: org || null,
      name,
      uwi: name,
      surface_x: 501000,
      surface_y: 6700200,
      kb_m: 30,
      td_md_m: DEPTH_STOP,
      crs_note: 'EPSG:32630 (demo)',
      units_note: 'SI',
      deviation: [],
      checkshots: [],
      // U2-003: the tie QC record Seismolord stores when a tie is committed
      // (Seismolord U2-013, lib/wellWavelet.tieQcRecord), on the first well only
      ...(withDts ? { checkshots_derived: { provenance: { qc: { version: 1, mean_corr: 0.82, min_corr: 0.61, bulk_shift_ms: 4, phase_deg: 40, anchors: 2, wavelet: { kind: 'well', length_ms: 120, peak_hz: 28, phase_deg: 40 }, measured_at: '2026-10-01T09:00:00.000Z' } } } } : {}),
      created_at: new Date(2026, 6, 14).toISOString(),
      updated_at: new Date(2026, 6, 14).toISOString(),
      is_own: isOwn,
    });
    const curves = buildCurves({ withDts });
    const logs = [];
    for (const [mnemonic, vals] of Object.entries(curves)) {
      const logId = nextId('log');
      curveStore.set(logId, Float64Array.from(vals));
      logs.push({
        id: logId,
        well_id: id,
        mnemonic,
        description: `${mnemonic} (oracle-anchored fixture)`,
        unit: CURVE_UNITS[mnemonic] || null,
        start_md_m: DEPTH_START,
        stop_md_m: DEPTH_STOP,
        step_m: STEP,
        n_samples: vals.length,
        null_count: 0,
        source_file: 'inMemoryBackend.js',
        provenance: { synthetic: true },
        storage_path: `dev/${id}/${logId}.f32`,
      });
    }
    logsByWell.set(id, logs);
    topsByWell.set(id, LAYERS.flatMap((l) => ([
      { id: nextId('top'), well_id: id, name: `Top ${l.name}`, md_m: l.top },
      { id: nextId('top'), well_id: id, name: `Base ${l.name}`, md_m: l.base },
    ])).sort((a, b) => a.md_m - b.md_m));
    zonesByWell.set(id, LAYERS.map((l) => ({
      id: nextId('zone'),
      well_id: id,
      name: l.name,
      top_md_m: l.top,
      base_md_m: l.base,
      properties: {},
    })));
    return id;
  };

  addWell({ name: 'KETA RP-1', isOwn: true, withDts: true });
  addWell({ name: 'AKOMA-2 (org shared)', isOwn: false, org: 'org-dev', withDts: false });

  const addRawWell = (name, curves, units, zones, { start, stop, step }, provenanceFor = null) => {
    const id = nextId('well');
    wells.push({
      id, user_id: 'user-dev', organization_id: null, name, uwi: name, surface_x: 501000, surface_y: 6700200,
      kb_m: 30, td_md_m: stop, crs_note: 'EPSG:32630 (demo)', units_note: 'mixed', deviation: [], checkshots: [],
      created_at: new Date(2026, 9, 1).toISOString(), updated_at: new Date(2026, 9, 1).toISOString(), is_own: true,
    });
    const logs = [];
    for (const [mnemonic, vals] of Object.entries(curves)) {
      const logId = nextId('log');
      curveStore.set(logId, Float64Array.from(vals));
      logs.push({
        id: logId, well_id: id, mnemonic, description: `${mnemonic} (RP-U1 evidence well)`, unit: units[mnemonic] ?? null,
        start_md_m: start, stop_md_m: stop, step_m: step, n_samples: vals.length, null_count: 0,
        source_file: 'inMemoryBackend.js', provenance: (provenanceFor && provenanceFor(mnemonic)) || { synthetic: true }, storage_path: `dev/${id}/${logId}.f32`,
        created_at: new Date(2026, 9, 1).toISOString(),
      });
    }
    logsByWell.set(id, logs);
    topsByWell.set(id, zones.flatMap((z) => [
      { id: nextId('top'), well_id: id, name: `Top ${z.name}`, md_m: z.top },
      { id: nextId('top'), well_id: id, name: `Base ${z.name}`, md_m: z.base },
    ]));
    zonesByWell.set(id, zones.map((z) => ({ id: nextId('zone'), well_id: id, name: z.name, top_md_m: z.top, base_md_m: z.base, properties: {} })));
  };
  if (hostile) {
    addRawWell('HOSTILE RP-4 (vendor export)', hostileCurves(), HOSTILE_UNITS,
      [{ name: 'SAND WITH GAS LEG', top: 2020, base: 2050 }], { start: 2000, stop: 2100, step: 0.5 });
  }
  if (long) {
    const { curves, step } = longCurves();
    addRawWell('LONG RP-3 (5000 m)', curves, { DEPT: 'M', DT: 'US/M', RHOB: 'G/C3', PHIE: 'V/V', VSH: 'V/V' },
      [{ name: 'LONG ZONE', top: 900, base: 4900 }], { start: 500, stop: 500 + (curves.DEPT.length - 1) * step, step });
  }

  if (trend) {
    addRawWell('TREND RP-5 (wet trend, gas bed)', trendCurves().curves, { DEPT: 'M', DT: 'US/M', DTS: 'US/M', RHOB: 'G/C3', PHIE: 'V/V', VSH: 'V/V', SW: 'V/V' },
      [{ name: 'GAS BED', top: TREND_GAS.top, base: TREND_GAS.base }], { start: 1800, stop: 2200, step: 0.5 });
  }

  if (pp) {
    // U2-011: a pore pressure curve as Pore Pressure Studio publishes it, on
    // its own grid (10 m from 1900 m), 0.0105 MPa per metre of MD: the mean
    // over the BRINE SAND zone (2020, 2030, 2040 m) is 21.315 MPa
    const wellId = wells[0].id;
    const logId = nextId('log');
    const vals = [];
    for (let d = 1900; d <= 2200 + 1e-9; d += 10) vals.push(0.0105 * d);
    curveStore.set(logId, Float64Array.from(vals));
    logsByWell.get(wellId).push({
      id: logId, well_id: wellId, mnemonic: 'PP', description: 'Pore pressure (eaton n=3)', unit: 'MPA',
      start_md_m: 1900, stop_md_m: 2200, step_m: 10, n_samples: vals.length, null_count: 0, source_file: null,
      provenance: { computed: true, engine: 'pore-pressure-studio', pipeline_version: 'pp-1.1.0', params: { method: 'eaton' } },
      storage_path: `dev/${wellId}/${logId}.f32`, created_at: new Date(2026, 9, 1).toISOString(),
    });
  }
  if (minerals) {
    addRawWell('MINERAL RP-8 (Petrophysics mineral model)', mineralCurves(),
      { DEPT: 'M', DT: 'US/M', DTS: 'US/M', RHOB: 'G/C3', PHIE: 'V/V', VSH: 'V/V', V_QUARTZ: 'V/V', V_CALCITE: 'V/V', V_DOLOMITE: 'V/V' },
      [{ name: 'MIXED', top: 2095, base: 2135 }], { start: 2090, stop: 2140, step: 0.5 },
      (m) => (/^V_/.test(m) ? MINERAL_PROVENANCE : null));
  }
  if (nosonic) {
    const units = { DEPT: 'M', DT: 'US/M', RHOB: 'G/C3', RT: 'OHMM', PHIE: 'V/V', VSH: 'V/V' };
    addRawWell('NOSONIC RP-6 (no sonic log)', sonicPairCurves(false, 0).curves, units,
      [{ name: 'SAND', top: 1560, base: 1600 }], { start: 1500, stop: 1700, step: 0.5 });
    addRawWell('SONIC RP-7 (calibration well)', sonicPairCurves(true, 37).curves, units,
      [{ name: 'SAND', top: 1560, base: 1600 }], { start: 1500, stop: 1700, step: 0.5 });
  }

  // project persistence survives page reloads via sessionStorage so
  // the e2e can prove restore; first load seeds the analytic-fixture
  // project (K_min 37 GPa is the log_domain golden's mineral modulus)
  const PROJECT_KEY = 'rp.dev.project.v1';
  const SEED_PROJECT = {
    id: 'rp-project-dev',
    name: 'Default project',
    rock: { minerals: { quartz: 1, calcite: 0, dolomite: 0, clay: 0 }, kminOverrideGPa: '37', phiConst: 0.2 },
  };

  // Organisation sharing: the project rows live in the in-memory mirror of the
  // sharing rules. The user's own project still survives a reload through
  // sessionStorage; `shared` adds a project a colleague shared for viewing
  // (harness ?shared=1).
  const sharing = makeHarnessSharing(sharingOpts);
  const ME = sharing.me;
  let stored = null;
  try { const raw = window.sessionStorage.getItem(PROJECT_KEY); stored = raw ? JSON.parse(raw) : null; } catch { stored = null; }
  sharing.db.seed('rp_projects', [{ ...(stored || SEED_PROJECT), user_id: ME }], { owner: ME });
  if (shared) {
    sharing.db.seed('rp_projects', [colleagueShared({
      ...SEED_PROJECT, id: 'rp-project-ada', name: 'Gas sand study (Ada)',
      rock: { ...SEED_PROJECT.rock, kminOverrideGPa: '40' }, updated_at: new Date(2026, 8, 30, 9, 0, 0).toISOString(),
    })]);
  }
  const ownRow = () => (sharing.db.select('rp_projects', ME).data || []).find((r) => r.user_id === ME) || null;

  return {
    async listWells() { return [...wells]; },
    async listLogs(wellId) { return [...(logsByWell.get(wellId) || [])]; },
    async downloadCurve(log) {
      const data = curveStore.get(log.id);
      if (!data) throw new Error(`No curve data for ${log.mnemonic}.`);
      return data;
    },
    async listTops(wellId) { return [...(topsByWell.get(wellId) || [])]; },

    // RP0: the account's Geoscience depth unit (the Mapping setting);
    // the fixture is SI so the oracle-anchored labels stay in metres
    async getDepthUnit() { return 'm'; },

    // RP1: overwrite-own publish against the in-memory log list, so
    // the e2e can drive publish + republish without a DB
    async publishCurves(wellId, preparedLogs, projectId) {
      const logs = logsByWell.get(wellId);
      if (!logs) throw new Error('Unknown well.');
      const { staleOwnCurves } = await import('./publish');
      for (const stale of staleOwnCurves(logs, preparedLogs, projectId)) {
        const at = logs.findIndex((l) => l.id === stale.id);
        if (at >= 0) { curveStore.delete(stale.id); logs.splice(at, 1); }
      }
      const saved = [];
      for (const log of preparedLogs) {
        const logId = nextId('log');
        curveStore.set(logId, Float64Array.from(log.data));
        const row = {
          id: logId,
          well_id: wellId,
          mnemonic: log.mnemonic,
          description: log.description,
          unit: log.unit,
          start_md_m: log.startMdM,
          stop_md_m: log.stopMdM,
          step_m: log.stepM,
          n_samples: log.nSamples,
          null_count: log.nullCount,
          source_file: null,
          provenance: log.provenance,
          storage_path: `dev/${wellId}/${logId}.f32`,
          created_at: new Date().toISOString(),
        };
        logs.push(row);
        saved.push(row);
      }
      return saved;
    },
    async listZones(wellId) {
      return [...(zonesByWell.get(wellId) || [])].sort((a, b) => a.top_md_m - b.top_md_m);
    },

    // U2-011: one sample SCAL Studio project (the Petrophysics harness's own;
    // inputs_data shape, schema 1), free-water level 6758.53 ft = 2060 m TVDSS
    async listScalProjects() { return [{ id: 'scal-sample', name: 'Keta SAND J (sample)', updatedAt: '2026-09-29T00:00:00Z' }]; },
    async loadScalProject(id) {
      if (id !== 'scal-sample') return null;
      return {
        id, name: 'Keta SAND J (sample)', schema: 1, samples: [],
        capillary: { jMode: 'manual', manual: { a: '0.25', b: '1.4', Swirr: '0.15' }, SwirrOverride: '', includedSampleIds: [], reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' } },
        height: { gammaW: '1.05', gammaHc: '0.80', fwl_tvdss: '6758.53', swMin: '0.2', swMax: '0.95' },
      };
    },

    async loadProject() { return ownRow(); },
    async listSharedProjects() { return (sharing.db.select('rp_projects', ME).data || []).filter((r) => r.user_id !== ME); },
    async saveProject(patch, { id = null, note = 'Project saved' } = {}) {
      const target = id || ownRow().id;
      const { data, error } = await sharing.store.update('rp_projects', target, patch, { note });
      if (error) throw new Error(error.name === 'RecordConflict' ? error.message : `Could not save the project: ${error.message}`);
      if (data.user_id === ME) {
        try { window.sessionStorage.setItem(PROJECT_KEY, JSON.stringify(data)); } catch { /* jsdom without storage: keep in memory only */ }
      }
      return data;
    },
    sharing: sharing.store,
    /** test seam: the in-memory database and the colleague's store */
    _sharing: sharing,
  };
}
