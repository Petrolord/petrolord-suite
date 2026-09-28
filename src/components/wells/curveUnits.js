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

const PERCENT = new Set(['PU', 'P.U.', '%', 'PERCENT', 'PERC', 'PCT', 'PU_LS', 'LSPU', 'SSPU', 'DPU', 'NAPU', 'PU(LS)']);
const FRACTION = new Set(['V/V', 'DEC', 'DECP', 'FRAC', 'FRACTION', 'M3/M3', 'CFCF', 'FT3/FT3', 'CF/CF', 'VOL/VOL', 'V/V_LS']);
const KG_M3 = new Set(['K/M3', 'KG/M3', 'KGM3', 'KG/M^3']);
const G_CC = new Set(['G/C3', 'G/CC', 'G/CM3', 'GM/CC', 'GR/CC', 'GRAM/CC', 'GCC', 'G/CM^3']);
const US_FT = new Set(['US/F', 'US/FT', 'USEC/F', 'USEC/FT', 'MICROSEC/FT']);

const normUnit = (u) => String(u || '').trim().toUpperCase();

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
 * @returns {{data: ArrayLike<number>, notes: string[]}}
 */
export function normalizeInputCurve(key, log, data) {
  const notes = [];
  if (!data || !PHYSICAL.has(key)) return { data, notes };
  const name = log?.mnemonic || key;
  const unit = normUnit(log?.unit);
  let out = data;

  // vendor null sentinels not declared as the file's NULL
  let sentinels = 0;
  for (let i = 0; i < data.length; i++) if (data[i] <= NULL_FLOOR) sentinels += 1;
  if (sentinels) {
    out = Float64Array.from(data, (v) => (v <= NULL_FLOOR ? NaN : v));
    notes.push(`${name}: ${sentinels} sample${sentinels === 1 ? '' : 's'} at -999 or below read as null (a vendor null value the file did not declare).`);
  }

  if (key === 'NPHI') {
    const p95 = quantile(out, 0.95);
    if (PERCENT.has(unit)) {
      out = scaled(out, 0.01);
      notes.push(`${name} is in ${log.unit}: divided by 100 to v/v for the pipeline.`);
    } else if (p95 > 1.5) {
      // a neutron porosity above 1.5 v/v does not exist: the numbers are percent
      out = scaled(out, 0.01);
      notes.push(`${name} values run to ${p95.toFixed(1)}, which only percent can mean${FRACTION.has(unit) ? ` (the file labels them ${log.unit})` : ''}: divided by 100 to v/v. Fix the unit in Well Data Manager to silence this.`);
    }
  } else if (key === 'RHOB') {
    const med = quantile(out, 0.5);
    if (KG_M3.has(unit)) {
      out = scaled(out, 0.001);
      notes.push(`${name} is in ${log.unit}: divided by 1000 to g/cc for the pipeline.`);
    } else if (med > 100) {
      out = scaled(out, 0.001);
      notes.push(`${name} values sit near ${Math.round(med)}, which only kg/m3 can mean${G_CC.has(unit) ? ` (the file labels them ${log.unit})` : ''}: divided by 1000 to g/cc.`);
    }
  } else if (key === 'DT' && US_FT.has(unit)) {
    out = scaled(out, 1 / 0.3048);
    notes.push(`${name} is in ${log.unit}: converted to us/m for the pipeline.`);
  }
  return { data: out, notes };
}

/**
 * The pipeline input curves for a well from its mapped logs.
 * @param {Object<string, ?{mnemonic: string, unit?: string}>} mapped key -> log
 * @param {Object<string, ArrayLike<number>>} rawByMnemonic stored samples
 * @returns {{curves: Object<string, ArrayLike<number>>, notes: string[]}}
 */
export function inputCurves(mapped, rawByMnemonic) {
  const curves = {};
  const notes = [];
  for (const [key, log] of Object.entries(mapped || {})) {
    if (!log) continue;
    const raw = rawByMnemonic[log.mnemonic];
    if (!raw) continue;
    const r = normalizeInputCurve(key, log, raw);
    curves[key] = r.data;
    notes.push(...r.notes);
  }
  return { curves, notes };
}

/** The unit a pipeline input carries after normalizeInputCurve. */
export const PIPELINE_UNITS = Object.freeze({ NPHI: 'V/V', RHOB: 'G/C3', DT: 'US/M' });

/** Unit to stamp on a curve derived from a normalised input (a _CND row):
 *  the pipeline unit where normalisation may have converted, else the
 *  source row's own. Stamping the source's PU on v/v data would divide
 *  it by 100 again on the next read. */
export const derivedInputUnit = (key, log) => PIPELINE_UNITS[key] || log?.unit || '';
