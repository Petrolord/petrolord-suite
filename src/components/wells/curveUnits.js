// Pipeline inputs in the units the engines expect (AppUpgrade PETRO-U1,
// hostile file set, 2026-09-28). The petrophysics engines take NPHI in
// v/v, RHOB in g/cc and DT in us/m, and say the import layer owns the
// conversion. The LAS door converts depth and sonic only, so a
// Techlog, IP or Petrel export with NPHI in percent (PU, %) or RHOB in
// kg/m3 reached the pipeline as it was: NPHI 25 read as 25 v/v, RHOB 2350
// read as g/cc, and every porosity and Sw built on them was wrong with
// nothing on screen saying why. A vendor null written differently from
// the file's declared NULL (-999 in a -999.25 file) was data too: an RHOB
// of -999 is a density porosity of 600 and it passed the pay cutoffs.
//
// This module runs where the Studio reads a curve as a pipeline INPUT
// (the explorer's well, the field view cache, batch runs). It never
// writes: the stored registry curve stays as imported and a `log:` track
// still shows it raw. Every change is named in a sentence the caller
// shows.

/** Measurements that can never read -999 or below; such samples are nulls. */
const PHYSICAL = new Set(['GR', 'RHOB', 'NPHI', 'DT', 'RT', 'CAL', 'DRHO', 'PEF']);
export const NULL_FLOOR = -999;
/** A compressional slowness median below this, read as us/m, would be faster
 *  than any sedimentary rock (140 us/m = 7140 m/s; dolomite is about 7000). */
export const DT_PER_FOOT_BELOW = 140;

// PETRO-U2-001: the unit spellings live in one table shared with Rock
// Physics (unitFamilies.js); this module decides and says what it did.
import { UNIT_FAMILIES, familyMember } from './unitFamilies';

function quantile(data, q) {
  const xs = [];
  for (let i = 0; i < data.length; i++) if (Number.isFinite(data[i])) xs.push(data[i]);
  if (!xs.length) return NaN;
  xs.sort((a, b) => a - b);
  return xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))];
}

const scaled = (data, f) => Float64Array.from(data, (v) => (Number.isFinite(v) ? v * f : NaN));

/**
 * One input curve, normalised.
 * @param {string} key pipeline input key (GR, RHOB, NPHI, DT, RT, ...)
 * @param {{mnemonic?: string, unit?: string}} log registry row
 * @param {ArrayLike<number>} data samples as stored
 * @param {{unitOverride?: ?string}} [opts] PETRO-U2-001: the unit the user
 *   says the stored numbers are in (wins over the file and the range check)
 * @returns {{data: ArrayLike<number>, notes: string[], decision: ?Object}}
 *   decision: {key, mnemonic, fileUnit, readAs, factor, reason} where reason
 *   is 'override' | 'file' | 'range' | 'pipeline' | 'unknown'
 */
export function normalizeInputCurve(key, log, data, { unitOverride = null } = {}) {
  const notes = [];
  if (!data || !PHYSICAL.has(key)) return { data, notes, decision: null };
  const name = log?.mnemonic || key;
  const fam = UNIT_FAMILIES[key] || null;
  let out = data;

  // vendor null sentinels not declared as the file's NULL
  let sentinels = 0;
  for (let i = 0; i < data.length; i++) if (data[i] <= NULL_FLOOR) sentinels += 1;
  if (sentinels) {
    out = Float64Array.from(data, (v) => (v <= NULL_FLOOR ? NaN : v));
    notes.push(`${name}: ${sentinels} sample${sentinels === 1 ? '' : 's'} at -999 or below read as null (a vendor null value the file did not declare).`);
  }
  if (!fam) return { data: out, notes, decision: null };

  const decision = { key, mnemonic: name, fileUnit: log?.unit || '', readAs: fam.pipelineUnit, factor: 1, reason: 'pipeline', sentinels };
  const apply = (factor, readAs, reason, note) => {
    if (factor !== 1) out = scaled(out, factor);
    Object.assign(decision, { factor, readAs, reason });
    if (note) notes.push(note);
  };
  const verb = (m) => (m.factor < 1 ? `divided by ${Math.round(1 / m.factor)}` : 'converted');
  const override = unitOverride ? familyMember(key, unitOverride) : null;
  if (override) {
    apply(override.factor, override.unit, 'override', override.factor === 1
      ? `${name} read as ${fam.pipelineUnit} (your setting in Input units).`
      : `${name} read as ${override.unit} (your setting in Input units): ${verb(override)} to ${fam.pipelineUnit.toLowerCase()} for the pipeline.`);
    return { data: out, notes, decision };
  }
  const member = familyMember(key, log?.unit);
  if (key === 'NPHI') {
    const p95 = quantile(out, 0.95);
    if (member?.unit === 'PU') {
      apply(0.01, 'PU', 'file', `${name} is in ${log.unit}: divided by 100 to v/v for the pipeline.`);
    } else if (p95 > 1.5) {
      // a neutron porosity above 1.5 v/v does not exist: the numbers are percent
      apply(0.01, 'PU', 'range', `${name} values run to ${p95.toFixed(1)}, which only percent can mean${member ? ` (the file labels them ${log.unit})` : ''}: divided by 100 to v/v. Set the unit in Input units to silence this.`);
    } else Object.assign(decision, { reason: member ? 'file' : 'unknown' });
  } else if (key === 'RHOB') {
    const med = quantile(out, 0.5);
    if (member?.unit === 'KG/M3') {
      apply(0.001, 'KG/M3', 'file', `${name} is in ${log.unit}: divided by 1000 to g/cc for the pipeline.`);
    } else if (med > 100) {
      apply(0.001, 'KG/M3', 'range', `${name} values sit near ${Math.round(med)}, which only kg/m3 can mean${member ? ` (the file labels them ${log.unit})` : ''}: divided by 1000 to g/cc.`);
    } else Object.assign(decision, { reason: member ? 'file' : 'unknown' });
  } else if (key === 'DT') {
    if (member?.unit === 'US/FT') apply(1 / 0.3048, 'US/FT', 'file', `${name} is in ${log.unit}: converted to us/m for the pipeline.`);
    else if (member) Object.assign(decision, { reason: 'file' });
    else {
      // RP-U1-003 (shared): a spelling the table does not know, or no unit at all.
      // A per-foot spelling (MICROSECONDS/FT) reads per foot; with no hint, a
      // median below DT_PER_FOOT_BELOW us/m would be faster than any
      // sedimentary rock, so the numbers are us/ft.
      const u = String(log?.unit || '').trim();
      const med = quantile(out, 0.5);
      if (/F/i.test(u)) {
        apply(1 / 0.3048, 'US/FT', 'pattern', `${name} unit "${u}" is not in the unit table; it names feet, so it was read as us/ft and converted to us/m.`);
      } else if (med > 0 && med < DT_PER_FOOT_BELOW) {
        apply(1 / 0.3048, 'US/FT', 'range', `${name} ${u ? `unit "${u}" is not in the unit table` : 'has no unit'} and its values sit near ${med.toFixed(0)}, which as us/m would be faster than any sedimentary rock: read as us/ft and converted to us/m. Set the unit to silence this.`);
      } else {
        // left to the caller: Pore Pressure applies its own overburden rule here
        Object.assign(decision, { reason: 'unknown', median: med });
      }
    }
  }
  return { data: out, notes, decision };
}

/**
 * The pipeline input curves for a well from its mapped logs.
 * @param {Object<string, ?{mnemonic: string, unit?: string}>} mapped key -> log
 * @param {Object<string, ArrayLike<number>>} rawByMnemonic stored samples
 * @param {{unitOverrides?: Object<string, string>}} [opts] mnemonic -> unit the user set (PETRO-U2-001)
 * @returns {{curves: Object<string, ArrayLike<number>>, notes: string[], decisions: Array}}
 */
export function inputCurves(mapped, rawByMnemonic, { unitOverrides = {} } = {}) {
  const curves = {};
  const notes = [];
  const decisions = [];
  for (const [key, log] of Object.entries(mapped || {})) {
    if (!log) continue;
    const raw = rawByMnemonic[log.mnemonic];
    if (!raw) continue;
    const r = normalizeInputCurve(key, log, raw, { unitOverride: unitOverrides?.[log.mnemonic] || null });
    curves[key] = r.data;
    notes.push(...r.notes);
    if (r.decision) decisions.push(r.decision);
  }
  return { curves, notes, decisions };
}

/** The unit a pipeline input carries after normalizeInputCurve. */
export const PIPELINE_UNITS = Object.freeze({ NPHI: 'V/V', RHOB: 'G/C3', DT: 'US/M' });

/** Unit to stamp on a curve derived from a normalised input (a _CND row):
 *  the pipeline unit where normalisation may have converted, else the
 *  source row's own. Stamping the source's PU on v/v data would divide
 *  it by 100 again on the next read. */
export const derivedInputUnit = (key, log) => PIPELINE_UNITS[key] || log?.unit || '';
