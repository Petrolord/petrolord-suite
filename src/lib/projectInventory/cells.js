// Project Data Inventory: one well's row of cells. Each cell has a state
// (status.js), the coverage of the interval of interest where it applies,
// the evidence in words, and the curve or record it came from. A user
// override (external, not acquired, incomplete, requested) replaces the
// shown state and keeps what Petrolord found beside it. Pure.

import { COLUMNS, FAMILY_BY_KEY, logsByFamily, derivationOf, editOf } from './columns';
import {
  resolveInterval, metadataCoverage, sampleCoverage, sparseCount, holeCondition, fmtDepth, fmtRange,
} from './coverage';
import { readWellDatum } from '@/lib/wellDatum';

export const COMPLETE_AT = 0.95;
const pct = (f) => `${Math.round(f * 100)}%`;
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/**
 * The best curve of a family over the interval: a measured curve before an
 * estimate, then the widest coverage, then the earlier alias (PHIE before
 * PHIT), then alias before description identification.
 */
export function bestCurve(candidates, interval, samples = {}, { preferMeasured = true } = {}) {
  let best = null;
  for (const log of candidates || []) {
    const values = samples[log.id];
    const cov = values ? sampleCoverage(log, values, interval) : metadataCoverage(log, interval);
    const derived = derivationOf(log);
    const fam = FAMILY_BY_KEY[candidateFamily(log)];
    const aliasAt = fam ? Math.max(0, fam.aliases.indexOf(String(log.mnemonic || '').toUpperCase().split(':')[0].replace(/_(SPL|ED|DC|DS|DIG|CND|EST)$/, ''))) : 0;
    const score = (preferMeasured && derived ? -2 : 0) + cov.fraction - aliasAt * 1e-4 - (log._by === 'description' ? 0.01 : 0);
    if (!best || score > best.score) best = { log, cov, derived, score, scanned: !!values };
  }
  return best;
}
const candidateFamily = (log) => log._family || null;

function overrideCell(cell, ov) {
  if (!ov || !ov.status || ov.status === 'auto') return { ...cell, note: ov?.note || '' };
  return { ...cell, auto: { status: cell.status, text: cell.text }, status: ov.status, overridden: true, note: ov.note || '' };
}

function curveCell(col, fam, interval, samples, unit) {
  const list = [...(fam[col.family] || []), ...(col.alt ? fam[col.alt] || [] : [])].map((l) => ({ ...l, _family: col.family }));
  if (!list.length) {
    return { status: 'missing', coverage: null, text: `No ${FAMILY_BY_KEY[col.family].label.toLowerCase()} curve on this well.`, curve: null };
  }
  if (col.sparse) {
    // plugs: a count, not a coverage
    let best = null;
    for (const log of list) {
      const c = sparseCount(log, samples[log.id], interval);
      if (!best || (c.inInterval ?? c.total ?? 0) > (best.c.inInterval ?? best.c.total ?? 0)) best = { log, c };
    }
    const { log, c } = best;
    if (c.inInterval === null) {
      return { status: 'complete', coverage: null, count: c.total, text: `${log.mnemonic}: ${c.total ?? 'some'} core plug values loaded (positions read when the samples are scanned).`, curve: curveRef(log), pending: true };
    }
    if (!c.inInterval) return { status: 'partial', coverage: null, count: 0, text: `${log.mnemonic}: ${c.total} plugs on the well, none inside the interval.`, curve: curveRef(log) };
    return { status: 'complete', coverage: null, count: c.inInterval, text: `${log.mnemonic}: ${c.inInterval} plug${c.inInterval === 1 ? '' : 's'} in the interval (${fmtRange(c.top, c.base, unit)}).`, curve: curveRef(log) };
  }
  const best = bestCurve(list, interval, samples, { preferMeasured: col.kind === 'measured' });
  const { log, cov, derived } = best;
  const edit = editOf(log.mnemonic);
  const what = `${log.mnemonic}${log.unit ? ` (${log.unit})` : ''}`;
  const by = log._by === 'description' ? ' Identified from its LAS description.' : '';
  const range = cov.top !== null && cov.base !== null ? ` Valid ${fmtRange(cov.top, cov.base, unit)}.` : '';
  const gapText = cov.gaps?.length ? ` ${cov.gaps.length} gap${cov.gaps.length === 1 ? '' : 's'}: ${cov.gaps.slice(0, 3).map((g) => `${fmtDepth(g.top, unit)}-${fmtDepth(g.base, unit)}`).join(', ')}${cov.gaps.length > 3 ? ', ...' : ''} ${unit}.` : '';
  const approx = cov.approx ? ' (from the curve extent; samples not yet scanned)' : '';
  const editText = edit && edit !== 'estimated' && edit !== 'digitized' ? ` ${edit[0].toUpperCase()}${edit.slice(1)} in the Suite.` : '';
  const base = { coverage: cov.fraction, gaps: cov.gaps || [], range: cov.top !== null ? [cov.top, cov.base] : null, curve: curveRef(log), approx: cov.approx, alternates: list.length - 1 };
  if (cov.fraction <= 0) {
    return { ...base, status: 'missing', text: `${what} is loaded but holds no valid data over the interval${approx}.${range}${by}` };
  }
  if (col.kind === 'measured' && derived) {
    return { ...base, status: 'derived', derivedHow: derived, text: `${what} is ${derived}; covers ${pct(cov.fraction)} of the interval${approx}.${range}${gapText}${by}` };
  }
  if (cov.fraction >= COMPLETE_AT && !(cov.gaps || []).length) {
    return { ...base, status: 'complete', text: `${what} covers ${pct(cov.fraction)} of the interval${approx}.${range}${editText}${by}` };
  }
  return { ...base, status: 'partial', text: `${what} covers ${pct(cov.fraction)} of the interval${approx}.${range}${gapText}${editText}${by}` };
}

const curveRef = (log) => ({ id: log.id, mnemonic: log.mnemonic, unit: log.unit || '', derived: derivationOf(log), provenance: log.provenance || null });

function surveyCell(well, interval, unit) {
  const dev = Array.isArray(well.deviation) ? well.deviation : [];
  if (dev.length < 2) return { status: 'missing', text: 'No deviation survey: the well is taken as vertical (TVD equals MD).' };
  const last = Math.max(...dev.map((s) => num(s.md ?? s.md_m)).filter(Number.isFinite));
  const td = num(well.td_md_m);
  const deepest = Math.max(Number.isFinite(td) ? td : -Infinity, interval?.base ?? -Infinity);
  const maxInc = Math.max(...dev.map((s) => num(s.inc ?? s.inc_deg)).filter(Number.isFinite), 0);
  const incText = maxInc < 0.5 ? 'vertical' : `maximum inclination ${maxInc.toFixed(1)} deg`;
  if (Number.isFinite(deepest) && last < deepest - 30) {
    return { status: 'partial', text: `${dev.length} stations to ${fmtDepth(last, unit)} ${unit} MD, short of ${fmtDepth(deepest, unit)} ${unit}: deeper positions are extrapolated (${incText}).` };
  }
  return { status: 'complete', text: `${dev.length} stations to ${fmtDepth(last, unit)} ${unit} MD (${incText}).`, stations: dev.length, maxInc };
}

function datumCell(well) {
  let d = null;
  try { d = readWellDatum(well); } catch { d = null; }
  if (d?.tvdssOk && d.state !== 'legacy-zero') return { status: 'complete', text: `${d.refLabel || 'Reference'} elevation set: TVDSS is known.` };
  return { status: 'missing', text: 'The depth reference elevation is not set, so TVDSS, maps and the tie to seismic cannot be trusted.' };
}

function topsCell(tops, zones, interval, spec) {
  const nTops = (tops || []).length;
  const nZones = (zones || []).length;
  if (!nTops && !nZones) return { status: 'missing', text: 'No formation tops or zones on this well.' };
  const what = `${nTops} top${nTops === 1 ? '' : 's'}, ${nZones} zone${nZones === 1 ? '' : 's'}`;
  if (spec?.mode === 'zones' && interval && !interval.matched) {
    return { status: 'partial', text: `${what}; none of the chosen zones (${spec.names.join(', ')}) is defined on this well.` };
  }
  if (spec?.mode === 'zones' && interval && spec.names.some((n) => !interval.zones.includes(n))) {
    const lacking = spec.names.filter((n) => !interval.zones.includes(n));
    return { status: 'partial', text: `${what}; ${lacking.join(', ')} not defined on this well.` };
  }
  return { status: 'complete', text: `${what}.` };
}

/** Checkshot pairs in this well, as {tvdss, twt} in metres and ms. */
export function checkshotPairs(well) {
  return (Array.isArray(well.checkshots) ? well.checkshots : [])
    .map((c) => ({ md: num(c.md_m ?? c.md), tvdss: num(c.tvdss_m ?? c.tvdss), twt: num(c.twt_ms ?? c.twt) }))
    .filter((c) => Number.isFinite(c.twt));
}

function checkshotCell(well, interval, unit) {
  const cs = checkshotPairs(well);
  if (!cs.length) return { status: 'missing', text: 'No checkshots: time-depth rests on the integrated sonic alone.' };
  if (cs.length < 2) return { status: 'partial', text: 'One checkshot level: the sonic drift cannot be checked.' };
  const deepestMd = Math.max(...cs.map((c) => c.md).filter(Number.isFinite));
  if (interval && Number.isFinite(deepestMd) && deepestMd < interval.base - 30) {
    return { status: 'partial', text: `${cs.length} levels to ${fmtDepth(deepestMd, unit)} ${unit} MD, above the base of the interval: time-depth is extrapolated over the target.` };
  }
  return { status: 'complete', text: `${cs.length} levels${Number.isFinite(deepestMd) ? ` to ${fmtDepth(deepestMd, unit)} ${unit} MD` : ''}.`, levels: cs.length };
}

/** The committed Seismolord tie of a well (the QC record), or null. */
export function tieRecord(well) {
  const qc = well?.checkshots_derived?.provenance?.qc;
  if (!qc) return null;
  const w = qc.wavelet || null;
  return {
    meanCorr: Number.isFinite(num(qc.mean_corr)) ? num(qc.mean_corr) : null,
    shiftMs: Number.isFinite(num(qc.bulk_shift_ms)) ? num(qc.bulk_shift_ms) : null,
    volume: qc.volume || null,
    wavelet: w ? { peakHz: Number.isFinite(num(w.peak_hz)) ? num(w.peak_hz) : null, phaseDeg: Number.isFinite(num(w.phase_deg)) ? num(w.phase_deg) : null, stored: Array.isArray(w.samples) && w.samples.length >= 5 } : null,
    measuredAt: qc.measured_at || null,
  };
}

// The QI Studio tie thresholds (services/ties.js tieIssues): below 0.5 a
// poor tie, below 0.7 a fair one.
export const TIE_POOR = 0.5;
export const TIE_GOOD = 0.7;

function tieCell(well) {
  const t = tieRecord(well);
  if (!t) return { status: 'missing', text: 'No well tie committed in Seismolord.' };
  const corr = t.meanCorr !== null ? `correlation ${t.meanCorr.toFixed(2)}` : 'correlation not recorded';
  const wav = t.wavelet ? `, wavelet ${t.wavelet.peakHz !== null ? `${t.wavelet.peakHz.toFixed(0)} Hz` : ''}${t.wavelet.phaseDeg !== null ? ` ${t.wavelet.phaseDeg.toFixed(0)} deg` : ''}${t.wavelet.stored ? '' : ' (samples not stored)'}` : ', no wavelet stored';
  const shift = t.shiftMs !== null ? `, bulk shift ${t.shiftMs.toFixed(0)} ms` : '';
  const text = `Tied${t.volume ? ` to ${t.volume}` : ''}: ${corr}${shift}${wav}.`;
  if (t.meanCorr !== null && t.meanCorr < TIE_GOOD) return { status: 'partial', text: `${text} ${t.meanCorr < TIE_POOR ? 'A poor tie' : 'A fair tie'} (QI Studio grades 0.7 and above as good).`, tie: t };
  return { status: 'complete', text, tie: t };
}

function holeCell(fam, interval, samples) {
  const pick = (k) => {
    const l = (fam[k] || [])[0];
    return l && samples[l.id] ? { log: l, values: samples[l.id] } : null;
  };
  const has = (k) => !!(fam[k] || []).length;
  if (!has('cal') && !has('drho')) return { status: 'missing', text: 'No caliper and no density correction: hole condition cannot be judged.' };
  const cal = pick('cal');
  const drho = pick('drho');
  if ((has('cal') && !cal) || (has('drho') && !drho)) {
    return { status: 'pending', pending: true, text: 'Hole condition is judged from the samples, which are being scanned.' };
  }
  const h = holeCondition({ cal, bs: pick('bs'), drho }, interval);
  if (!h || !h.assessed) return { status: 'missing', text: 'The caliper and density correction hold no valid data over the interval.' };
  const bits = (s) => `${s.bitIn.length > 1 ? `${s.bitIn.slice(0, -1).join(', ')} and ${s.bitIn[s.bitIn.length - 1]}` : s.bitIn[0]} in, ${s.bitFrom}`;
  let text;
  if (h.badShare <= 0) {
    const parts = h.sources.map((s) => (s.key === 'caliper' ? `caliper within 1 in of the bit (${bits(s)})` : '|DRHO| within 0.15 g/cc'));
    text = `Good hole over the interval: ${parts.join('; ')}.`;
  } else {
    const parts = h.sources.map((s) => (s.key === 'caliper'
      ? `caliper more than 1 in over the bit on ${pct(s.share)} (${bits(s)})`
      : `|DRHO| above 0.15 g/cc on ${pct(s.share)}`));
    text = `Bad hole over ${pct(h.badShare)} of the interval: ${parts.join('; ')}.`;
  }
  return { status: h.badShare > 0.05 ? 'partial' : 'complete', coverage: 1 - h.badShare, badShare: h.badShare, text, hole: h };
}

/**
 * One well's row.
 * @param {{well, logs, zones, tops}} bundle registry rows
 * @param {{interval?: Object, samples?: Object<string, ArrayLike<number>>, overrides?: Object<string, {status, note}>, unit?: 'ft'|'m'}} opts
 */
export function wellRow(bundle, { interval: spec = { mode: 'well' }, samples = {}, overrides = {}, unit = 'ft' } = {}) {
  const { well, logs = [], zones = [], tops = [] } = bundle;
  const interval = resolveInterval({ logs, zones }, spec);
  const fam = logsByFamily(logs);
  const cells = {};
  for (const col of COLUMNS) {
    let cell;
    if (col.source === 'curve') cell = curveCell(col, fam, interval, samples, unit);
    else if (col.source === 'quality') cell = holeCell(fam, interval, samples);
    else if (col.key === 'datum') cell = datumCell(well);
    else if (col.key === 'survey') cell = surveyCell(well, interval, unit);
    else if (col.key === 'tops') cell = topsCell(tops, zones, interval, spec);
    else if (col.key === 'checkshots') cell = checkshotCell(well, interval, unit);
    else if (col.key === 'tie') cell = tieCell(well);
    else cell = { status: 'unrecorded', text: 'Petrolord holds no record of this; set what the well has.' };
    cells[col.key] = overrideCell({ column: col.key, ...cell }, overrides[col.key]);
  }
  return { wellId: well.id, wellName: well.name, interval, cells, curveCount: logs.filter((l) => familyOrAny(l)).length };
}

const familyOrAny = (l) => !/^(DEPT|DEPTH|MD|TDEP)$/i.test(String(l.mnemonic || '').split(':')[0]);

/** The logs whose samples the scan should read for this well: the best curve per column family, plus caliper, bit size and DRHO. */
export function logsToScan(bundle) {
  const fam = logsByFamily(bundle.logs || []);
  const out = new Map();
  for (const col of COLUMNS) {
    if (col.source !== 'curve') continue;
    for (const k of [col.family, col.alt].filter(Boolean)) for (const l of fam[k] || []) out.set(l.id, l);
  }
  for (const k of ['cal', 'bs', 'drho']) for (const l of fam[k] || []) out.set(l.id, l);
  return [...out.values()];
}
