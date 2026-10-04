// Model Builder adapter (S3/S4): guided form state -> composeDeck spec.
// This is where Suite engine outputs become deck tables:
//   - PVT: Fluid Studio correlations (computePvtTable) -> PVTO/PVDG rows,
//     with the unit seams handled HERE (engine Rs scf/STB -> deck Mscf/STB;
//     engine Bg rb/scf -> deck RB/Mscf).
//   - SCAL: Corey builders (+ optional Leverett-J Pc) -> SWOF/SGOF rows,
//     extended to the saturation-axis ends the simulator equilibrates on
//     (SWOF starts at Swc so initial water is connate; SGOF ends at 1-Swc
//     so the two tables close exactly - the SPE1 lesson).
//   - S4: structural tops sampled from a Mapping Studio surface, deviated
//     wells recomputed FRESH from their stored survey at generate time
//     (never stale connections), and MBAL production history as the
//     WCONHIST phase with an optional prediction tail.
// Physics stays in the engines; this module shapes and converts.
import { computePvtTable } from '@/utils/fluidStudioCalculations';
import { buildCoreyOilWater, buildCoreyGasOil, pcFromJ } from '@/utils/scalCalculations';
import {
  composeDeck, validateSpec, pvtoRecordsFromTable, resamplePc,
} from '@/utils/simDeckGeneration';
import { parseSurveyText, buildTrajectoryConnections } from '@/utils/simTrajectoryImport';
import { simRowsFromContract } from '@/utils/fluidstudio/simKeywords';
import { satFnRows } from '@/utils/scalstudio/simKeywords';
import { provenanceNotes } from '@/utils/simstudio/builderIntakes';
import { defaultAquiferForm, aquiferSpec, aquiferNotes } from '@/utils/simstudio/aquiferIntake';

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * SIM-U1-006 (RL1): a blank or unreadable required input is refused with
 * its name. Before, `num(v, default)` put a hidden default in the deck (a
 * blank OWC became a contact at 0 ft). Errors are collected so the user
 * sees every one at once.
 */
export function makeReader() {
  const errors = [];
  const req = (v, label, { min = null, max = null, integer = false } = {}) => {
    const t = typeof v === 'number' ? String(v) : String(v ?? '').trim();
    const n = t === '' ? NaN : Number(t);
    if (!Number.isFinite(n)) {
      errors.push(`${label}: ${t === '' ? 'enter a value' : `"${t}" is not a number`}.`);
      return NaN;
    }
    if (integer && !Number.isInteger(n)) errors.push(`${label}: ${t} must be a whole number.`);
    if (min != null && n < min) errors.push(`${label}: ${t} is below ${min}.`);
    if (max != null && n > max) errors.push(`${label}: ${t} is above ${max}.`);
    return n;
  };
  /** Optional: blank is null (the caller states what null means). */
  const opt = (v, label, o) => (String(v ?? '').trim() === '' ? null : req(v, label, o));
  return { req, opt, errors };
}

// ---------------------------------------------------------------- defaults --

/** Version of the saved builder form (SIM-U1: saved with the case). */
export const BUILDER_FORM_VERSION = 2;

export const defaultBuilderForm = () => ({
  formVersion: BUILDER_FORM_VERSION,
  unitSystem: 'oilfield',
  title: 'My first simulation model',
  startDate: '2026-01-01',
  grid: {
    nx: '10', ny: '10', nz: '3',
    dx: '500', dy: '500', topsDepth: '8000',
    layers: [
      { dz: '25', poro: '0.22', permx: '300', permz: '30' },
      { dz: '35', poro: '0.20', permx: '80', permz: '8' },
      { dz: '40', poro: '0.18', permx: '150', permz: '15' },
    ],
  },
  fluid: {
    api: '35', gasSg: '0.75', tempF: '190', gor: '800', salinityPpm: '30000',
  },
  water: { pref: '4000', bw: '1.02', cw: '3.1e-6', muw: '0.32', rhoLbFt3: '64.5' },
  rock: { pref: '4000', cr: '4e-6' },
  scal: {
    ow: { Swc: '0.15', Sor: '0.25', krwMax: '0.35', kroMax: '0.9', nw: '2.5', no: '2.2' },
    go: { Sgc: '0.03', Sorg: '0.2', krgMax: '0.85', krogMax: '0.9', ng: '2', nog: '2' },
    pc: { enabled: false, jA: '0.35', jB: '0.6', swirr: '', k_md: '150', phi: '0.2', sigma_dyncm: '30', thetaDeg: '30' },
    // SIM-U2-003: the three-phase oil kr model ('' not chosen: the simulator's
    // default, nothing written; 'default', 'stone1', 'stone2' chosen and stated)
    threePhase: '',
  },
  // SIM-U1 (RL11): where the PVT and the saturation functions come from.
  // 'correlation' / 'typed' are the builder's own fields; 'fluid' / 'scal'
  // a pvt-1 / kr-1 block read by id from a saved project (builderIntakes.js).
  pvtSource: { mode: 'correlation', intake: null },
  krSource: { mode: 'typed', intake: null },
  equil: { datumDepth: '8050', datumPressure: '4200', owc: '8150', goc: '7900' },
  wells: [
    { name: 'PROD1', type: 'producer', i: '9', j: '9', k1: '1', k2: '3', refDepth: '8000', mode: 'ORAT', rate: '4000', bhp: '1200', trajectory: null },
    { name: 'INJ1', type: 'water_injector', i: '2', j: '2', k1: '1', k2: '3', refDepth: '8000', rate: '5000', bhp: '6500', trajectory: null },
  ],
  schedule: { years: '5', reportDays: '30.4375' },
  // S4: structural tops from a Mapping Studio surface. When mode is
  // 'surface', tops/dxFt/dyFt come from simStructureImport and replace
  // the uniform topsDepth and DX/DY.
  structure: { mode: 'uniform', surfaceId: null, surfaceName: '', tops: null, dxFt: null, dyFt: null, stats: null },
  // S4/S5: production history -> WCONHIST phase. source 'mbal' allocates
  // field cumulatives across the wells; 'perwell' takes each well's own
  // rates from a CSV (no allocation, wellSummary drives the preview).
  // periods/dates are filled by the History import; predictionYears
  // appends a TSTEP tail.
  history: { enabled: false, source: 'mbal', caseName: '', startDate: null, endDate: null, periods: null, wellSummary: null, predictionYears: '3', fractions: {} },
  // SIM-U2-004: an analytical aquifer, typed or from a Material Balance case (mbal-1)
  aquifer: defaultAquiferForm(),
});

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function fill(defaults, saved) {
  if (!isObj(defaults) || !isObj(saved)) return saved === undefined ? defaults : saved;
  const out = { ...defaults };
  for (const [k, v] of Object.entries(saved)) out[k] = k in defaults && isObj(defaults[k]) && isObj(v) ? fill(defaults[k], v) : v;
  return out;
}

/**
 * A saved form (any version) as the current version: missing keys take the
 * defaults, a version 1 trajectory's "KB to datum" shift becomes the depth
 * reference elevation of the well datum module (deck depth = TVD + shift,
 * so the elevation above the datum is minus the shift). Nothing else moves.
 */
export function migrateBuilderForm(saved) {
  if (!isObj(saved)) return defaultBuilderForm();
  const f = fill(defaultBuilderForm(), saved);
  f.wells = (Array.isArray(saved.wells) ? saved.wells : f.wells).map((w) => {
    if (!w?.trajectory) return w;
    const t = { ...w.trajectory };
    if (t.refElevFt === undefined) {
      const shift = parseFloat(t.kbToDatum);
      t.refKind = t.refKind || 'KB';
      t.refElevFt = Number.isFinite(shift) ? String(-shift) : '';
      t.datumSource = t.datumSource || 'entered';
    }
    delete t.kbToDatum;
    return { ...w, trajectory: t };
  });
  f.formVersion = BUILDER_FORM_VERSION;
  return f;
}

// -------------------------------------------------------------------- PVT ---

/** Fluid Studio correlations -> PVTO records + PVDG rows (deck units). */
export function buildPvtFromFluid(fluidForm) {
  const fluid = {
    api: num(fluidForm.api, 35),
    gasGravity: num(fluidForm.gasSg, 0.7),
    temp: num(fluidForm.tempF, 180),
    rsb: num(fluidForm.gor, 500),
    salinity: num(fluidForm.salinityPpm, 30000),
    pb: null, // solved from Rsb
    correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' },
  };
  const { table, pb } = computePvtTable(fluid);
  const ascending = [...table].sort((a, b) => a.pressure - b.pressure);

  const satRows = ascending
    .filter((r) => r.phase === 'saturated' && r.pressure >= 14.7)
    .map((r) => ({ p: r.pressure, rs: r.Rs / 1000, bo: r.Bo, muo: r.mu_o }));
  const undersat = ascending
    .filter((r) => r.phase === 'undersaturated' && r.pressure > pb + 1)
    .map((r) => ({ p: r.pressure, bo: r.Bo, muo: r.mu_o }));
  const pvtoRecords = pvtoRecordsFromTable(satRows, undersat);

  const pvdg = [];
  ascending.forEach((r) => {
    if (r.pressure < 14.7 || !(r.Bg > 0)) return;
    const last = pvdg[pvdg.length - 1];
    if (last && !(r.pressure > last.p + 0.5)) return;
    pvdg.push({ p: r.pressure, bg: r.Bg * 1000, mug: r.mu_g });
  });

  return { pvtoRecords, pvdg, pb };
}

/** PVTO/PVDG/PVTW from a pvt-1 block (Fluid Systems Studio's own export rows). */
export function buildPvtFromBlock(block) {
  const rows = simRowsFromContract(block);
  if (!rows.ok) throw new Error(`PVT from Fluid Systems Studio: ${rows.reasons.join(' ')}`);
  if (!rows.pvtw) throw new Error('PVT from Fluid Systems Studio: the table holds no water columns for PVTW.');
  return {
    pvtoRecords: rows.pvtoRecords,
    pvdg: rows.pvdg,
    pvtw: { pref: rows.pvtw.pref, bw: rows.pvtw.bw, cw: rows.pvtw.cw, muw: rows.pvtw.muw, viscosibility: rows.pvtw.viscosibility },
    pb: rows.pb,
  };
}

/** Surface densities (lb/ft3) from API gravity, gas SG and a water input. */
export function surfaceDensities(fluidForm, waterForm) {
  const api = num(fluidForm.api, 35);
  return {
    oil: (141.5 / (131.5 + api)) * 62.428,
    water: num(waterForm.rhoLbFt3, 64.5),
    gas: 0.0764 * num(fluidForm.gasSg, 0.7),
  };
}

// ------------------------------------------------------------------- SCAL ---

/** Corey params -> SWOF/SGOF rows, extended to the axis ends the deck
 *  needs: SWOF spans Swc..1 (terminal krw flat, krow 0), SGOF spans
 *  0..1-Swc so the two tables close exactly. */
export function buildSatFns(scalForm) {
  const ow = {
    Swc: num(scalForm.ow.Swc, 0.15), Sor: num(scalForm.ow.Sor, 0.25),
    krwMax: num(scalForm.ow.krwMax, 0.35), kroMax: num(scalForm.ow.kroMax, 0.9),
    nw: num(scalForm.ow.nw, 2.5), no: num(scalForm.ow.no, 2.2),
  };
  const go = {
    Swc: ow.Swc, Sgc: num(scalForm.go.Sgc, 0), Sorg: num(scalForm.go.Sorg, 0.2),
    krgMax: num(scalForm.go.krgMax, 0.85), krogMax: num(scalForm.go.krogMax, 0.9),
    ng: num(scalForm.go.ng, 2), nog: num(scalForm.go.nog, 2),
  };

  const owRows = buildCoreyOilWater(ow, { n: 20 }).rows;
  let swof = owRows.map((r) => ({ Sw: r.Sw, krw: r.krw, krow: r.kro, pcow: 0 }));
  if (1 - ow.Sor < 1 - 1e-9) {
    swof.push({ Sw: 1, krw: ow.krwMax, krow: 0, pcow: 0 });
  }

  if (scalForm.pc?.enabled) {
    const j = pcFromJ(
      // Power-law J(Sw*) = a * Sw*^-b on the true-Sw axis (Swirr = Swc).
      // a blank Swirr is Swc (the S3 behaviour); a typed one is used as typed (SIM-U1)
      { type: 'power', a: num(scalForm.pc.jA, 0.35), b: num(scalForm.pc.jB, 0.6), Swirr: String(scalForm.pc.swirr ?? '').trim() === '' ? ow.Swc : num(scalForm.pc.swirr, ow.Swc) },
      {
        k_md: num(scalForm.pc.k_md, 100), phi: num(scalForm.pc.phi, 0.2),
        sigma_dyncm: num(scalForm.pc.sigma_dyncm, 30), thetaDeg: num(scalForm.pc.thetaDeg, 30),
      },
    );
    if (j?.ok && j.rows?.length) {
      const pcs = resamplePc(j.rows, swof.map((r) => r.Sw));
      swof = swof.map((r, i) => ({ ...r, pcow: Math.max(0, pcs[i]) }));
    }
  }

  const goRows = buildCoreyGasOil(go, { n: 20 }).rows;
  const sgof = [];
  if (go.Sgc > 1e-9) sgof.push({ Sg: 0, krg: 0, krog: go.krogMax, pcog: 0 });
  goRows.forEach((r) => sgof.push({ Sg: r.Sg, krg: r.krg, krog: r.krog, pcog: 0 }));
  if (go.Sorg > 1e-9) sgof.push({ Sg: 1 - go.Swc, krg: go.krgMax, krog: 0, pcog: 0 });

  return { swof, sgof };
}

// ------------------------------------------------------------------- spec ---

/** The composeDeck grid for the current form — shared by specFromForm
 *  and the trajectory preview so both always see the same geometry. */
export function gridFromForm(form) {
  const nx = Math.round(num(form.grid.nx));
  const ny = Math.round(num(form.grid.ny));
  const nz = Math.round(num(form.grid.nz));
  const structure = form.structure || {};
  const useSurface = structure.mode === 'surface' && Array.isArray(structure.tops);
  if (useSurface && structure.tops.length !== nx * ny) {
    throw new Error(`The imported structure was sampled for a different grid (${structure.tops.length} cells vs ${nx * ny}) — re-import the surface after changing NX/NY.`);
  }
  return {
    nx,
    ny,
    nz,
    dx: useSurface ? num(structure.dxFt) : num(form.grid.dx, 500),
    dy: useSurface ? num(structure.dyFt) : num(form.grid.dy, 500),
    ...(useSurface
      ? { tops: structure.tops }
      : { topsDepth: num(form.grid.topsDepth, 8000) }),
    layers: form.grid.layers.map((l) => ({
      dz: num(l.dz, 30), poro: num(l.poro, 0.2),
      permx: num(l.permx, 100), permz: num(l.permz, 10),
    })),
  };
}

export function specFromForm(form) {
  const { req, opt, errors } = makeReader();
  // required inputs read strictly first (SIM-U1-006); the engines and the
  // validators below see no hidden default
  const g = form.grid;
  req(g.nx, 'Grid NX', { min: 1, integer: true });
  req(g.ny, 'Grid NY', { min: 1, integer: true });
  const nzN = req(g.nz, 'Grid NZ', { min: 1, integer: true });
  if (form.structure?.mode !== 'surface') {
    req(g.dx, 'DX', { min: 0 }); req(g.dy, 'DY', { min: 0 }); req(g.topsDepth, 'Top depth');
  }
  (g.layers || []).slice(0, Number.isFinite(nzN) ? nzN : 0).forEach((l, i) => {
    req(l.dz, `Layer ${i + 1} DZ`, { min: 0 });
    req(l.poro, `Layer ${i + 1} porosity`, { min: 0, max: 1 });
    req(l.permx, `Layer ${i + 1} kh`, { min: 0 });
    req(l.permz, `Layer ${i + 1} kv`, { min: 0 });
  });
  const fluidBlock = form.pvtSource?.mode === 'fluid' ? form.pvtSource.intake?.contract : null;
  if (form.pvtSource?.mode === 'fluid' && !fluidBlock) errors.push('PVT: the Fluid Systems Studio block is missing; take the project again or switch to typed correlation inputs.');
  if (!fluidBlock) {
    req(form.fluid.api, 'Oil API', { min: 5, max: 70 });
    req(form.fluid.gasSg, 'Gas gravity', { min: 0.5, max: 2 });
    req(form.fluid.tempF, 'Reservoir temperature');
    req(form.fluid.gor, 'Solution GOR', { min: 0 });
    req(form.fluid.salinityPpm, 'Salinity', { min: 0 });
    req(form.water.bw, 'Bw', { min: 0.5, max: 2 }); req(form.water.cw, 'cw', { min: 0 }); req(form.water.muw, 'Water viscosity', { min: 0 });
    req(form.water.pref, 'Reference pressure', { min: 0 });
  }
  req(form.water.rhoLbFt3, 'Water density', { min: 0 });
  req(form.rock.cr, 'Rock compressibility', { min: 0 });
  ['Swc', 'Sor', 'krwMax', 'kroMax', 'nw', 'no'].forEach((k) => req(form.scal.ow[k], `SCAL ${k}`, { min: 0 }));
  ['Sgc', 'Sorg', 'krgMax', 'krogMax', 'ng', 'nog'].forEach((k) => req(form.scal.go[k], `SCAL ${k}`, { min: 0 }));
  if (form.scal.pc?.enabled) ['jA', 'jB', 'k_md', 'phi', 'sigma_dyncm', 'thetaDeg'].forEach((k) => req(form.scal.pc[k], `Capillary ${k}`));
  req(form.equil.datumDepth, 'Datum depth');
  req(form.equil.datumPressure, 'Pressure at datum', { min: 0 });
  const owc = opt(form.equil.owc, 'OWC depth');
  const goc = opt(form.equil.goc, 'GOC depth');
  form.wells.forEach((w, i) => {
    const label = `Well ${String(w.name || i + 1).trim()}`;
    if (!String(w.name || '').trim()) errors.push(`Well ${i + 1}: enter a name.`);
    req(w.rate, `${label} rate`, { min: 0 });
    req(w.bhp, `${label} BHP limit`, { min: 0 });
    if (!w.trajectory?.enabled) {
      ['i', 'j', 'k1', 'k2'].forEach((k) => req(w[k], `${label} ${k.toUpperCase()}`, { min: 1, integer: true }));
    } else {
      req(w.trajectory.wellheadX, `${label} wellhead X`); req(w.trajectory.wellheadY, `${label} wellhead Y`);
      req(w.trajectory.refElevFt, `${label} depth reference elevation`);
    }
  });
  req(form.schedule.reportDays, 'Report interval', { min: 0.01 });
  // SIM-U2-004: the aquifer inputs, read strictly (the values are used below)
  if (form.aquifer?.enabled) aquiferSpec(form.aquifer, { grid: { nx: 1, ny: 1, nz: 1 }, pvtw: { muw: 1 }, datumDepth: 0, endDays: 1, req });
  if (!(form.history?.enabled && form.history?.periods)) req(form.schedule.years, 'Duration', { min: 0.01 });
  if (errors.length) {
    const e = new Error(errors.join('\n'));
    e.list = errors;
    throw e;
  }

  let pvtoRecords; let pvdg; let pb; let pvtw; let density;
  if (fluidBlock) {
    ({ pvtoRecords, pvdg, pb, pvtw } = buildPvtFromBlock(fluidBlock));
    const water = { rhoLbFt3: form.water.rhoLbFt3 };
    density = surfaceDensities({ api: fluidBlock.inputs?.oil_gravity, gasSg: fluidBlock.inputs?.gas_gravity }, water);
  } else {
    ({ pvtoRecords, pvdg, pb } = buildPvtFromFluid(form.fluid));
    pvtw = {
      pref: num(form.water.pref, 4000), bw: num(form.water.bw, 1.02),
      cw: num(form.water.cw, 3e-6), muw: num(form.water.muw, 0.32),
    };
    density = surfaceDensities(form.fluid, form.water);
  }

  let swof; let sgof;
  if (form.krSource?.mode === 'scal') {
    const sc = form.scal;
    const ow = Object.fromEntries(Object.entries(sc.ow).map(([k, v]) => [k, Number(v)]));
    const go = { ...Object.fromEntries(Object.entries(sc.go).map(([k, v]) => [k, Number(v)])), Swc: ow.Swc };
    const withPc = !!sc.pc?.enabled;
    const swirr = String(sc.pc?.swirr ?? '').trim() === '' ? ow.Swc : Number(sc.pc.swirr);
    const rows = satFnRows({
      ow, go, withPc,
      jSpec: withPc ? { type: 'power', a: Number(sc.pc.jA), b: Number(sc.pc.jB), Swirr: swirr } : null,
      reservoir: withPc ? { k_md: Number(sc.pc.k_md), phi: Number(sc.pc.phi), sigma_dyncm: Number(sc.pc.sigma_dyncm), thetaDeg: Number(sc.pc.thetaDeg) } : null,
    });
    if (!rows.ok) throw new Error(`Saturation functions: ${rows.errors.join(' ')}`);
    ({ swof, sgof } = rows);
  } else {
    ({ swof, sgof } = buildSatFns(form.scal));
  }
  const grid = gridFromForm(form);

  const wells = form.wells.map((w) => {
    const name = String(w.name || '').trim().toUpperCase();
    const base = {
      name,
      type: w.type,
      refDepth: num(w.refDepth, num(form.grid.topsDepth, 8000)),
      wellboreRadiusFt: 0.25,
      control: w.type === 'producer'
        ? { mode: w.mode || 'ORAT', rate: num(w.rate), bhpMin: num(w.bhp, 1000) }
        : { rate: num(w.rate), bhpMax: num(w.bhp, 8000) },
    };
    const traj = w.trajectory;
    if (traj?.enabled) {
      // Recompute connections from the stored survey at generate time so
      // grid edits can never leave a well on stale cells. The survey's TVD
      // is below the well's depth reference; the deck depth is TVDSS, so
      // the shift is minus the reference elevation (well datum module).
      const { stations, errors: surveyErrors } = parseSurveyText(traj.text);
      if (surveyErrors.length) throw new Error(`Well ${name} survey: ${surveyErrors[0]}`);
      const t = buildTrajectoryConnections({
        stations,
        mdUnit: traj.mdUnit === 'm' ? 'm' : 'ft',
        wellheadX: num(traj.wellheadX),
        wellheadY: num(traj.wellheadY),
        kbToDatumFt: -num(traj.refElevFt, 0),
      }, grid);
      return { ...base, connections: t.connections, refDepth: t.refDepthFt };
    }
    return {
      ...base,
      i: Math.round(num(w.i)), j: Math.round(num(w.j)),
      k1: Math.round(num(w.k1)), k2: Math.round(num(w.k2)),
    };
  });

  const reportDays = num(form.schedule.reportDays, 30.4375);
  const count = Math.max(1, Math.round((num(form.schedule.years, 5) * 365.25) / reportDays));

  const hist = form.history;
  const useHistory = !!(hist?.enabled && Array.isArray(hist.periods) && hist.periods.length && hist.endDate);
  let schedule;
  let startDate = form.startDate;
  if (useHistory) {
    startDate = hist.startDate || hist.periods[0].date;
    const predYears = num(hist.predictionYears, 0);
    schedule = {
      history: { periods: hist.periods, endDate: hist.endDate },
      ...(predYears > 0
        ? { steps: [{ count: Math.max(1, Math.round((predYears * 365.25) / reportDays)), dtDays: reportDays }] }
        : {}),
    };
  } else {
    schedule = { steps: [{ count, dtDays: reportDays }] };
  }

  // the run length in days: history plus prediction, or the duration
  const endDays = useHistory
    ? (Date.parse(`${hist.endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + num(hist.predictionYears, 0) * 365.25
    : count * reportDays;
  const aquifer = aquiferSpec(form.aquifer, {
    grid, pvtw, datumDepth: num(form.equil.datumDepth), endDays, req: (v) => Number(v),
  });
  const spec = {
    title: String(form.title || 'Petrolord model').toUpperCase().slice(0, 60),
    startDate,
    grid,
    pvt: {
      pvtoRecords,
      pvdg,
      pvtw,
      rock: { pref: num(form.rock.pref, num(pvtw.pref, 4000)), cr: num(form.rock.cr, 4e-6) },
      density,
    },
    satfn: { swof, sgof, ...(form.scal?.threePhase ? { threePhase: form.scal.threePhase } : {}) },
    equil: {
      datumDepth: num(form.equil.datumDepth),
      datumPressure: num(form.equil.datumPressure),
      // blank contact: the composer puts it outside the grid (stated in the report)
      ...(owc != null ? { owc } : {}),
      ...(goc != null ? { goc } : {}),
    },
    wells,
    schedule,
    // SIM-U1: ask the simulator for the field balance sheet and the well
    // totals, so the run's material balance can be read from its PRT
    report: { balance: true },
    notes: [...provenanceNotes(form, { pb }), ...aquiferNotes(form.aquifer, aquifer)],
    ...(aquifer && !aquifer.invalid ? { aquifer } : {}),
  };
  return { spec, pb };
}

/** Full pipeline: form -> { ok, deck?, spec, pb?, errors }. */
export function buildDeckFromForm(form) {
  let spec;
  let pb;
  try {
    ({ spec, pb } = specFromForm(migrateBuilderForm(form)));
  } catch (e) {
    return { ok: false, errors: e.list || [e.message] };
  }
  const check = validateSpec(spec);
  if (!check.ok) return { ok: false, errors: check.errors, spec };
  try {
    return { ok: true, deck: composeDeck(spec), spec, pb };
  } catch (e) {
    return { ok: false, errors: [e.message], spec };
  }
}
