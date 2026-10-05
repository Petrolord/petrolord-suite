/**
 * The reviewer's side of a well test report (tester round 2, 2026-10-02):
 * what was put in, where it came from, how the well was completed and what
 * was done to it. Pure formatting and bookkeeping over the studio state.
 * The arithmetic lives in the engines and is called from here, never
 * restated: total compressibility (compressibility.js), the partial
 * penetration pseudo-skin and the skin split (partialPenetration.js), the
 * period volumes (flowSummary.js), and the gas correlations named by the
 * PVT table the engine built (gas.js `source`).
 *
 * State is oilfield always (ft, psi, STB/D); values are converted to the
 * display system here, through the studio's unit registry. A value that was
 * not provided prints as EMPTY_VALUE, never as a blank or a zero.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  INPUT_SOURCES, sourceText, assumedDefaultText, pvtIntake as intakeFromHandoff, intakeSourceText, editedAfterHandoffText,
  pvtContractOf, pvtContractOrigin,
} from '@/lib/inputProvenance';
import { unitLabel, fromOilfield } from './units.js';
import { partialPenetrationSkin, slantPseudoSkin, decomposeSkin } from './partialPenetration.js';
import { totalCompressibility } from './compressibility.js';
import { summarizeFlowPeriods } from './flowSummary.js';
import { PRESSURE_UNITS, TIME_UNITS, gaugeTime } from './gaugeImport.js';
import { suttonPseudoCriticals, GAS_Z_METHODS } from '../../../packages/engines/engines/fluid/blackOil';
import { datumCorrection } from './datum.js';

const num = (v) => {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};
const text = (v) => (v != null && String(v).trim() ? String(v).trim() : '');
export const orNA = (v) => text(v) || EMPTY_VALUE;

// ---- identification ---------------------------------------------------------

export const TEST_LABELS = Object.freeze({
  buildup: 'Pressure buildup',
  drawdown: 'Pressure drawdown',
  injection: 'Injection test',
  falloff: 'Injection falloff',
});

// How the test was run, beside the period that is analysed.
export const TEST_OPERATIONS = Object.freeze({
  '': 'Not stated',
  dst: 'Drill stem test (DST)',
  production: 'Production test',
  wireline: 'Wireline formation test',
  injectivity: 'Injectivity test',
});

export const DEFAULT_IDENTIFICATION = Object.freeze({
  company: '', // WTA-U1-004: typed; blank prints the organisation name
  licence: '',
  zone: '',
  testDateStart: '',
  testDateEnd: '',
  operation: '',
  registryWellId: '',
  registryWellName: '',
});

export const DEFAULT_COMPLETION = Object.freeze({
  perfTopMd: '', perfBaseMd: '', payTopMd: '',
  perfTopTvd: '', perfBaseTvd: '', payTopTvd: '',
  tvdSource: '',
  // WTA-U1-005 (owner default, plan question 6): the gauge depth and the
  // pressure datum are stated inputs, printed in the report; no correction
  // to the datum is applied and the report says so
  gaugeDepthMd: '', gaugeDepthTvd: '', datumDepthTvdss: '',
  // WTA-U2-004: what puts the gauge on the datum. The gradient is the
  // user's (owner default: none stated, no correction) with its source.
  depthRefElev: '', datumGradient: '', datumGradientSource: '',
});

/** The correction to datum of a completion through the engine (welltest/datum.js); depths ft, psi/ft. */
export function completionDatumCorrection(completion) {
  const c = completion || {};
  return datumCorrection({
    gaugeTvd: num(c.gaugeDepthTvd), refElevation: num(c.depthRefElev), datumTvdss: num(c.datumDepthTvdss), gradient: num(c.datumGradient),
  });
}

/** "Pressure buildup, drill stem test (DST)" style line for the header. */
export function testTypeText(config, identification) {
  const base = TEST_LABELS[config?.testType] || 'Well test';
  const op = identification?.operation;
  return op && TEST_OPERATIONS[op] ? `${base}, ${TEST_OPERATIONS[op].replace(/^./, (c) => c.toLowerCase())}` : base;
}

/** "2026-09-14 to 2026-09-17", one date, or EMPTY_VALUE. */
export function testDatesText(identification) {
  const a = text(identification?.testDateStart);
  const b = text(identification?.testDateEnd);
  if (a && b && a !== b) return `${a} to ${b}`;
  return a || b || EMPTY_VALUE;
}

// ---- formatting -------------------------------------------------------------

/** A number as a person would write it: up to 5 significant figures, scientific outside 1e-3..1e6. */
export function plain(v) {
  if (!Number.isFinite(v)) return EMPTY_VALUE;
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a < 1e-3 || a >= 1e6) return v.toExponential(3).replace(/\.?0+e/, 'e');
  return String(parseFloat(v.toPrecision(5)));
}

const shown = (kind, oilValue, system) => plain(fromOilfield(kind, oilValue, system));

const interval = (kind, top, base, system) => (
  Number.isFinite(top) && Number.isFinite(base)
    ? `${shown(kind, top, system)} to ${shown(kind, base, system)}`
    : EMPTY_VALUE
);

// ---- input sources ----------------------------------------------------------

// The source model, its wording and the PVT handoff are the Suite's shared
// input provenance (src/lib/inputProvenance), which was taken from here.
export { INPUT_SOURCES, sourceText };

/** Inputs that carry a source selector, in the order the Data rail lists them. */
export const SOURCED_INPUTS = Object.freeze([
  { key: 'h', label: 'Net pay h' },
  { key: 'phi', label: 'Porosity phi' },
  { key: 'sw', label: 'Water saturation Sw' },
  { key: 'rw', label: 'Wellbore radius rw' },
  { key: 'ct', label: 'Total compressibility ct' },
  { key: 'mu', label: 'Viscosity mu' },
  { key: 'B', label: 'Formation volume factor' },
  { key: 'apiGravity', label: 'API gravity' },
  { key: 'gor', label: 'Solution GOR' },
  { key: 'gasGravity', label: 'Gas gravity' },
  { key: 'temperature', label: 'Reservoir temperature' },
  { key: 'pi', label: 'Initial pressure pi' },
  { key: 'kvkh', label: 'kv/kh' },
]);

/** Engine PVT source (gas.js) as a sentence, or null when the engine gave none. */
export function gasPvtSourceText(source) {
  if (!source) return null;
  // WTA-U2-001: the pvt-1 table of a Fluid Systems Studio project
  if (source.kind === 'fluid-table') return `Fluid Systems Studio table: z by ${source.zMethod}, viscosity by ${source.muMethod}${source.origin || ''}`;
  if (source.kind === 'table') return 'Supplied PVT table';
  const parts = [`${source.z} z-factor`, `${source.viscosity} viscosity`];
  if (source.pseudoCriticals) parts.push(`${source.pseudoCriticals} pseudo-criticals`);
  return `Correlation: ${parts.join(', ')} (computed by the studio)`;
}

// What this studio takes from the fluid backbone (the PVT provenance
// contract, lib/inputProvenance/pvtContract), in the order it is applied.
export const WELLTEST_PVT_FIELDS = Object.freeze([
  { property: 'bo_at_pb', key: 'B', label: 'Bo' },
  { property: 'mu_o_at_pb', key: 'mu', label: 'viscosity' },
  { property: 'oil_gravity', key: 'apiGravity', label: 'API gravity' },
  { property: 'rsb', key: 'gor', label: 'solution GOR' },
  { property: 'gas_gravity', key: 'gasGravity', storeKey: 'solutionGasGravity', label: 'gas gravity' },
  { property: 'inlet_temperature', key: 'temperature', storeKey: 'reservoirTempF', label: 'temperature' },
]);

// ---- the gas PVT table of a Fluid Systems Studio project (WTA-U2-001) --------

/**
 * The gas rows of a pvt-1 block: pressure, Z and gas viscosity, in the
 * units the block states (psia, cP), ascending in pressure, with the
 * method of each column as the block names it. The table of a black-oil
 * project carries Z and mu_g at every pressure (the separator gas); an
 * equation-of-state table carries them where it has a gas phase.
 * @returns {?{rows: Array<{p: number, z: number, mu: number}>, n: number, pMin: number, pMax: number,
 *   zMethod: string, muMethod: string, origin: string, temperatureF: ?number, gasGravity: ?number, rangeFlags: string[]}}
 *   null when the block has fewer than three usable gas rows or states other units
 */
export function gasTableFromContract(carrier) {
  const b = pvtContractOf(carrier);
  if (!b || !Array.isArray(b.table)) return null;
  const u = b.units || {};
  if (u.pressure !== 'psia' || (u.mu_g && !/^c[Pp]$/.test(u.mu_g))) return null;
  const rows = b.table
    .map((r) => ({ p: Number(r?.pressure), z: Number(r?.Z), mu: Number(r?.mu_g) }))
    .filter((r) => Number.isFinite(r.p) && r.p > 0 && r.z > 0 && r.mu > 0)
    .sort((a, c) => a.p - c.p)
    .filter((r, i, arr) => i === 0 || r.p > arr[i - 1].p);
  if (rows.length < 3) return null;
  const finiteOr = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  return {
    rows,
    n: rows.length,
    pMin: rows[0].p,
    pMax: rows[rows.length - 1].p,
    zMethod: b.methods?.z?.method || 'method not stated by the block',
    muMethod: b.methods?.mu_g?.method || 'method not stated by the block',
    origin: pvtContractOrigin(b),
    temperatureF: finiteOr(b.inputs?.temperature),
    gasGravity: finiteOr(b.inputs?.gas_gravity),
    rangeFlags: (b.range_flags || []).filter((f) => (f.properties || []).some((x) => /Gas deviation|Gas viscosity/.test(x))).map((f) => f.text).filter(Boolean),
  };
}

/** The shared card's rows in this studio: the oil values, and the gas table when the intake holds one (method from the block). */
export function wellTestPvtCardFields(intake) {
  const gt = intake?.gasTable;
  if (!gt) return WELLTEST_PVT_FIELDS;
  return [
    ...WELLTEST_PVT_FIELDS,
    { property: 'z', key: 'gasTableRows', label: `Gas Z and viscosity table (rows, ${plain(gt.pMin)} to ${plain(gt.pMax)} psia)`, method: `Z: ${gt.zMethod}; viscosity: ${gt.muMethod}` },
  ];
}

/**
 * A Fluid Systems Studio handoff (the fluid backbone) as a patch of the
 * reservoir inputs and the words for the Source column. Bo and viscosity
 * are results of that app's PVT model, so they carry the correlation names
 * (or the equation of state) the backbone itself states; API gravity, GOR,
 * gas gravity and temperature are inputs of that model and are named as
 * such. A backbone that does not say how it was computed is reported as
 * exactly that.
 */
export function pvtIntakeFromBackbone(fluid) {
  const out = intakeFromHandoff(fluid, WELLTEST_PVT_FIELDS);
  if (!out) return null;
  // RL11 (gap matrix, confirmed by WTA-U1-019): the shared intake records the
  // values received only for a pvt-1 handoff, so a value edited after a
  // version-1 handoff kept the handoff as its source. The values applied are
  // recorded here for every handoff.
  let intake = out.intake.values ? out.intake : {
    ...out.intake,
    values: Object.fromEntries(WELLTEST_PVT_FIELDS
      .filter((f) => out.patch[f.storeKey || f.key] != null && out.patch[f.storeKey || f.key] !== '')
      .map((f) => [f.key, out.patch[f.storeKey || f.key]])),
  };
  // WTA-U2-001: a gas test takes the gas columns of the pvt-1 table with the
  // project (the summary the shared intake keeps has no table)
  // (the receiving studio switches a gas test to the table: takeFluidPvt)
  const gasTable = gasTableFromContract(fluid?.contract || fluid);
  if (gasTable) intake = { ...intake, gasTable, values: { ...(intake.values || {}), gasTableRows: String(gasTable.n) } };
  return { patch: out.patch, applied: out.applied, intake };
}

/**
 * What a gas test takes besides the version-1 values when the intake holds
 * a gas table (WTA-U2-001): the table as its gas PVT, and the temperature
 * the table was built at. An oil test only keeps the table with the
 * project, to be chosen if the test is switched to gas.
 */
export function gasTablePatch(intake, fluid) {
  const gt = intake?.gasTable;
  if (!gt || fluid !== 'gas') return null;
  return {
    patch: { gasPvtSource: 'fluid-table', ...(gt.temperatureF != null ? { tempF: String(gt.temperatureF) } : {}) },
    applied: `the gas Z and viscosity table (${gt.n} rows)`,
  };
}

// ---- total compressibility --------------------------------------------------

/**
 * ct for the analysis. Mode 'components' sums cf and the saturation-weighted
 * fluid terms through the engine; any other mode is the single entered
 * number ("entered as total"), which is how every project saved before this
 * round holds it.
 * @returns {{mode: 'total'|'components', ct: number, error: ?string, breakdown: ?object}}
 */
export function resolveTotalCompressibility(r, { cgFallback = NaN } = {}) {
  if (r?.ctMode !== 'components') return { mode: 'total', ct: num(r?.ct), error: null, breakdown: null };
  const sg = num(r.sg);
  const cgEntered = num(r.cg);
  const cgUsed = Number.isFinite(cgEntered) ? cgEntered : cgFallback;
  const out = totalCompressibility({
    cf: num(r.cf),
    so: num(r.so), co: num(r.co),
    sw: num(r.sw), cw: num(r.cw),
    sg, cg: cgUsed,
  });
  if (!out.ok) return { mode: 'components', ct: NaN, error: `Total compressibility from components: ${out.reason}`, breakdown: null };
  return {
    mode: 'components', ct: out.ct, error: null,
    breakdown: { ...out, cgFromCorrelation: Number.isFinite(sg) && sg > 0 && !Number.isFinite(cgEntered) && Number.isFinite(cgFallback) },
  };
}

// ---- rate-dependent skin (WTA-U2-003) ----------------------------------------

export const RATE_SKIN_METHOD_TEXT = "s' = s + D q (Ahmed 2010, eq. 6-160). Route 1: the apparent skin of each of two or more flow periods or tests at different rates, each from its own analysis reaching radial flow, on a straight line against the rate (intercept s, slope D). Route 2: the turbulent coefficient b of a pseudo-pressure LIT deliverability fit is the non-Darcy coefficient F, and D = F k h / (1422 T) (eq. 6-159); a pressure-squared b is not F and is not used.";

/**
 * Rows of the rate-dependent skin table: [quantity, value, basis], in the display system.
 */
export function rateSkinRows(rs, system = 'oilfield') {
  if (!rs) return [];
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : EMPTY_VALUE);
  const dU = unitLabel('nonDarcySkin', system);
  const D = (v) => plain(fromOilfield('nonDarcySkin', v, system));
  const rows = [];
  if (rs.fit?.ok) {
    rows.push([`D, multi-rate line (${dU})`, D(rs.fit.D), `${rs.fit.n} points at ${rs.fit.rates} rates${rs.fit.r2 != null ? `, r2 ${rs.fit.r2.toFixed(3)}` : ''}`]);
    rows.push(['s, intercept of the multi-rate line', f2(rs.fit.s), rs.fit.method]);
  } else {
    rows.push([`D, multi-rate line (${dU})`, EMPTY_VALUE, rs.fit?.reason || 'Not computed']);
  }
  rows.push([`D, from the LIT b (${dU})`, Number.isFinite(rs.litD) ? D(rs.litD) : EMPTY_VALUE, Number.isFinite(rs.litD) ? 'D = F k h / (1422 T), F = b of the pseudo-pressure LIT fit, k of this test' : 'Needs a pseudo-pressure deliverability fit with b above zero']);
  rows.push([`D q at this test's rate`, f2(rs.Dq), rs.source === 'multi-rate' ? 'D of the multi-rate line' : rs.source === 'lit' ? 'D from the LIT b' : 'No D: the skin stays apparent']);
  rows.push(["This test: s' and s = s' - D q", `${f2(rs.apparentSkin)} and ${f2(rs.trueSkin)}`, 'From the interpretation']);
  return rows;
}

// ---- completion and the skin split ------------------------------------------

/** kv/kh used when none is entered. Stated as an assumption wherever it is used. */
export const DEFAULT_KVKH = 0.1;
export const DEFAULT_KVKH_SOURCE = assumedDefaultText(DEFAULT_KVKH);

/**
 * The perforated interval as lengths. True vertical depths are used when
 * both ends carry one; otherwise measured depths, which is exact for a
 * vertical hole only and is said so.
 * @returns {{status: 'none'|'ok'|'invalid', basis?: 'TVD'|'MD', hp?: number,
 *   h1?: number, h1Assumed?: boolean, reason?: string, md: object, tvd: object}}
 */
export function buildCompletion(completion) {
  const c = completion || {};
  const md = { top: num(c.perfTopMd), base: num(c.perfBaseMd), payTop: num(c.payTopMd) };
  const tvd = { top: num(c.perfTopTvd), base: num(c.perfBaseTvd), payTop: num(c.payTopTvd) };
  const hasMd = Number.isFinite(md.top) && Number.isFinite(md.base);
  const hasTvd = Number.isFinite(tvd.top) && Number.isFinite(tvd.base);
  const shared = { md, tvd, tvdSource: text(c.tvdSource) };
  if (!hasMd && !hasTvd) {
    const partial = [md.top, md.base, tvd.top, tvd.base].some(Number.isFinite);
    return { status: 'none', reason: partial ? 'Enter both the top and the base of the perforated interval.' : 'Perforated interval not entered.', ...shared };
  }
  const basis = hasTvd ? 'TVD' : 'MD';
  const d = hasTvd ? tvd : md;
  if (!(d.base > d.top)) return { status: 'invalid', basis, reason: 'The base of the perforated interval must be deeper than its top.', ...shared };
  const h1Assumed = !Number.isFinite(d.payTop);
  // WTA-U2-007: with both MD and TVD of the perforations, a longer MD than
  // TVD interval is a deviated well; its angle from vertical over the interval
  let deviation = null;
  if (hasMd && hasTvd) {
    const dMd = md.base - md.top;
    const dTvd = tvd.base - tvd.top;
    if (dMd > 0 && dTvd > 0 && dTvd <= dMd * (1 + 1e-9) && dMd > dTvd * (1 + 1e-6)) {
      deviation = { thetaDeg: (Math.acos(Math.min(dTvd / dMd, 1)) * 180) / Math.PI, dMd, dTvd };
    }
  }
  return { status: 'ok', basis, hp: d.base - d.top, h1: h1Assumed ? 0 : d.top - d.payTop, h1Assumed, deviation, ...shared };
}

/**
 * Total skin split into the partial-penetration pseudo-skin and the
 * mechanical (damage) skin, through the engine.
 * status: 'not-entered' (no interval: the total stands alone),
 *   'refused' (the engine would not compute, with its reason),
 *   'full' (the whole pay is open), 'ok'.
 */
export function buildSkinBreakdown({ totalSkin, reservoir, completion, kvkhInput, isGas = false, rateSkin = null }) {
  const comp = buildCompletion(completion);
  // WTA-U2-003: the rate-dependent part D q of a gas skin, when a route gave D
  const Dq = isGas && Number.isFinite(rateSkin?.Dq) ? rateSkin.Dq : NaN;
  const rate = Number.isFinite(Dq) ? {
    Dq, D: rateSkin.D, q: rateSkin.q,
    source: rateSkin.source === 'multi-rate'
      ? `D from the apparent skins at ${rateSkin.fit?.rates} rates (${rateSkin.fit?.method})`
      : 'D from the pseudo-pressure LIT b as the non-Darcy coefficient F: D = F k h / (1422 T) (Ahmed 2010, eq. 6-159)',
  } : null;
  const kvkhEntered = num(kvkhInput);
  const kvkhGiven = kvkhInput != null && String(kvkhInput).trim() !== '';
  const kvkh = kvkhGiven ? kvkhEntered : DEFAULT_KVKH;
  const base = {
    totalSkin: Number.isFinite(totalSkin) ? totalSkin : NaN,
    spp: NaN, mechanicalSkin: NaN,
    h: reservoir?.h, rw: reservoir?.rw, hp: comp.hp, h1: comp.h1, h1Assumed: !!comp.h1Assumed,
    basis: comp.basis || null, kvkh, kvkhDefaulted: !kvkhGiven,
    method: null, formula: null, splitFormula: null, reference: null, splitReference: null,
    totalLabel: isGas ? "Apparent skin s'" : 'Total skin s',
    mechanicalLabel: isGas && !rate ? 'Mechanical and rate-dependent skin' : 'Mechanical (damage) skin s_d',
    rate,
  };
  if (comp.status === 'none') {
    return { ...base, status: 'not-entered', message: `${comp.reason} The skin is reported as a total and is not split.` };
  }
  if (comp.status === 'invalid') return { ...base, status: 'refused', message: `${comp.reason} The skin is not split.` };
  if (!reservoir) return { ...base, status: 'refused', message: 'Net pay and wellbore radius are needed to split the skin.' };
  const out = partialPenetrationSkin({
    totalSkin: Number.isFinite(totalSkin) ? totalSkin : undefined,
    h: reservoir.h, hp: comp.hp, h1: comp.h1, rw: reservoir.rw, kvkh,
  });
  if (!out.ok) return { ...base, status: 'refused', code: out.code, message: `${out.reason} The skin is not split.` };
  // WTA-U2-007: the slant pseudo-skin of a deviated interval (Cinco-Ley et al. 1975, engine)
  const slantOut = comp.deviation ? slantPseudoSkin({ thetaDeg: comp.deviation.thetaDeg, h: reservoir.h, rw: reservoir.rw, kvkh }) : null;
  const slant = slantOut?.ok ? {
    sTheta: slantOut.sTheta, thetaDeg: comp.deviation.thetaDeg, thetaPrime: slantOut.thetaPrime, hD: slantOut.hD,
    method: slantOut.method, formula: slantOut.formula, reference: slantOut.reference, warnings: slantOut.warnings,
  } : null;
  // the mechanical skin left after every pseudo-skin and the rate-dependent
  // part, through the engine's split s_d = (hp/h) (s - the rest)
  const rest = out.spp + (slant ? slant.sTheta : 0) + (rate ? rate.Dq : 0);
  const split = Number.isFinite(totalSkin) ? decomposeSkin({ totalSkin, h: reservoir.h, hp: out.hpD * reservoir.h, spp: rest }) : null;
  const named = {
    ...base, spp: out.spp, hpD: out.hpD, h1D: out.h1D, rD: out.rD,
    method: out.method, formula: out.formula, reference: out.reference,
    splitReference: out.split?.reference || null,
    slant,
    mechanicalSkin: split?.ok ? split.mechanicalSkin : NaN,
    splitFormula: out.split?.formula ? `s_d = (hp/h) (s - s_pp${slant ? ' - s_theta' : ''}${rate ? ' - D q' : ''})` : null,
  };
  const notes = [];
  if (comp.deviation && !slant) notes.push(`The interval is deviated ${comp.deviation.thetaDeg.toFixed(1)} degrees from vertical, but no slant pseudo-skin was computed: ${slantOut?.reason || 'it could not be evaluated'}`);
  if (slant && !out.fullyOpen) notes.push('For a well both slanted and partially open the published Cinco-Ley table holds a larger slant term than the full-penetration correlation used here, so this split is approximate.');
  if (slant?.warnings?.length) notes.push(...slant.warnings);
  if (comp.basis === 'MD') notes.push('Lengths are measured depths, which is exact for a vertical hole only.');
  if (comp.h1Assumed) notes.push('Top of net pay not entered: the perforations are taken to start at the top of the pay.');
  if (!kvkhGiven) notes.push(`kv/kh not entered: ${DEFAULT_KVKH} is assumed.`);
  if (!Number.isFinite(totalSkin)) notes.push('No total skin is available, so only the geometric part is given.');
  if (out.fullyOpen) {
    return { ...named, status: 'full', message: ['The perforations cover the whole net pay: no partial-penetration skin.', ...notes.filter((n) => !/kv\/kh|Top of net pay/.test(n))].join(' ') };
  }
  return { ...named, status: 'ok', message: notes.join(' ') };
}

/** Rows of the "Skin components" table: [label, value, basis]. */
export function skinBreakdownRows(sb, system = 'oilfield') {
  if (!sb) return [];
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : EMPTY_VALUE);
  const L = unitLabel('length', system);
  const rows = [[sb.totalLabel, f2(sb.totalSkin), 'From the interpretation']];
  if (sb.rate) {
    rows.push([`Rate-dependent skin D q (q ${plain(fromOilfield('gasRate', sb.rate.q, system))} ${unitLabel('gasRate', system)})`, f2(sb.rate.Dq), sb.rate.source]);
    rows.push(["Skin without the rate-dependent part s = s' - D q", f2(sb.totalSkin - sb.rate.Dq), 'From the interpretation and D']);
  }
  if (sb.status === 'ok' || sb.status === 'full') {
    rows.push(['Partial-penetration pseudo-skin s_pp', f2(sb.spp), sb.method]);
    if (sb.slant) rows.push([`Slant pseudo-skin s_theta (${sb.slant.thetaDeg.toFixed(1)} degrees from vertical)`, f2(sb.slant.sTheta), `${sb.slant.method}, from the MD and TVD of the perforations`]);
    rows.push([sb.mechanicalLabel, f2(sb.mechanicalSkin), sb.splitFormula || EMPTY_VALUE]);
    rows.push([`Net pay h (${L})`, shown('length', sb.h, system), 'Input']);
    rows.push([`Perforated length hp (${L})`, shown('length', sb.hp, system), sb.basis === 'TVD' ? 'True vertical depth' : 'Measured depth']);
    rows.push([`Top of pay to top of perforations h1 (${L})`, shown('length', sb.h1, system), sb.h1Assumed ? 'Assumed 0' : (sb.basis === 'TVD' ? 'True vertical depth' : 'Measured depth')]);
    rows.push(['kv/kh', plain(sb.kvkh), sb.kvkhDefaulted ? DEFAULT_KVKH_SOURCE : 'Entered']);
  } else {
    rows.push(['Partial-penetration pseudo-skin s_pp', EMPTY_VALUE, 'Not computed']);
    rows.push([sb.mechanicalLabel, EMPTY_VALUE, 'Not computed']);
  }
  return rows;
}

// ---- the inputs table -------------------------------------------------------

/**
 * Every value the analysis used, with its unit and source.
 * @returns {Array<{key: string, label: string, value: string, unit: string, source: string}>}
 */
export function buildInputsTable({
  reservoirInputs, reservoirSpec, completion, inputMeta = {}, unitSystem = 'oilfield', pvtIntake = null,
}) {
  const r = reservoirInputs || {};
  const res = reservoirSpec?.reservoir || null;
  const isGas = (r.fluid === 'gas');
  const meta = (k) => inputMeta?.[k];
  const uL = (kind) => unitLabel(kind, unitSystem);
  const rows = [];
  const add = (key, label, kind, oilValue, source, unit = uL(kind)) => rows.push({
    key, label, value: shown(kind, num(oilValue), unitSystem), unit: unit || '', source,
  });
  const entered = (key, autoWhenBlank = null) => sourceText(meta(key), autoWhenBlank);

  add('h', 'Net pay h', 'length', r.h, entered('h'));
  add('phi', 'Porosity phi', 'fraction', r.phi, entered('phi'));
  add('rw', 'Wellbore radius rw', 'length', r.rw, entered('rw'));
  add('sw', 'Water saturation Sw', 'fraction', r.sw, Number.isFinite(num(r.sw)) ? entered('sw') : 'Not provided');

  // ct: one number, or the engine's sum with every term listed
  const ctInfo = reservoirSpec?.ctInfo;
  if (ctInfo?.mode === 'components' && ctInfo.breakdown) {
    const b = ctInfo.breakdown;
    add('ct', 'Total compressibility ct', 'compressibility', b.ct, sourceText(meta('ct'), `Computed: ${b.formula}`));
    for (const t of b.terms) {
      const detail = t.saturation == null
        ? 'Formation compressibility'
        : `${t.label.split(' ')[0]} ${plain(t.saturation)} x ${plain(fromOilfield('compressibility', t.compressibility, unitSystem))} ${uL('compressibility')}`;
      const src = t.key === 'gas' && b.cgFromCorrelation
        ? `${detail}; cg at pi from the gas correlation`
        : detail;
      add(`ct.${t.key}`, `  ${t.label}`, 'compressibility', t.product, src);
    }
  } else if (isGas && !(num(r.ct) > 0)) {
    add('ct', 'Total compressibility ct', 'compressibility', res?.ct, sourceText(meta('ct'), `Computed: gas compressibility at pi, ${res?.pvtSource?.compressibility || 'from the z table'}`));
  } else {
    add('ct', 'Total compressibility ct', 'compressibility', r.ct, `${entered('ct')} (entered as total)`);
  }

  if (isGas) {
    const pvtAuto = gasPvtSourceText(res?.pvtSource);
    const fromTable = res?.pvtSource?.kind === 'fluid-table';
    add('mu', 'Gas viscosity mu at pi', 'viscosity', res?.mu, sourceText(meta('mu'), pvtAuto || 'Not computed'));
    rows.push({ key: 'z', label: 'Gas z-factor at pi', value: plain(res?.pvt?.zOf ? res.pvt.zOf(res.pi) : NaN), unit: '', source: sourceText(null, pvtAuto || 'Not computed') });
    if (fromTable) {
      const gt = res.pvtSource;
      rows.push({
        key: 'gasTable', label: 'Gas PVT table', value: `${gt.rows} rows, ${shown('pressureAbs', gt.pMin, unitSystem)} to ${shown('pressureAbs', gt.pMax, unitSystem)}`, unit: uL('pressureAbs'),
        source: `pvt-1 block${gt.origin || ''}${gt.changedSince ? '; the source project was saved again since and now differs' : ''}`,
      });
    }
    add('gasGravity', 'Gas gravity', 'gasGravity', r.gasGravity, fromTable ? `${entered('gasGravity')}; not used by the table (recorded)` : entered('gasGravity'));
    add('temperature', 'Reservoir temperature', 'temperature', r.tempF, entered('temperature'));
  } else {
    // a value changed here after the handoff says so (RL11): the source the
    // handoff gave no longer describes it
    const INTAKE_VALUE = { mu: r.mu, B: r.B, apiGravity: r.apiGravity, gor: r.gor, gasGravity: r.solutionGasGravity, temperature: r.reservoirTempF };
    const intake = (key) => {
      const words = intakeSourceText(pvtIntake, key);
      const received = pvtIntake?.values?.[key];
      if (!words || received == null) return words;
      const now = num(INTAKE_VALUE[key]);
      const was = num(received);
      const same = Number.isFinite(now) && Number.isFinite(was) && Math.abs(now - was) <= 1e-9 * Math.max(1, Math.abs(was));
      return same ? words : editedAfterHandoffText(words, received);
    };
    add('mu', 'Oil viscosity mu_o', 'viscosity', r.mu, entered('mu', meta('mu')?.source ? null : intake('mu')));
    add('B', 'Oil formation volume factor Bo', 'fvf', r.B, entered('B', meta('B')?.source ? null : intake('B')));
    const optional = (key, label, kind, v) => add(key, label, kind, v, Number.isFinite(num(v)) ? entered(key, meta(key)?.source ? null : intake(key)) : 'Not provided');
    optional('apiGravity', 'API gravity', 'apiGravity', r.apiGravity);
    optional('gor', 'Solution GOR', 'gor', r.gor);
    optional('gasGravity', 'Gas gravity', 'gasGravity', r.solutionGasGravity);
    optional('temperature', 'Reservoir temperature', 'temperature', r.reservoirTempF);
  }
  add('pi', 'Initial pressure pi', 'pressureAbs', r.pi, entered('pi'));
  add('q', isGas ? 'Gas rate q' : 'Oil rate q', isGas ? 'gasRate' : 'oilRate', r.q, 'Entered (test rate)');

  const kvGiven = r.kvkh != null && String(r.kvkh).trim() !== '';
  rows.push({
    key: 'kvkh', label: 'kv/kh', value: plain(kvGiven ? num(r.kvkh) : DEFAULT_KVKH), unit: '',
    source: kvGiven ? entered('kvkh') : sourceText(meta('kvkh'), DEFAULT_KVKH_SOURCE),
  });

  const comp = buildCompletion(completion);
  const L = uL('length');
  rows.push({ key: 'perfMd', label: 'Perforated interval, MD', value: interval('length', comp.md.top, comp.md.base, unitSystem), unit: L, source: Number.isFinite(comp.md.top) ? 'Entered' : 'Not provided' });
  rows.push({ key: 'perfTvd', label: 'Perforated interval, TVD', value: interval('length', comp.tvd.top, comp.tvd.base, unitSystem), unit: L, source: Number.isFinite(comp.tvd.top) ? (comp.tvdSource || 'Entered') : 'Not provided' });
  rows.push({ key: 'hp', label: 'Perforated length hp', value: comp.status === 'ok' ? shown('length', comp.hp, unitSystem) : EMPTY_VALUE, unit: L, source: comp.status === 'ok' ? `From the ${comp.basis} interval` : 'Not provided' });
  return rows;
}

/** One sentence under the inputs table saying which inputs the analysis used. */
export function inputsFootnote(isGas, pvtSource = null) {
  if (isGas && pvtSource?.kind === 'fluid-table') {
    return 'The gas analysis uses h, phi, rw, ct, temperature, pi and q, with z and viscosity interpolated in the Fluid Systems Studio table. Sw and gas gravity are recorded for the report.';
  }
  return isGas
    ? 'The gas analysis uses h, phi, rw, ct, gas gravity and temperature (viscosity and z from the correlation), pi and q. Sw is recorded for the report.'
    : 'The oil analysis uses h, phi, rw, ct, mu_o, Bo, pi and q. Sw, API gravity, GOR, gas gravity and temperature are recorded for the report and do not enter the calculation unless ct is built from its components.';
}

// ---- flow and shut-in summary -----------------------------------------------

const PERIOD_LABELS = { flow: 'Flow', 'shut-in': 'Shut-in', injection: 'Injection' };
export const periodKey = (start) => String(Number.isFinite(start) ? Number(start.toPrecision(10)) : start);

/**
 * One row per period: start, duration, choke, rate, volume produced in the
 * period and the running total (engine), plus the recovered volume and
 * remark the user added. With no rate history the periods come from the
 * test setup (rate q for tp, then the shut-in), and the table says so.
 */
export function buildFlowSummary({ rateRows = [], config, reservoir, prepared, periodMeta = {}, unitSystem = 'oilfield' }) {
  const isGas = reservoir?.fluid === 'gas';
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  const volKind = isGas ? 'gasVolume' : 'oilVolume';
  const pts = prepared?.points || [];
  const lastElapsed = pts.length ? pts[pts.length - 1].time : NaN;
  const entered = (rateRows || [])
    .map((row) => ({ t: num(row.t), q: num(row.q) }))
    .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.q) && row.t >= 0);
  let history = entered;
  let derived = false;
  let endTime = null;
  const isBuildup = config?.family === 'buildup';
  if (!history.length) {
    if (!config || !reservoir || !(reservoir.q > 0)) {
      return { rows: [], derived: false, empty: true, note: 'No rate history and no test setup to build the periods from.', rateKind, volKind, totalVolume: NaN };
    }
    derived = true;
    history = isBuildup ? [{ t: 0, q: reservoir.q }, { t: config.tp, q: 0 }] : [{ t: 0, q: reservoir.q }];
    if (Number.isFinite(lastElapsed)) endTime = isBuildup ? config.tp + lastElapsed : lastElapsed;
  } else {
    const last = [...history].sort((a, b) => a.t - b.t).pop();
    // the gauge record ends the last period when that period is the one analysed
    if (Number.isFinite(lastElapsed)) {
      if (isBuildup && last.q === 0) endTime = last.t + lastElapsed;
      else if (!isBuildup && last.q !== 0) endTime = Math.max(lastElapsed, last.t);
    }
  }
  const summary = summarizeFlowPeriods({ history, endTime });
  const f = (kind, v, digits = 1) => (Number.isFinite(v) ? fromOilfield(kind, v, unitSystem).toFixed(digits) : EMPTY_VALUE);
  const rows = summary.periods.map((p) => {
    const m = periodMeta?.[periodKey(p.start)] || {};
    const type = config?.mirror && p.type === 'flow' ? 'injection' : p.type;
    return {
      key: periodKey(p.start),
      index: p.index,
      type,
      typeLabel: PERIOD_LABELS[type] || type,
      start: Number.isFinite(p.start) ? plain(p.start) : EMPTY_VALUE,
      duration: Number.isFinite(p.duration) ? plain(p.duration) : EMPTY_VALUE,
      choke: Number.isFinite(num(m.choke)) ? plain(fromOilfield('choke', num(m.choke), unitSystem)) : EMPTY_VALUE,
      rate: f(rateKind, Math.abs(p.rate), 1),
      volume: p.type === 'shut-in' ? (Number.isFinite(p.duration) ? '0' : EMPTY_VALUE) : f(volKind, p.volume, 1),
      cumulative: f(volKind, p.cumulative, 1),
      recovered: Number.isFinite(num(m.recovered)) ? plain(fromOilfield('liquidVolume', num(m.recovered), unitSystem)) : EMPTY_VALUE,
      remark: text(m.remark),
      raw: p,
    };
  });
  // WTA-U1-008: the analysis reads the test rate q (and tp); an entered rate
  // history that says otherwise is stated, never silently reconciled
  const mismatch = [];
  if (!derived && reservoir?.q > 0) {
    const sorted = [...history].sort((a, b) => a.t - b.t);
    const shutIn = isBuildup ? sorted.find((r) => r.q === 0 && r.t > 0) : null;
    const flowing = sorted.filter((r) => r.q !== 0 && (!shutIn || r.t < shutIn.t));
    const qHist = flowing.length ? Math.abs(flowing[flowing.length - 1].q) : NaN;
    const show = (v) => `${plain(fromOilfield(rateKind, v, unitSystem))} ${unitLabel(rateKind, unitSystem)}`;
    if (Number.isFinite(qHist) && Math.abs(qHist - reservoir.q) > 0.005 * reservoir.q) {
      mismatch.push(`The test rate q (${show(reservoir.q)}) differs from the last rate of the rate history (${show(qHist)}); the analysis uses q.`);
    }
    if (isBuildup && shutIn && Number.isFinite(config?.tp) && Math.abs(shutIn.t - config.tp) > 0.005 * Math.max(config.tp, 1e-9)) {
      mismatch.push(`The producing time tp (${plain(config.tp)} hr) differs from the shut-in time of the rate history (${plain(shutIn.t)} hr); the analysis uses tp.`);
    }
  }
  return {
    rows,
    derived,
    mismatch,
    empty: rows.length === 0,
    note: (derived
      ? `No rate history was entered: the periods are taken from the test setup (${isBuildup ? 'rate q for the producing time tp, then the shut-in' : 'rate q over the gauge record'}).`
      : 'Periods from the entered rate history.') + (mismatch.length ? ` ${mismatch.join(' ')}` : ''),
    rateKind,
    volKind,
    totalVolume: summary.totalVolume,
  };
}

/** Column heads of the flow summary in the display system. */
export function flowSummaryHead(fs, unitSystem = 'oilfield') {
  const uL = (kind) => unitLabel(kind, unitSystem);
  return [
    'Period', 'Type', 'Start (hr)', 'Duration (hr)', `Choke (${uL('choke')})`,
    `Rate (${uL(fs.rateKind)})`, `Volume (${uL(fs.volKind)})`, `Cumulative (${uL(fs.volKind)})`,
    `Recovered (${uL('liquidVolume')})`, 'Remark',
  ];
}

export const flowSummaryBody = (fs) => fs.rows.map((r) => [
  String(r.index), r.typeLabel, r.start, r.duration, r.choke, r.rate, r.volume, r.cumulative, r.recovered, r.remark || EMPTY_VALUE,
]);

// ---- identification block ---------------------------------------------------

/** [label, value] pairs of the well and test identification. */
export function buildIdentificationRows({
  projectName, wellName, fieldName, analyst, identification, completion, config, unitSystem = 'oilfield',
  organizationName = '', build = '',
}) {
  const comp = buildCompletion(completion);
  const L = unitLabel('length', unitSystem);
  const withUnit = (v) => (v === EMPTY_VALUE ? v : `${v} ${L}`);
  return [
    ['Project', text(projectName) || 'Untitled interpretation'],
    ['Well', orNA(wellName)],
    ['Field', orNA(fieldName)],
    // WTA-U1-004 (RL4): who the work is for, typed or the organisation's name
    ['Company', text(identification?.company) || orNA(organizationName)],
    ['Licence', orNA(identification?.licence)],
    ['Zone or sand', orNA(identification?.zone)],
    ['Analyst', orNA(analyst)],
    ['Test type', testTypeText(config, identification)],
    ['Test dates', testDatesText(identification)],
    ['Perforations, MD', withUnit(interval('length', comp.md.top, comp.md.base, unitSystem))],
    ['Perforations, TVD', withUnit(interval('length', comp.tvd.top, comp.tvd.base, unitSystem))],
    // WTA-U1-004 (RL4): the software that produced the numbers
    ['Software build', orNA(build)],
  ];
}

// ---- gauge, datum and pressure basis (WTA-U1-005, RL7) ----------------------

/** How the gauge pressures became absolute, in words, from what the import recorded. */
export function absoluteBasisText(gaugeImport) {
  if (!gaugeImport) return 'Not recorded with this project (data entered or saved before 2026-10-04). The analysis treats every pressure as absolute.';
  if (gaugeImport.sample) return 'Absolute: the synthetic sample test.';
  const u = PRESSURE_UNITS[gaugeImport.pressureUnit];
  if (!u) return 'Not recorded with this project. The analysis treats every pressure as absolute.';
  if (!u.gauge) return `Absolute: the file was read in ${u.label}.`;
  const atm = gaugeImport.pressureUnit === 'psig' ? '14.696 psi' : gaugeImport.pressureUnit === 'kpag' ? '101.325 kPa' : gaugeImport.pressureUnit === 'barg' ? '1.01325 bar' : '0.101325 MPa';
  return `Converted: the file was read in ${gaugeImport.pressureUnit === 'psig' ? 'psig' : u.label}; one standard atmosphere (${atm}) was added to each reading. A local barometric pressure was not applied.`;
}

/**
 * The rows a reviewer reads before trusting any pressure in the report:
 * where the gauge sat, which datum the field reports pressures at, that no
 * correction to that datum was applied, and whether the readings were
 * gauge or absolute. [label, value].
 */
export function buildPressureBasisRows({ completion, gaugeImport, unitSystem = 'oilfield', datum = null, pStar = NaN, pwfShutIn = NaN }) {
  const c = completion || {};
  const L = unitLabel('length', unitSystem);
  const P = unitLabel('pressure', unitSystem);
  const len = (v) => (Number.isFinite(num(v)) ? `${shown('length', num(v), unitSystem)} ${L}` : null);
  const md = len(c.gaugeDepthMd);
  const tvd = len(c.gaugeDepthTvd);
  const corr = datum || completionDatumCorrection(c);
  const gauge = [md ? `${md} MD` : null, tvd ? `${tvd} TVD` : null, corr.ok ? `${shown('length', corr.gaugeTvdss, unitSystem)} ${L} TVDSS` : null].filter(Boolean).join(', ');
  const datumDepth = len(c.datumDepthTvdss);
  const elev = len(c.depthRefElev);
  const grad = num(c.datumGradient);
  const gradText = Number.isFinite(grad)
    ? `${plain(fromOilfield('pressureGradient', grad, unitSystem))} ${unitLabel('pressureGradient', unitSystem)}, ${text(c.datumGradientSource) || 'source not stated'}`
    : 'None stated (no correction is applied unless a gradient is stated)';
  const sign = (v) => `${v >= 0 ? '+' : ''}${plain(fromOilfield('pressure', v, unitSystem))} ${P}`;
  const rows = [
    ['Gauge depth', gauge || EMPTY_VALUE],
    ['Pressure datum', datumDepth ? `${datumDepth} TVDSS` : 'Not stated'],
  ];
  if (elev) rows.push(['Depth reference elevation above the datum', elev]);
  rows.push(['Gradient, gauge to datum', gradText]);
  if (corr.ok) {
    rows.push(['Correction to the datum', `${sign(corr.correction)} (${plain(fromOilfield('pressureGradient', grad, unitSystem))} ${unitLabel('pressureGradient', unitSystem)} over ${plain(fromOilfield('length', corr.dz, unitSystem))} ${L}), added to the pressures given at the datum below; the analysis itself runs at the gauge depth`]);
    if (Number.isFinite(pStar)) rows.push([`p* at the datum (${P})`, plain(fromOilfield('pressure', corr.apply(pStar), unitSystem))]);
    if (Number.isFinite(pwfShutIn)) rows.push([`Pressure at shut-in at the datum (${P})`, plain(fromOilfield('pressure', corr.apply(pwfShutIn), unitSystem))]);
  } else {
    rows.push(['Correction to the datum', Number.isFinite(grad) ? `None applied: ${corr.reason.replace(/^./, (x) => x.toLowerCase())}` : 'None applied: every pressure in this report is at the gauge depth']);
  }
  rows.push(['Absolute or gauge', absoluteBasisText(gaugeImport)]);
  if (gaugeImport && !gaugeImport.sample && gaugeImport.fileName) {
    const tu = TIME_UNITS[gaugeImport.timeUnit]?.label;
    rows.push(['Gauge file', `${gaugeImport.fileName}: ${gaugeImport.count ?? EMPTY_VALUE} readings read${gaugeImport.skipped ? `, ${gaugeImport.skipped} rows skipped as not numbers` : ''}${tu ? `; time in ${tu}` : ''}${gaugeImport.dateOrder ? `, dates ${gaugeImport.dateOrder === 'dmy' ? 'day first' : 'month first'}` : ''}`]);
  }
  return rows;
}

// ---- gauge readings used and left out (WTA-U1-006, RL5) ---------------------

const SPIKE_LIST_MAX = 20;

/**
 * Every gauge reading, used or left out of the analysis series, with the
 * reason. Built from prepareTestData's `exclusions`; the counts close on
 * the readings in the record.
 * @returns {{rows: Array<[string, string, string]>, spikes: Array<[string, string]>, spikeNote: ?string}}
 */
export function buildDataUseRows({ prepared, unitSystem = 'oilfield' }) {
  const ex = prepared?.exclusions;
  if (!ex) return { rows: [], spikes: [], spikeNote: null };
  const buildup = ex.family === 'buildup';
  const P = unitLabel('pressure', unitSystem);
  const rows = [['Readings in the gauge record', String(ex.total), 'As loaded']];
  if (ex.unreadable) rows.push(['Without a time or a pressure', String(ex.unreadable), 'Left out: not readable as numbers']);
  if (ex.before.count) {
    const what = buildup ? (ex.mirror ? 'Before the shut-in of the injector' : 'Before the shut-in') : 'Before the start of flow';
    rows.push([`${what} (gauge clock ${gaugeTime(ex.before.from)} to ${gaugeTime(ex.before.to)} hr)`, String(ex.before.count), 'Left out: the preceding flow period (drawn on the history match)']);
  }
  if (ex.atShutIn) rows.push([buildup ? 'At the shut-in instant (dt = 0)' : 'At the start of flow (t = 0)', String(ex.atShutIn), buildup ? 'Used as the pressure at shut-in only; dt = 0 has no place on a log axis' : 'Left out: t = 0 has no place on a log axis']);
  if (ex.spikeThreshold != null) {
    rows.push(['Spike filter', String(ex.spikes.length), ex.spikes.length
      ? `Left out: more than ${plain(ex.spikeThreshold)} robust standard deviations from the five-point median`
      : `None removed (threshold ${plain(ex.spikeThreshold)} robust standard deviations)`]);
  } else {
    rows.push(['Spike filter', EMPTY_VALUE, 'Off: no reading was tested']);
  }
  if (ex.thinned) rows.push(['Thinned on the log time axis', String(ex.thinned), `Left out: ${ex.pointsPerDecade} points per log cycle are kept`]);
  if (ex.notAboveBase) {
    rows.push([buildup ? 'No pressure change from the shut-in' : (ex.mirror ? 'Below the initial pressure' : 'Above the initial pressure'), String(ex.notAboveBase),
      buildup ? 'Left out: the change from the pressure at shut-in is zero or negative' : 'Left out: on the wrong side of the initial pressure']);
  }
  rows.push(['Analysis points', String(prepared.points.length), 'Used']);
  const spikes = ex.spikes.slice(0, SPIKE_LIST_MAX).map((r) => [plain(r.t), plain(fromOilfield('pressure', r.p, unitSystem))]);
  const spikeNote = ex.spikes.length > SPIKE_LIST_MAX ? `The first ${SPIKE_LIST_MAX} of ${ex.spikes.length} are listed.` : null;
  return { rows, spikes, spikeNote, spikeHead: [buildup ? 'Shut-in time dt (hr)' : 'Elapsed time (hr)', `Pressure (${P})`] };
}

// ---- the method and its limits (WTA-U1-007, RL9) -----------------------------

const r2 = (v) => (Number.isFinite(v) ? String(parseFloat(v.toPrecision(3))) : EMPTY_VALUE);

/**
 * The gas z-factor at this test against the window its method was checked
 * over (the Standing-Katz chart readings of engines/fluid). Sutton
 * pseudo-criticals from the engine, never restated.
 */
export function gasRangeCheck({ reservoir, pressures = [] }) {
  if (reservoir?.fluid !== 'gas') return null;
  // WTA-U2-001: a Fluid table holds its own span; the test is checked against it
  if (reservoir.pvtSource?.kind === 'fluid-table') {
    const src = reservoir.pvtSource;
    const ps = [reservoir.pi, ...pressures].filter((p) => Number.isFinite(p) && p > 0);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const inside = lo >= src.pMin && hi <= src.pMax;
    const flags = src.rangeFlags?.length ? ` The block flags: ${src.rangeFlags.join(' ')}` : '';
    const temp = Number.isFinite(src.temperatureF) && Number.isFinite(reservoir.tempR) && Math.abs(src.temperatureF - (reservoir.tempR - 460)) > 0.5
      ? ` The table was built at ${plain(src.temperatureF)} degF and the test temperature is ${plain(reservoir.tempR - 460)} degF.`
      : '';
    return {
      method: 'fluid-table', label: 'Fluid Systems Studio table', inside,
      text: `z and viscosity from the Fluid Systems Studio table (${src.zMethod}; ${src.muMethod}), ${plain(src.pMin)} to ${plain(src.pMax)} psia. The test spans ${plain(lo)} to ${plain(hi)} psia, ${inside ? 'inside the table' : 'OUTSIDE the table: m(p) is extrapolated on the end segment'}.${temp}${flags}`,
    };
  }
  const method = reservoir.zMethod || 'papay';
  const { ppc, tpc } = suttonPseudoCriticals(reservoir.gasGravity);
  const tempF = reservoir.tempR - 460;
  const tpr = (tempF + 459.67) / tpc;
  const ps = [reservoir.pi, ...pressures].filter((p) => Number.isFinite(p) && p > 0);
  const pprMin = Math.min(...ps) / ppc;
  const pprMax = Math.max(...ps) / ppc;
  const w = GAS_Z_METHODS[method];
  if (!w) {
    return { method, label: 'Papay', tpr, pprMin, pprMax, inside: null,
      text: `Papay z-factor: Tpr ${r2(tpr)} and ppr ${r2(pprMin)} to ${r2(pprMax)} at this test. No checked range is held for Papay in the Suite; it is kept for projects interpreted with it.` };
  }
  const inside = tpr >= w.chartTpr[0] && tpr <= w.chartTpr[1] && pprMin >= w.chartPpr[0] && pprMax <= w.chartPpr[1];
  const win = `Tpr ${w.chartTpr[0]} to ${w.chartTpr[1]}, ppr ${w.chartPpr[0]} to ${w.chartPpr[1]}`;
  return {
    method, label: w.label, tpr, pprMin, pprMax, inside,
    text: `${w.label} z-factor: Tpr ${r2(tpr)} and ppr ${r2(pprMin)} to ${r2(pprMax)} at this test, ${inside
      ? `inside the window it was checked over against the Standing-Katz chart (${win}; largest departure ${(w.chartError * 100).toFixed(2)} percent)`
      : `OUTSIDE the window it was checked over against the Standing-Katz chart (${win}). ${w.nearCritical}`}.`,
  };
}

/** The pressures statement of the limits table (WTA-U2-004). */
export function datumLimitText(datum) {
  if (datum?.ok) return 'Analysed at the gauge depth. p* and the pressure at shut-in are also given at the datum with the one stated gradient (a static column of one fluid between the depths; no friction or temperature correction). No gravity or friction correction between gauge and sandface.';
  return 'Analysed and reported at the gauge depth; no correction to a datum and no gravity or friction correction between gauge and sandface.';
}

/** The wellbore storage statement of the limits table (WTA-U2-002). */
export function wellboreLimitText(model) {
  if (model?.wellboreModel === 'hegeman' || model?.wellboreModel === 'fair') {
    return `${model.wellboreModel === 'hegeman' ? 'Changing wellbore storage, Hegeman, Hallford and Joseph (1993), error-function transition' : 'Changing wellbore storage, Fair (1981), exponential transition'}: C is the final storage, Ci/C the ratio of the initial apparent storage to it, alpha the time of the change. The change starts with each rate period, so in a buildup it acts on the shut-in. Checked against an independent real-time solution of the wellbore balance, not against the published type curves.`;
  }
  return 'Constant wellbore storage. A storage change (phase redistribution, a closing valve) can be matched with the Hegeman or Fair model on the Match tab.';
}

/**
 * The storage of a changing-storage match in the display system: Ci and
 * the dimensionless C_phiD and alpha_D from the engine's own mapping.
 * @returns {Array<[string, string]>} [] for constant storage
 */
export function changingStorageRows({ model, params, reservoir, groups, unitSystem = 'oilfield' }) {
  if (!model?.wellboreModel || model.wellboreModel === 'constant' || !params || !reservoir || !groups || typeof model.toDimless !== 'function') return [];
  const d = model.toDimless(params, groups);
  const S = unitLabel('storage', unitSystem);
  return [
    [`Initial storage Ci (${S})`, plain(fromOilfield('storage', params.C * params.ciOverC, unitSystem))],
    [`Final storage C (${S})`, plain(fromOilfield('storage', params.C, unitSystem))],
    ['C_phiD (phase redistribution, dimensionless)', plain(d.cphiD)],
    ['alpha_D (dimensionless)', plain(d.alphaD)],
  ];
}

/**
 * What the interpretation assumes, and where its methods stop, as
 * [topic, statement] rows. The gas row carries the reduced state of the
 * test against its z method's window.
 */
export function buildLimitsRows({ reservoir, config, model, prepared, datum = null }) {
  const gas = reservoir?.fluid === 'gas';
  const rows = [
    ['Fluid', gas
      ? 'Single-phase real gas in pseudo-pressure m(p); dimensionless time at the initial mu ct unless pseudo-time is chosen. The skin is the apparent skin s\', which includes any rate-dependent skin; separating it needs tests at more than one rate.'
      : 'Single-phase flow of a slightly compressible liquid with constant viscosity, formation volume factor and total compressibility. Gas coming out of solution near the well is not modelled.'],
    ['Wellbore storage', wellboreLimitText(model)],
    ['Well geometry', `${model?.label ? `${model.label} model. ` : ''}A vertical well open over the net pay unless the horizontal model is chosen. Partial penetration enters as a pseudo-skin only (Papatzacos 1987): there is no limited-entry (spherical flow) model. A deviated interval (MD longer than TVD) enters as the Cinco-Ley et al. (1975) slant pseudo-skin, split off the total skin; the flow model stays that of a vertical well.`],
    ['Time basis', config?.family === 'buildup'
      ? 'Buildup on Agarwal equivalent time with the producing time tp, or on superposition of the rate history when one is entered.'
      : 'Drawdown on elapsed time from the start of flow; a rate history with more than one rate is analysed by superposition (Odeh-Jones).'],
    ['Pressures', datumLimitText(datum)],
  ];
  const range = gasRangeCheck({ reservoir, pressures: (prepared?.points || []).map((p) => p.p) });
  if (range) rows.push([range.method === 'fluid-table' ? 'Gas PVT table range' : 'Gas z-factor range', range.text]);
  return rows;
}

// ---- deliverability coefficient units (WTA-U1-014, RL7) ----------------------

/**
 * Units of the deliverability coefficients. C carries the exponent n, so it
 * stays on the oilfield basis it was fitted on in both systems, and says so.
 */
export function deliverabilityUnits(method, n) {
  const pp = method === 'pseudo-pressure';
  const dp = pp ? 'psi2/cp' : 'psia2';
  const nn = Number.isFinite(n) ? String(parseFloat(n.toFixed(2))) : 'n';
  return {
    C: `Mscf/D per (${dp})^${nn}`,
    a: `${dp} per Mscf/D`,
    b: `${dp} per (Mscf/D)2`,
    basis: `Coefficients on the oilfield basis they were fitted on (q in Mscf/D, ${pp ? 'pseudo-pressure in psi2/cp' : 'pressures in psia, squared'}), in either display system.`,
  };
}
