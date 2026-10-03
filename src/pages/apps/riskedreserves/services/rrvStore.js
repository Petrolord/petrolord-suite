// Risked Reserves Valuation store (T1 rebuild, 2026-09-26; saved valuations
// and handoff provenance, upgrade U1, 2026-10-02). Prospects come from the
// ReservoirCalc Pro inventory (rcp_prospects: name, Pg from the geologist's
// risking, success-case P90 / P50 / P10) or are typed here. The economic
// inputs (MEFS, value per barrel, development and well cost) are this
// app's own.
//
// One valuation is one prospect as this app holds it: the inputs in ONE
// unit system (MMboe, $/boe, $MM), what ReservoirCalc Pro handed over (the
// `handoff` block: source record, time, unit, basis, percentile convention,
// the values as received), who analysed it (`ident`), where each of this
// app's own inputs came from (`inputMeta`) and which inputs the user has
// touched. It is saved as one row of rrv_valuations per prospect and user
// (services/rrvBackend.js) and kept in the browser as the fallback.
// Pure mapping plus localStorage.

import { toMMboe, VOLUME_UNITS } from '@/pages/apps/ReservoirCalcPro/services/prospectVolumes';
import { registerStateKind } from '@/lib/stateVersion';
import { ECON_MODEL_DEFAULTS, ECON_MODEL_KEYS, valueLine, modelProblem } from './rrvEconomics';

/** Browser key of the T1 build: a bare list of prospects. Read once, then left alone. */
export const RRV_KEY = 'rrv.prospects.v1';
/** Browser key of this build: { list: valuations }. The fallback store and the unsaved-edit draft. */
export const RRV_STORE_KEY = 'rrv.valuations.v2';

export const RRV_KIND = 'rrv-valuation';
registerStateKind(RRV_KIND, { current: 1, label: 'valuation' });

/**
 * The Step 1 starting economics. Since U2-002 a new prospect starts on the
 * economic model instead (its MEFS and value line are derived); these stay
 * as the well cost default and as the mark of a valuation that an earlier
 * build left on its untouched defaults.
 */
export const DEFAULT_ECONOMICS = Object.freeze({ mefs: 10, unitValue: 8, devCost: 100, wellCost: 25 });
/**
 * Where the economics of a valuation come from (U2-002, U2-001), kept in
 * the valuation's `econ` block:
 *   value  'model'    u and D are the value line of the stated economic model
 *          'epe'      u and D came from a Petroleum Economics Studio case
 *          'entered'  u and D are typed here, or were sent with the prospect
 *   mefs   'derived'  the size at which the value of a discovery is zero
 *          'typed'    typed here
 */
export const VALUE_BASES = Object.freeze(['model', 'epe', 'entered']);
export const MEFS_BASES = Object.freeze(['derived', 'typed']);
export const ECON_KEYS = Object.freeze(['mefs', 'unitValue', 'devCost', 'wellCost']);
export const VOLUME_KEYS = Object.freeze(['p90', 'p50', 'p10']);
/** Every input the valuation engine reads (RL1: each has a row in the report). */
export const INPUT_KEYS = Object.freeze(['pg', ...VOLUME_KEYS, ...ECON_KEYS]);
/** The inputs ReservoirCalc Pro can hand over. */
export const HANDOFF_KEYS = Object.freeze(['pg', 'p90', 'p50', 'p10', 'unitValue', 'devCost']);
export const FACTOR_KEYS = Object.freeze(['trap', 'reservoir', 'charge', 'seal', 'other']);
export const IDENT_KEYS = Object.freeze(['company', 'licence', 'play', 'analyst']);

export const PERCENTILE_CONVENTION = 'P90 is the low case and P10 the high case: the volume exceeded with 90 and 10 percent probability (exceedance convention, SPE PRMS)';
export const BOE_BASIS = '6 Mscf per boe';

const isNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
const blank = (v) => v === '' || v === null || v === undefined;

// ---- the upstream record ----------------------------------------------------

// key order and undefined keys must not matter: a row read back from the
// database has neither
const stable = (v) => {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

/**
 * A fingerprint of what a ReservoirCalc Pro prospect row SAYS (name, chance
 * factors, volumes, risked figures). Sharing the row or stamping it does
 * not change it; re-risking does. FNV-1a over a key-sorted rendering.
 */
export function rcpFingerprint(row) {
  const text = stable({ name: row?.name ?? null, pg_factors: row?.pg_factors || {}, inputs: row?.inputs || {}, risked: row?.risked || {} });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** A ReservoirCalc Pro inventory row as a valuation prospect. */
export function fromRcpProspect(row, { now = new Date() } = {}) {
  const r = row.risked || {};
  const sc = { ...(row.inputs || {}), ...(r.success || r.success_case || r.successCase || {}) };
  // volumes arrive in the unit the row states (MMSTB, Bscf, MMsm3, Bsm3) and
  // are valued as MMboe. Rows saved before units were stated carry either
  // MMSTB or raw STB; anything above 100,000 is read as STB.
  const unit = row.inputs?.unit;
  const rawBig = !unit && [sc.mean, sc.p50, sc.p10].some((v) => Number(v) > 1e5);
  const num = (v) => {
    if (!(Number.isFinite(Number(v)) && v !== null && v !== '')) return '';
    const x = rawBig ? Number(v) / 1e6 : toMMboe(Number(v), unit || 'MMbbl');
    return Number(x.toPrecision(6));
  };
  // RCP-U1-004: Pg is a probability. It used to go through the volume
  // conversion above, so a gas prospect's Pg 0.30 arrived as 0.05 (divided
  // by 6 Mscf per boe), a metric one as 1.89 (refused) and a legacy STB row
  // as 0.0000003.
  const prob = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(Number(v).toPrecision(6)) : '');
  // Pg as risked in ReservoirCalc Pro; else the product of its factors
  const f = row.pg_factors || {};
  const fromFactors = ['trap', 'reservoir', 'charge', 'seal', 'other']
    .filter((k) => f[k] !== undefined && f[k] !== null)
    .reduce((acc, k) => acc * Math.min(1, Math.max(0, Number(f[k]))), 1);
  const pgAsRisked = prob(r.pg) !== '';
  const pg = pgAsRisked ? prob(r.pg) : (Object.keys(f).length ? fromFactors : '');
  const pgFactors = Object.fromEntries(FACTOR_KEYS.filter((k) => isNum(f[k])).map((k) => [k, Math.min(1, Math.max(0, Number(f[k])))]));
  const sentEcon = Number.isFinite(Number(row.inputs?.economics?.unitValue)) && Number(row.inputs.economics.unitValue) >= 0 && Number(row.inputs.economics.devCost) >= 0;
  const economics = sentEcon
    ? { unitValue: Number(Number(row.inputs.economics.unitValue).toPrecision(6)), devCost: Number(Number(row.inputs.economics.devCost).toPrecision(6)) }
    : {};
  const conversion = unit && unit !== 'MMbbl' && unit !== 'MMboe' ? `converted from ${unit} at 6 Mscf per boe` : (rawBig ? 'read as STB' : '');
  const p90 = num(sc.p90 ?? r.p90);
  const p50 = num(sc.p50 ?? r.p50);
  const p10 = num(sc.p10 ?? r.p10);
  return syncEconomics({
    id: `rcp-${row.id}`,
    source: 'rcp',
    rcpId: row.id,
    name: row.name,
    pg,
    p90,
    p50,
    p10,
    volumeNote: [
      conversion,
      // RCP-U1-003: rows saved before the basis was recorded carry the
      // in-place volume (STOIIP / GIIP); the valuation needs recoverable
      row.inputs?.basis === 'recoverable' ? ''
        : row.inputs?.basis === 'in-place' ? 'IN-PLACE volumes: enter recoverable volumes before valuing'
          : 'saved before the basis was recorded: these may be in-place volumes, check before valuing',
    ].filter(Boolean).join('; '),
    basis: row.inputs?.basis || null,
    // BF-U2-017: the charge factor's basin model, when one was handed over
    chargeNote: row.inputs?.bfCharge?.model
      ? `charge from the basin model ${row.inputs.bfCharge.model} (${Number(row.inputs.bfCharge.chargeMMboe).toPrecision(3)} MMboe to the trap; suggested ${row.inputs.bfCharge.suggestedFactor ?? 'none'}, used ${row.inputs.bfCharge.appliedFactor ?? f.charge ?? 'none'})`
      : '',
    ...DEFAULT_ECONOMICS,
    // RCP-U2-012: a prospect valued in ReservoirCalc Pro brings its value
    // per barrel and development cost (the Suite's screening NPV)
    ...(sentEcon
      ? { ...economics, economicsNote: 'value per barrel and development cost from ReservoirCalc Pro success-case economics',
        // H8: what ReservoirCalc Pro sent, so a later edit here can be told apart
        rcpUnitValue: economics.unitValue }
      : {}),
    // U1 (RL11, RL2): the chance factors behind Pg, and everything the
    // handoff said, kept with the valuation so the report can state it and
    // a later edit or a later change upstream can be told apart
    pgFactors: Object.keys(pgFactors).length ? pgFactors : null,
    handoff: {
      schema: 'rcp-prospect-1',
      app: 'ReservoirCalc Pro',
      table: 'rcp_prospects',
      recordId: row.id,
      recordName: row.name,
      recordUpdatedAt: row.updated_at || row.created_at || null,
      build: row.app_build || null,
      receivedAt: now.toISOString(),
      unit: unit || null,
      unitLabel: unit ? (VOLUME_UNITS[unit]?.label || unit) : null,
      basis: row.inputs?.basis || null,
      conversion: conversion || null,
      percentiles: PERCENTILE_CONVENTION,
      pgMethod: pgAsRisked ? 'as risked in ReservoirCalc Pro' : (Object.keys(f).length ? 'the product of the chance factors' : null),
      // canonical (MMboe, $/boe, $MM), as received: the baseline an edit is told from
      values: { pg, p90, p50, p10, mean: num(sc.mean ?? r.mean), ...economics },
      // as the row states them, in its own unit
      sent: { p90: sc.p90 ?? r.p90 ?? null, p50: sc.p50 ?? r.p50 ?? null, p10: sc.p10 ?? r.p10 ?? null, mean: sc.mean ?? r.mean ?? null },
      // ReservoirCalc Pro's own account of where the volumes came from
      // (project, reservoir, Monte Carlo run, in-place volumes, recovery factor)
      source: row.inputs?.source || null,
      charge: row.inputs?.bfCharge?.model ? {
        model: row.inputs.bfCharge.model, chargeMMboe: row.inputs.bfCharge.chargeMMboe ?? null,
        suggestedFactor: row.inputs.bfCharge.suggestedFactor ?? null, appliedFactor: row.inputs.bfCharge.appliedFactor ?? f.charge ?? null,
      } : null,
      economics: sentEcon ? { engine: row.inputs.economics.engine || null, npvMM: row.inputs.economics.npvMM ?? null, assumptions: row.inputs.economics.assumptions || null } : null,
      fingerprint: rcpFingerprint(row),
    },
    // U2-002: a prospect valued in ReservoirCalc Pro keeps the value per
    // barrel and development cost it was sent; any other starts on the
    // economic model. Either way the MEFS is derived from the same value.
    econ: sentEcon ? { value: 'entered', mefs: 'derived', model: { ...ECON_MODEL_DEFAULTS }, modelTouched: {} } : newEcon(),
    ident: { company: '', licence: '', play: '', analyst: '' },
    inputMeta: {},
    touched: {},
    notes: '',
  });
}

/**
 * Where a prospect's value per barrel came from, in words (H8). The true
 * answers: derived from the valuation's economic model, the Step 1 starting
 * default, a value sent with the prospect by ReservoirCalc Pro, or a value
 * typed on this screen. The Petroleum Economics Studio is named only when
 * a case was received from it and is still the value in use (U2-001).
 */
export function unitValueSource(p) {
  // U2-002: derived from the valuation's own economic model
  if (p?.econ?.value === 'model') return 'derived here from the economic model of this valuation (the canonical screening NPV, read between the MEFS and the mean commercial size)';
  const value = Number(p?.unitValue);
  // U2-001: named only when a case was received and is still the value in use
  const epe = p?.econ?.epe;
  if (p?.econ?.value === 'epe' && epe) return `received from Petroleum Economics Studio run "${epe.runName}"${epe.caseName ? ` of case "${epe.caseName}"` : ''}: its NPV before development capex per barrel`;
  if (epe) return `entered on this screen (Petroleum Economics Studio run "${epe.runName}" sent ${Number(epe.unitValue.toPrecision(6))} $/bbl, no longer in use)`;
  if (Number.isFinite(p?.rcpUnitValue)) {
    return value === p.rcpUnitValue
      ? 'from ReservoirCalc Pro success-case economics (the Suite screening NPV), sent with the prospect'
      : `entered on this screen (ReservoirCalc Pro sent ${p.rcpUnitValue} $/bbl)`;
  }
  // a prospect imported before the sent value was kept
  if (p?.economicsNote) return 'sent by ReservoirCalc Pro success-case economics, and it may have been edited on this screen since';
  if (value === DEFAULT_ECONOMICS.unitValue) return `the starting default of ${DEFAULT_ECONOMICS.unitValue} $/bbl, an assumption to replace`;
  return 'entered on this screen';
}

// ---- economics: the derived MEFS and the value line (U2-002) ---------------------

/** The economics block of a new prospect: the starting model, everything derived. */
export const newEcon = () => ({ value: 'model', mefs: 'derived', model: { ...ECON_MODEL_DEFAULTS }, modelTouched: {} });

/**
 * The three economic inputs the valuation engine reads, from the bases the
 * valuation states. Pure; the NPV behind a model basis is the canonical
 * engine's (services/rrvEconomics.js).
 * @returns {{mefs: number|string, unitValue: number|string, devCost: number|string, problem: ?string,
 *   derivedMefs: ?number, line: ?object}} a value that cannot be derived is '' and `problem` says why
 */
export function resolveEconomics(p) {
  const econ = p.econ || { value: 'entered', mefs: 'typed' };
  if (econ.value === 'model') {
    const bad = modelProblem(econ.model);
    const typedMefs = econ.mefs === 'typed';
    const line = bad ? { ok: false, reason: bad } : valueLine(econ.model, p, typedMefs && isNum(p.mefs) && Number(p.mefs) >= 0 ? Number(p.mefs) : null);
    if (!line.ok) return { mefs: typedMefs ? p.mefs : '', unitValue: '', devCost: '', problem: line.reason, derivedMefs: null, line: null };
    return { mefs: typedMefs ? p.mefs : line.mefs, unitValue: line.unitValue, devCost: line.devCost, problem: null, derivedMefs: line.derivedMefs, line };
  }
  // a typed, sent or Petroleum Economics Studio value: value(V) = u V - D, worth zero at D / u
  const u = isNum(p.unitValue) ? Number(p.unitValue) : null;
  const d = isNum(p.devCost) ? Number(p.devCost) : null;
  let derived = null;
  let problem = null;
  if (u !== null && d !== null && u >= 0 && d >= 0) {
    if (d === 0) derived = 0;
    else if (u > 0) derived = d / u;
    else problem = 'No field size pays: the value per barrel is zero and the development cost is not. Enter a value per barrel, or type the MEFS.';
  }
  if (econ.mefs !== 'derived') return { mefs: p.mefs, unitValue: p.unitValue, devCost: p.devCost, problem: null, derivedMefs: derived, line: null };
  return { mefs: derived === null ? '' : derived, unitValue: p.unitValue, devCost: p.devCost, problem, derivedMefs: derived, line: null };
}

/** The valuation with its derived economics written into `mefs`, `unitValue` and `devCost`. */
export function syncEconomics(p) {
  if (!p.econ) return p;
  const r = resolveEconomics(p);
  return { ...p, mefs: r.mefs, unitValue: r.unitValue, devCost: r.devCost };
}

/**
 * One typed input. Typing over a derived value takes it over: a typed MEFS
 * stops following the economics, and a typed value per barrel or
 * development cost leaves the model (or the Petroleum Economics Studio
 * case) for entered values. The other derived values follow.
 */
export function setInput(p, key, value) {
  const next = { ...p, [key]: value };
  if (key !== 'name') next.touched = { ...(p.touched || {}), [key]: true };
  if (p.econ && key === 'mefs') next.econ = { ...p.econ, mefs: 'typed' };
  if (p.econ && (key === 'unitValue' || key === 'devCost') && p.econ.value !== 'entered') next.econ = { ...p.econ, value: 'entered' };
  return syncEconomics(next);
}

/** Choose where the value of a discovery comes from. Leaving for entered values keeps the numbers as they stand. */
export function setValueBasis(p, basis) {
  if (!VALUE_BASES.includes(basis) || (basis === 'epe' && !p.econ?.epe)) return p;
  const touched = { ...(p.touched || {}) };
  if (basis !== 'entered') { delete touched.unitValue; delete touched.devCost; } else { touched.unitValue = true; touched.devCost = true; }
  const next = { ...p, touched, econ: { ...(p.econ || newEcon()), value: basis } };
  if (basis === 'epe') { next.unitValue = p.econ.epe.unitValue; next.devCost = p.econ.epe.devCost; }
  return syncEconomics(next);
}

// ---- the Petroleum Economics Studio handoff (U2-001) --------------------------------

/**
 * Take a Petroleum Economics Studio case as the value of a discovery. The
 * whole contract (run, case, price deck, discount rate, dates, builds, the
 * numbers and its fingerprint) is kept with the valuation, with when and by
 * which build it was received, so it survives a reload and can be printed
 * and checked against the run later.
 * @param {object} p a valuation
 * @param {object} contract an `epe-unit-value-1` contract (epe/epeUnitValue.js)
 */
export function applyEpeCase(p, contract, { now = new Date(), build = null } = {}) {
  if (!contract || contract.schema !== 'epe-unit-value-1' || !(Number(contract.unitValue) > 0)) return p;
  const touched = { ...(p.touched || {}) };
  delete touched.unitValue; delete touched.devCost;
  return syncEconomics({
    ...p, touched, unitValue: contract.unitValue, devCost: contract.devCost,
    econ: { ...(p.econ || newEcon()), value: 'epe', epe: { ...contract, receivedAt: now.toISOString(), receivedBuild: build } },
  });
}

const EPE_WATCHED = [
  ['unitValue', 'value per barrel before capex'], ['devCost', 'development cost'], ['npvPerBoe', 'NPV per barrel'], ['npvMM', 'case NPV'],
  ['totalMMboe', 'case volume'], ['discountRatePct', 'discount rate'], ['priceDeckName', 'price deck'], ['runName', 'run name'], ['engineVersion', 'engine build'],
];

/**
 * How a valuation's Petroleum Economics Studio handoff stands against the
 * run as it is NOW (read again by id after a page load).
 *   none      no case was ever received
 *   unknown   the run could not be read (`current` undefined)
 *   current   the run says what it said when it was received
 *   changed   the run says something else: `changes` lists what moved
 *   missing   the run is gone, or can no longer be read by this user
 *   refused   the run is there but can no longer be sent (`reason`)
 * `inUse` says whether the case is still the value of the valuation.
 * @param {object} p a valuation
 * @param {?object|undefined} current what getEpeUnitValue(runId) returned
 */
export function epeState(p, current) {
  const held = p?.econ?.epe;
  if (!held) return { state: 'none', inUse: false };
  const inUse = p.econ.value === 'epe';
  if (current === undefined) return { state: 'unknown', inUse };
  if (current === null) return { state: 'missing', inUse };
  if (!current.ok) return { state: 'refused', inUse, reason: current.reason };
  if (current.contract.fingerprint === held.fingerprint) return { state: 'current', inUse, contract: current.contract };
  const changes = EPE_WATCHED.filter(([k]) => current.contract[k] !== held[k]).map(([k, label]) => ({ key: k, label, from: held[k] ?? null, to: current.contract[k] ?? null }));
  return { state: 'changed', inUse, contract: current.contract, changes };
}

/** Derive the MEFS from the value of a discovery, or keep the one typed. */
export function setMefsBasis(p, basis) {
  if (!MEFS_BASES.includes(basis)) return p;
  const touched = { ...(p.touched || {}) };
  if (basis === 'derived') delete touched.mefs; else touched.mefs = true;
  return syncEconomics({ ...p, touched, econ: { ...(p.econ || newEcon()), mefs: basis } });
}

/** One assumption of the economic model. */
export function setModelField(p, key, value) {
  if (!ECON_MODEL_KEYS.includes(key)) return p;
  const econ = p.econ || newEcon();
  return syncEconomics({ ...p, econ: { ...econ, model: { ...econ.model, [key]: value }, modelTouched: { ...(econ.modelTouched || {}), [key]: true } } });
}

/** The stated ranges of the EMV sensitivity (U2-003), kept with the valuation. */
export function setSens(p, key, value) {
  if (key !== 'swing' && key !== 'factorSwing') return p;
  return { ...p, sens: { ...(p.sens || {}), [key]: value } };
}

/** A blank typed prospect. */
export const blankProspect = (n) => syncEconomics({
  id: `own-${Date.now()}-${n}`, source: 'own', name: `Prospect ${n}`, pg: 0.25, p90: 10, p50: 25, p10: 60, ...DEFAULT_ECONOMICS,
  econ: newEcon(),
  pgFactors: null, handoff: null, ident: { company: '', licence: '', play: '', analyst: '' }, inputMeta: {}, touched: {}, notes: '',
});

/**
 * A prospect as this build holds it, from whatever an earlier build or a
 * saved row left: the T1 browser list had no identification, no handoff
 * block and no record of what the user had typed. For those, an economic
 * input that differs from the starting default is taken as typed; one that
 * equals it stays an assumption.
 */
export function upgradeProspect(p) {
  const q = { ...p };
  q.source = q.source === 'rcp' ? 'rcp' : 'own';
  q.pgFactors = q.pgFactors && typeof q.pgFactors === 'object' ? q.pgFactors : null;
  q.handoff = q.handoff && typeof q.handoff === 'object' ? q.handoff : null;
  q.ident = { company: '', licence: '', play: '', analyst: '', ...(q.ident && typeof q.ident === 'object' ? q.ident : {}) };
  q.inputMeta = q.inputMeta && typeof q.inputMeta === 'object' ? q.inputMeta : {};
  if (!q.touched || typeof q.touched !== 'object') {
    q.touched = {};
    for (const k of ECON_KEYS) if (!blank(q[k]) && Number(q[k]) !== DEFAULT_ECONOMICS[k] && !(k === 'unitValue' && Number(q[k]) === q.rcpUnitValue)) q.touched[k] = true;
  }
  q.notes = typeof q.notes === 'string' ? q.notes : '';
  // a valuation saved before U2-002 typed its MEFS, value per barrel and
  // development cost: it stays exactly as it was valued
  const e = q.econ && typeof q.econ === 'object' ? q.econ : null;
  q.econ = {
    value: VALUE_BASES.includes(e?.value) ? e.value : 'entered',
    mefs: MEFS_BASES.includes(e?.mefs) ? e.mefs : 'typed',
    model: { ...ECON_MODEL_DEFAULTS, ...(e?.model && typeof e.model === 'object' ? e.model : {}) },
    modelTouched: e?.modelTouched && typeof e.modelTouched === 'object' ? e.modelTouched : {},
    ...(e?.epe && typeof e.epe === 'object' ? { epe: e.epe } : {}),
  };
  if (q.econ.value === 'epe' && !q.econ.epe) q.econ.value = 'entered';
  return syncEconomics(q);
}

const LABEL = { pg: 'Pg', p90: 'P90', p50: 'P50', p10: 'P10', mefs: 'the MEFS', unitValue: 'the value per barrel', devCost: 'the development cost', wellCost: 'the exploration well cost' };

/** Why a prospect cannot be valued yet, or null. A blank is never read as zero. */
export function inputProblem(p) {
  const n = (v) => Number(v);
  if (blank(p.pg)) return 'Enter Pg, the geological chance of success (0 to 1).';
  if (!(n(p.pg) >= 0 && n(p.pg) <= 1)) return 'Pg must be between 0 and 1.';
  if (!(n(p.p90) > 0) || !(n(p.p10) > n(p.p90))) return 'Volumes need 0 < P90 < P10 (P90 is the low case).';
  if (p.p50 !== '' && p.p50 != null && !(n(p.p50) >= n(p.p90) && n(p.p50) <= n(p.p10))) return 'P50 must lie between P90 and P10.';
  if (p.econ && (p.econ.value === 'model' || p.econ.mefs === 'derived')) {
    const r = resolveEconomics(p);
    if (r.problem) return r.problem;
  }
  for (const k of ECON_KEYS) if (blank(p[k])) return `Enter ${LABEL[k]} (zero is allowed).`;
  for (const k of ECON_KEYS) if (!(n(p[k]) >= 0)) return 'MEFS, value per barrel and costs must be zero or more.';
  return null;
}

/** The object handed to the valuation engine: every key is an input the report must print (RL1). */
export const engineInput = (p) => ({
  pg: Number(p.pg), p90: Number(p.p90), p50: blank(p.p50) ? undefined : Number(p.p50), p10: Number(p.p10),
  mefs: Number(p.mefs), unitValue: Number(p.unitValue), devCost: Number(p.devCost), wellCost: Number(p.wellCost),
});

// ---- handoff: edits and changes upstream ---------------------------------------

/** The handed-over inputs whose value here no longer equals what ReservoirCalc Pro sent. */
export function editedKeys(p) {
  const sent = p?.handoff?.values;
  if (!sent) return [];
  return HANDOFF_KEYS.filter((k) => isNum(sent[k]) && Number(p[k]) !== Number(sent[k]));
}

const newest = (rows) => (rows.length ? [...rows].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0] : null);

/**
 * How a valuation stands against the ReservoirCalc Pro inventory as it is
 * NOW (read by id after a page load, so the answer survives a refresh).
 *   own        typed here, nothing upstream
 *   unknown    the inventory could not be read
 *   current    the source record says what it said when it was received
 *   changed    the source record was edited since: `changes` lists what moved
 *   replaced   the source record is gone and a newer one carries its name
 *              (a prospect is re-risked by adding it again)
 *   missing    the source record is gone
 *   unrecorded imported by a build that kept no handoff record
 * @param {object} p a valuation
 * @param {?Array} rows the user's rcp_prospects rows (own, then shared)
 */
export function upstreamState(p, rows) {
  if (p?.source !== 'rcp') return { state: 'own' };
  if (!Array.isArray(rows)) return { state: 'unknown' };
  const changesTo = (row) => {
    const fresh = fromRcpProspect(row);
    const base = p.handoff?.values || {};
    return HANDOFF_KEYS
      .filter((k) => isNum(fresh.handoff.values[k]) || isNum(base[k]))
      .filter((k) => Number(fresh.handoff.values[k]) !== Number(base[k]))
      .map((k) => ({ key: k, from: isNum(base[k]) ? Number(base[k]) : null, to: isNum(fresh.handoff.values[k]) ? Number(fresh.handoff.values[k]) : null }));
  };
  // U2-006: a re-run made from ReservoirCalc Pro names the record it replaces
  const rerun = newest(rows.filter((r) => r.id !== p.rcpId && r.inputs?.source?.replaces === p.rcpId));
  if (rerun) return { state: 'replaced', row: rerun, changes: p.handoff ? changesTo(rerun) : [], rerun: true };
  const row = rows.find((r) => r.id === p.rcpId);
  if (row) {
    if (!p.handoff?.fingerprint) return { state: 'unrecorded', row };
    if (rcpFingerprint(row) === p.handoff.fingerprint) return { state: 'current', row };
    return { state: 'changed', row, changes: changesTo(row) };
  }
  const name = p.handoff?.recordName ?? p.name;
  const twins = rows.filter((r) => r.name === name);
  if (twins.length) { const twin = newest(twins); return { state: 'replaced', row: twin, changes: p.handoff ? changesTo(twin) : [] }; }
  return { state: 'missing' };
}

/**
 * Take the source record as it is now. Pg, the volumes, their basis and the
 * chance factors come from ReservoirCalc Pro; this app's own inputs (MEFS,
 * well cost) are kept, and so are a value per barrel and a development cost
 * the user typed here.
 */
export function refreshFromRcp(p, row, { now = new Date() } = {}) {
  const fresh = fromRcpProspect(row, { now });
  const touched = { ...(p.touched || {}) };
  for (const k of ['pg', ...VOLUME_KEYS]) delete touched[k];
  const keep = (k) => (touched[k] ? p[k] : (fresh.handoff.values[k] !== undefined ? fresh[k] : p[k]));
  const renamed = p.handoff?.recordName != null && p.name !== p.handoff.recordName;
  const out = {
    ...p,
    id: fresh.id, rcpId: fresh.rcpId, name: renamed ? p.name : fresh.name,
    pg: fresh.pg, p90: fresh.p90, p50: fresh.p50, p10: fresh.p10,
    volumeNote: fresh.volumeNote, basis: fresh.basis, chargeNote: fresh.chargeNote,
    unitValue: keep('unitValue'), devCost: keep('devCost'),
    pgFactors: fresh.pgFactors, handoff: fresh.handoff, touched,
  };
  delete out.economicsNote; delete out.rcpUnitValue;
  if (fresh.economicsNote) { out.economicsNote = fresh.economicsNote; out.rcpUnitValue = fresh.rcpUnitValue; }
  // the volumes moved, so a derived value line and MEFS move with them
  return syncEconomics(out);
}

// ---- browser storage (the fallback, and the draft of unsaved edits) --------------

/** The T1 browser list, as that build wrote it. */
export function loadProspects() {
  try { const v = JSON.parse(localStorage.getItem(RRV_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveProspects(list) {
  try { localStorage.setItem(RRV_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/**
 * The valuations this browser holds. A list left by the T1 build is read
 * once (`fromLegacy` says how many came from it) and its key is left in
 * place, so an older tab still open keeps working.
 * @returns {{list: Array, fromLegacy: number}}
 */
export function loadStored() {
  try {
    const raw = localStorage.getItem(RRV_STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && Array.isArray(v.list)) return { list: v.list.map(upgradeProspect), fromLegacy: 0 };
    }
  } catch { /* unreadable: fall through to the older list */ }
  const old = loadProspects();
  return { list: old.map((p) => ({ ...upgradeProspect(p), row: null, dirty: true })), fromLegacy: old.length };
}
/** True when the list was written; false in a browser that refuses storage. */
export function storeLocal(list) {
  try { localStorage.setItem(RRV_STORE_KEY, JSON.stringify({ v: 2, list })); return true; } catch { return false; }
}

// ---- the saved row ------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_ONLY = ['row', 'dirty'];

/** What goes into the row's `valuation` column: the valuation without the page's own bookkeeping. */
export function payloadOf(p) {
  const out = { ...p };
  for (const k of CLIENT_ONLY) delete out[k];
  return out;
}

/** A valuation as an rrv_valuations row (without the owner and the stamps, which the backend adds). */
export const toRow = (p) => ({
  prospect_key: p.id,
  rcp_prospect_id: p.source === 'rcp' && UUID.test(String(p.rcpId || '')) ? p.rcpId : null,
  name: String(p.name || '').trim() || 'Unnamed prospect',
  valuation: payloadOf(p),
});

/** A saved row as a valuation; the row's sharing state rides along in `row`. */
export function fromRow(row) {
  const { valuation, ...rest } = row;
  return { ...upgradeProspect({ ...(valuation || {}), id: row.prospect_key, name: row.name }), row: rest, dirty: false };
}

/**
 * What the page shows once the account has answered: the saved rows, with
 * the browser's own state laid over them.
 *   a saved row with unsaved edits in this browser   the edits win and stay unsaved
 *   a saved row with none                            the row
 *   a browser valuation that was never saved         kept, marked unsaved
 *   a browser valuation that WAS saved, whose row    dropped: it was deleted from
 *   is gone and that has no unsaved edits            another tab or device
 * @param {Array} local valuations from the browser
 * @param {Array} rows rrv_valuations rows of this user
 */
export function mergeSaved(local, rows) {
  const saved = (rows || []).map(fromRow);
  const keys = new Set(saved.map((s) => s.id));
  const out = saved.map((s) => {
    const mine = (local || []).find((l) => l.id === s.id);
    return mine && mine.dirty ? { ...mine, row: s.row, dirty: true } : s;
  });
  for (const l of local || []) {
    if (keys.has(l.id)) continue;
    if (l.row && !l.dirty) continue;
    out.push({ ...l, row: null, dirty: true });
  }
  return out;
}

// ---- CSV ----------------------------------------------------------------------

/** One word for where the value per barrel and development cost come from. */
export const valueBasisWord = (p) => (p?.econ?.value === 'model' ? 'economic model'
  : p?.econ?.value === 'epe' ? 'Petroleum Economics Studio case'
    : Number.isFinite(p?.rcpUnitValue) && Number(p.unitValue) === p.rcpUnitValue ? 'sent by ReservoirCalc Pro' : 'entered');

const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * The valuation table as CSV. With `meta` the file opens with a provenance
 * header (lines starting with "#": application, build, time, unit and
 * percentile conventions, where the valuations are saved, and one line per
 * prospect saying where its volumes came from), and the volume and value
 * columns are in the display unit. Without it, the plain table in MMboe.
 * @param {Array<{p: object, v: ?object}>} rows
 * @param {?{build?: string, generatedAt?: Date, savedWhere?: string,
 *   units?: {volumeLabel: string, volumeKey: string, unitValueLabel: string, unitValueKey: string,
 *     volume: function(number): number, unitValue: function(number): number},
 *   sourceLine?: function(object): string}} [meta]
 */
export function valuationCsv(rows, meta = null) {
  const u = meta?.units || null;
  const vol = (x) => (u ? u.volume(x) : x);
  const uv = (x) => (u ? u.unitValue(x) : x);
  const vk = u?.volumeKey || 'mmbbl';
  const head = ['prospect', 'source', 'pg', `p90_${vk}`, `p50_${vk}`, `p10_${vk}`, `mefs_${vk}`, u?.unitValueKey || 'value_usd_per_bbl', 'dev_cost_musd', 'well_cost_musd',
    'p_commercial_given_success', 'pc', `success_mean_${vk}`, `swanson_mean_${vk}`, `risked_mean_${vk}`, 'emv_musd', 'break_even_pg',
    ...(meta ? [`mean_if_commercial_${vk}`, 'npv_if_commercial_musd', 'volume_basis', 'source_record', 'source_record_saved', 'edited_after_handoff', 'problem', 'mefs_basis', 'value_basis'] : [])];
  const lines = [];
  if (meta) {
    const at = (meta.generatedAt || new Date()).toISOString().slice(0, 16).replace('T', ' ');
    lines.push('# Risked Reserves Valuation, Petrolord Suite');
    lines.push(`# Build: ${meta.build || 'not stated'}`);
    lines.push(`# Generated: ${at} UTC`);
    lines.push(`# Units: volumes ${u?.volumeLabel || 'MMboe'} (oil equivalent, gas at ${BOE_BASIS}); value per barrel ${u?.unitValueLabel || '$/boe'}; costs and values $MM`);
    lines.push(`# Percentiles: ${PERCENTILE_CONVENTION}`);
    lines.push('# Volumes are the success case (given a discovery); the risked mean is Pg x the success-case mean');
    lines.push('# EMV = Pg x [ value per barrel x E(V; V >= MEFS) - development cost x P(V >= MEFS) ] - exploration well cost');
    lines.push('# A derived MEFS is the size at which a discovery is worth zero; a value from the economic model is the canonical screening NPV (calculateEconomics) read between the MEFS and the mean commercial size');
    lines.push('# Prospects are valued one by one; nothing here assumes or models dependence between them');
    if (meta.savedWhere) lines.push(`# Saved: ${meta.savedWhere}`);
    for (const { p } of rows) lines.push(`# ${String(p.name).replace(/[\r\n]+/g, ' ')}: ${meta.sourceLine ? meta.sourceLine(p) : (p.source === 'rcp' ? 'from ReservoirCalc Pro' : 'typed in this app')}`);
  }
  lines.push(head.join(','));
  const f = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '');
  const cellNum = (x, conv) => (isNum(x) ? Number(conv(Number(x)).toPrecision(10)) : '');
  for (const { p, v, problem } of rows) {
    const row = [p.name, p.source, p.pg, cellNum(p.p90, vol), cellNum(p.p50, vol), cellNum(p.p10, vol), cellNum(p.mefs, vol), cellNum(p.unitValue, uv), p.devCost, p.wellCost,
      v ? v.pCommercialGivenSuccess.toFixed(4) : '', v ? v.pc.toFixed(4) : '', v ? vol(v.successCase.mean).toFixed(3) : '',
      v && v.successCase.swansonMean != null ? vol(v.successCase.swansonMean).toFixed(3) : '', v ? vol(v.riskedMean).toFixed(3) : '',
      v ? v.emv.toFixed(3) : '', v && v.breakEvenPg != null ? v.breakEvenPg.toFixed(4) : ''];
    if (meta) {
      row.push(v && v.meanIfCommercial != null ? f(vol(v.meanIfCommercial), 3) : '', v && v.npvIfCommercial != null ? f(v.npvIfCommercial, 3) : '',
        p.source === 'rcp' ? (p.basis || 'not stated') : 'as typed',
        p.handoff ? `${p.handoff.app} ${p.handoff.recordName ?? ''} (${p.handoff.recordId})` : '',
        p.handoff?.recordUpdatedAt || '', editedKeys(p).join(' '), problem || '',
        p.econ?.mefs === 'derived' ? 'derived' : 'typed', valueBasisWord(p));
    }
    lines.push(row.map(q).join(','));
  }
  return lines.join('\n');
}
