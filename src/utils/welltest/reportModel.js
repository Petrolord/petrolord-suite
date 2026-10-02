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
  INPUT_SOURCES, sourceText, assumedDefaultText, pvtIntake as intakeFromHandoff, intakeSourceText,
} from '@/lib/inputProvenance';
import { unitLabel, fromOilfield } from './units.js';
import { partialPenetrationSkin } from './partialPenetration.js';
import { totalCompressibility } from './compressibility.js';
import { summarizeFlowPeriods } from './flowSummary.js';

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
});

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
  if (source.kind === 'table') return 'Supplied PVT table';
  const parts = [`${source.z} z-factor`, `${source.viscosity} viscosity`];
  if (source.pseudoCriticals) parts.push(`${source.pseudoCriticals} pseudo-criticals`);
  return `Correlation: ${parts.join(', ')} (computed by the studio)`;
}

// What this studio takes from the fluid backbone (the PVT provenance
// contract, lib/inputProvenance/pvtContract), in the order it is applied.
const WELLTEST_PVT_FIELDS = Object.freeze([
  { property: 'bo_at_pb', key: 'B', label: 'Bo' },
  { property: 'mu_o_at_pb', key: 'mu', label: 'viscosity' },
  { property: 'oil_gravity', key: 'apiGravity', label: 'API gravity' },
  { property: 'rsb', key: 'gor', label: 'solution GOR' },
  { property: 'gas_gravity', key: 'gasGravity', storeKey: 'solutionGasGravity', label: 'gas gravity' },
  { property: 'inlet_temperature', key: 'temperature', storeKey: 'reservoirTempF', label: 'temperature' },
]);

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
  return out && { patch: out.patch, applied: out.applied, intake: out.intake };
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
  return { status: 'ok', basis, hp: d.base - d.top, h1: h1Assumed ? 0 : d.top - d.payTop, h1Assumed, ...shared };
}

/**
 * Total skin split into the partial-penetration pseudo-skin and the
 * mechanical (damage) skin, through the engine.
 * status: 'not-entered' (no interval: the total stands alone),
 *   'refused' (the engine would not compute, with its reason),
 *   'full' (the whole pay is open), 'ok'.
 */
export function buildSkinBreakdown({ totalSkin, reservoir, completion, kvkhInput, isGas = false }) {
  const comp = buildCompletion(completion);
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
    mechanicalLabel: isGas ? 'Mechanical and rate-dependent skin' : 'Mechanical (damage) skin s_d',
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
  const named = {
    ...base, spp: out.spp, hpD: out.hpD, h1D: out.h1D, rD: out.rD,
    method: out.method, formula: out.formula, reference: out.reference,
    splitFormula: out.split?.formula || null, splitReference: out.split?.reference || null,
    mechanicalSkin: out.split?.ok ? out.split.mechanicalSkin : NaN,
  };
  const notes = [];
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
  if (sb.status === 'ok' || sb.status === 'full') {
    rows.push(['Partial-penetration pseudo-skin s_pp', f2(sb.spp), sb.method]);
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
    add('mu', 'Gas viscosity mu at pi', 'viscosity', res?.mu, sourceText(meta('mu'), pvtAuto || 'Not computed'));
    rows.push({ key: 'z', label: 'Gas z-factor at pi', value: plain(res?.pvt?.zOf ? res.pvt.zOf(res.pi) : NaN), unit: '', source: sourceText(null, pvtAuto || 'Not computed') });
    add('gasGravity', 'Gas gravity', 'gasGravity', r.gasGravity, entered('gasGravity'));
    add('temperature', 'Reservoir temperature', 'temperature', r.tempF, entered('temperature'));
  } else {
    const intake = (key) => intakeSourceText(pvtIntake, key);
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
export function inputsFootnote(isGas) {
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
  return {
    rows,
    derived,
    empty: rows.length === 0,
    note: derived
      ? `No rate history was entered: the periods are taken from the test setup (${isBuildup ? 'rate q for the producing time tp, then the shut-in' : 'rate q over the gauge record'}).`
      : 'Periods from the entered rate history.',
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
}) {
  const comp = buildCompletion(completion);
  const L = unitLabel('length', unitSystem);
  const withUnit = (v) => (v === EMPTY_VALUE ? v : `${v} ${L}`);
  return [
    ['Project', text(projectName) || 'Untitled interpretation'],
    ['Well', orNA(wellName)],
    ['Field', orNA(fieldName)],
    ['Licence', orNA(identification?.licence)],
    ['Zone or sand', orNA(identification?.zone)],
    ['Analyst', orNA(analyst)],
    ['Test type', testTypeText(config, identification)],
    ['Test dates', testDatesText(identification)],
    ['Perforations, MD', withUnit(interval('length', comp.md.top, comp.md.base, unitSystem))],
    ['Perforations, TVD', withUnit(interval('length', comp.tvd.top, comp.tvd.base, unitSystem))],
  ];
}
