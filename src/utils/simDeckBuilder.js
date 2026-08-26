// Model Builder adapter (S3): guided form state -> composeDeck spec.
// This is where Suite engine outputs become deck tables:
//   - PVT: Fluid Studio correlations (computePvtTable) -> PVTO/PVDG rows,
//     with the unit seams handled HERE (engine Rs scf/STB -> deck Mscf/STB;
//     engine Bg rb/scf -> deck RB/Mscf).
//   - SCAL: Corey builders (+ optional Leverett-J Pc) -> SWOF/SGOF rows,
//     extended to the saturation-axis ends the simulator equilibrates on
//     (SWOF starts at Swc so initial water is connate; SGOF ends at 1-Swc
//     so the two tables close exactly - the SPE1 lesson).
// Physics stays in the engines; this module shapes and converts.
import { computePvtTable } from '@/utils/fluidStudioCalculations';
import { buildCoreyOilWater, buildCoreyGasOil, pcFromJ } from '@/utils/scalCalculations';
import {
  composeDeck, validateSpec, pvtoRecordsFromTable, resamplePc,
} from '@/utils/simDeckGeneration';

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// ---------------------------------------------------------------- defaults --

export const defaultBuilderForm = () => ({
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
    pc: { enabled: false, jA: '0.35', jB: '0.6', k_md: '150', phi: '0.2', sigma_dyncm: '30', thetaDeg: '30' },
  },
  equil: { datumDepth: '8050', datumPressure: '4200', owc: '8150', goc: '7900' },
  wells: [
    { name: 'PROD1', type: 'producer', i: '9', j: '9', k1: '1', k2: '3', refDepth: '8000', mode: 'ORAT', rate: '4000', bhp: '1200' },
    { name: 'INJ1', type: 'water_injector', i: '2', j: '2', k1: '1', k2: '3', refDepth: '8000', rate: '5000', bhp: '6500' },
  ],
  schedule: { years: '5', reportDays: '30.4375' },
});

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
      { type: 'power', a: num(scalForm.pc.jA, 0.35), b: num(scalForm.pc.jB, 0.6), Swirr: ow.Swc },
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

export function specFromForm(form) {
  const { pvtoRecords, pvdg, pb } = buildPvtFromFluid(form.fluid);
  const { swof, sgof } = buildSatFns(form.scal);

  const wells = form.wells.map((w) => ({
    name: String(w.name || '').trim().toUpperCase(),
    type: w.type,
    i: Math.round(num(w.i)), j: Math.round(num(w.j)),
    k1: Math.round(num(w.k1)), k2: Math.round(num(w.k2)),
    refDepth: num(w.refDepth, num(form.grid.topsDepth, 8000)),
    wellboreRadiusFt: 0.25,
    control: w.type === 'producer'
      ? { mode: w.mode || 'ORAT', rate: num(w.rate), bhpMin: num(w.bhp, 1000) }
      : { rate: num(w.rate), bhpMax: num(w.bhp, 8000) },
  }));

  const reportDays = num(form.schedule.reportDays, 30.4375);
  const count = Math.max(1, Math.round((num(form.schedule.years, 5) * 365.25) / reportDays));

  const spec = {
    title: String(form.title || 'Petrolord model').toUpperCase().slice(0, 60),
    startDate: form.startDate,
    grid: {
      nx: Math.round(num(form.grid.nx)), ny: Math.round(num(form.grid.ny)), nz: Math.round(num(form.grid.nz)),
      dx: num(form.grid.dx, 500), dy: num(form.grid.dy, 500),
      topsDepth: num(form.grid.topsDepth, 8000),
      layers: form.grid.layers.map((l) => ({
        dz: num(l.dz, 30), poro: num(l.poro, 0.2),
        permx: num(l.permx, 100), permz: num(l.permz, 10),
      })),
    },
    pvt: {
      pvtoRecords,
      pvdg,
      pvtw: {
        pref: num(form.water.pref, 4000), bw: num(form.water.bw, 1.02),
        cw: num(form.water.cw, 3e-6), muw: num(form.water.muw, 0.32),
      },
      rock: { pref: num(form.rock.pref, 4000), cr: num(form.rock.cr, 4e-6) },
      density: surfaceDensities(form.fluid, form.water),
    },
    satfn: { swof, sgof },
    equil: {
      datumDepth: num(form.equil.datumDepth),
      datumPressure: num(form.equil.datumPressure),
      owc: num(form.equil.owc),
      goc: num(form.equil.goc),
    },
    wells,
    schedule: { steps: [{ count, dtDays: reportDays }] },
  };
  return { spec, pb };
}

/** Full pipeline: form -> { ok, deck?, spec, pb?, errors }. */
export function buildDeckFromForm(form) {
  let spec;
  let pb;
  try {
    ({ spec, pb } = specFromForm(form));
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
  const check = validateSpec(spec);
  if (!check.ok) return { ok: false, errors: check.errors, spec };
  try {
    return { ok: true, deck: composeDeck(spec), spec, pb };
  } catch (e) {
    return { ok: false, errors: [e.message], spec };
  }
}
