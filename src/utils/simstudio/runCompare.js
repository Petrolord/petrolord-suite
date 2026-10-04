/**
 * Run compare (SIM-U2-005, RL6, RL12): two or more completed runs of a case
 * side by side, on the calendar axis, with a difference table against the
 * first run picked (the base). One model for the Results tab and the report.
 *
 * Every number is the run's own: the last value of a summary vector, or a
 * cumulative integrated from the simulator's step rates when the summary
 * holds no cumulative for it (each rate holds over its time step; for oil
 * this equals the run's FOPT, gated in simForecastContract.test.js). A
 * thinned series is never integrated: the quantity is then not available.
 * Each run is read in its own deck unit system and shown in the display
 * system.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { fieldRows, summaryUnitSystem, lastValue, dayToIso, pairs } from './series.js';
import { simUnits, vectorView } from './simUnits.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The vectors the overlay offers, in order. */
export const COMPARE_VECTORS = Object.freeze(['FOPR', 'FPR', 'FWCT', 'FGOR', 'FWPR', 'FGPR', 'FOPT', 'FWIR']);

/** A cumulative of a run in display units: the summary's own, or the step rates integrated. */
function cumulative(summary, cumKey, rateKey, opts) {
  const lv = lastValue(summary, cumKey, opts);
  if (lv) return { value: lv.value, how: cumKey };
  const stride = Number(summary?.steps?.stride) || 1;
  const rates = summary?.field?.[rateKey];
  if (!Array.isArray(rates) || stride > 1) return { value: null, how: Array.isArray(rates) ? `${rateKey} is thinned` : `${rateKey} not in the summary` };
  const v = vectorView(rateKey, opts.deckSystem, opts.system);
  // a rate per day times days is a volume in the matching volume unit (STB/d to STB, sm3/d to sm3, Mscf/d to Mscf)
  let total = 0;
  let prev = 0;
  (summary.days || []).forEach((d, i) => { const r = rates[i]; if (finite(r)) total += v.convert(r) * (d - prev); prev = d; });
  return { value: total, how: `${rateKey} integrated over the time steps` };
}

/** The quantities of one run, in display units. */
export function runQuantities(summary, system = 'oilfield') {
  const us = summaryUnitSystem(summary, null);
  const opts = { deckSystem: us.system, system };
  const at = (key) => lastValue(summary, key, opts);
  const mb = summary?.diagnostics?.material_balance;
  return {
    opts,
    deckSystem: us.system,
    end: summary?.days?.length ? dayToIso(summary, summary.days[summary.days.length - 1]) : null,
    oil: cumulative(summary, 'FOPT', 'FOPR', opts),
    water: cumulative(summary, 'FWPT', 'FWPR', opts),
    gas: cumulative(summary, 'FGPT', 'FGPR', opts),
    waterInjected: cumulative(summary, 'FWIT', 'FWIR', opts),
    oilRateEnd: at('FOPR')?.value ?? null,
    pressureEnd: at('FPR')?.value ?? null,
    waterCutEnd: at('FWCT')?.value ?? null,
    gorEnd: at('FGOR')?.value ?? null,
    balance: mb?.computed ? (mb.closes ? 'closes' : 'does not close') : 'not reported',
  };
}

const ROWS = [
  ['Cumulative oil produced', 'oil', 'oilVolume', 0],
  ['Cumulative water produced', 'water', 'waterVolume', 0],
  ['Cumulative gas produced', 'gas', 'gasVolume', 0],
  ['Cumulative water injected', 'waterInjected', 'waterVolume', 0],
  ['Oil rate at the end', 'oilRateEnd', 'oilRate', 0],
  ['Field pressure at the end', 'pressureEnd', 'pressure', 0],
  ['Water cut at the end', 'waterCutEnd', 'fraction', 3],
  ['GOR at the end', 'gorEnd', 'gor', 3],
];

const fx = (v, d) => (finite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);

/** A short label for a run: "1a2b3c4d, 2026-10-04 10:00". */
export const runLabel = (run) => `${String(run?.id || '').slice(0, 8)}, ${String(run?.finished_at || run?.queued_at || '').slice(0, 19).replace('T', ' ') || EMPTY_VALUE}`;

/**
 * @param {{entries: Array<{run: object, summary: object}>, system?: string}} a the first entry is the base
 * @returns {{ok: boolean, reason?: string, head?: string[], rows?: string[][], runs?: object[], notes?: string[]}}
 */
export function compareRuns({ entries, system = 'oilfield' }) {
  const list = (entries || []).filter((e) => e?.run && e?.summary);
  if (list.length < 2) return { ok: false, reason: 'Pick two or more completed runs of the case to compare them.' };
  const u = simUnits(system);
  const q = list.map((e) => ({ ...e, q: runQuantities(e.summary, system) }));
  const base = q[0];
  const head = ['Quantity', 'Unit', ...q.map((e, i) => `${i === 0 ? 'Base ' : ''}${runLabel(e.run)}`), ...q.slice(1).map((e) => `Difference ${String(e.run.id).slice(0, 8)} minus base`)];
  const rows = ROWS.map(([label, key, kind, d]) => {
    const val = (e) => (typeof e.q[key] === 'object' && e.q[key] !== null ? e.q[key].value : e.q[key]);
    const b = val(base);
    return [
      label, kind === 'fraction' ? 'fraction' : u.label(kind),
      ...q.map((e) => fx(val(e), d)),
      ...q.slice(1).map((e) => {
        const v = val(e);
        if (!finite(v) || !finite(b)) return EMPTY_VALUE;
        const diff = v - b;
        return `${diff >= 0 ? '+' : ''}${fx(diff, d)}${b !== 0 && kind !== 'fraction' ? ` (${diff >= 0 ? '+' : ''}${((diff / Math.abs(b)) * 100).toFixed(1)} percent)` : ''}`;
      }),
    ];
  });
  rows.push(['End of the run', '', ...q.map((e) => e.q.end || EMPTY_VALUE), ...q.slice(1).map(() => EMPTY_VALUE)]);
  rows.push(['Material balance', '', ...q.map((e) => e.q.balance), ...q.slice(1).map(() => EMPTY_VALUE)]);
  rows.push(['Deck', '', ...q.map((e, i) => (i === 0 ? `SHA-256 ${String(e.run.deck_sha256 || e.summary.deck_sha256 || EMPTY_VALUE).slice(0, 12)}` : (e.run.deck_sha256 && e.run.deck_sha256 === base.run.deck_sha256 ? 'the same deck as the base' : `another deck, SHA-256 ${String(e.run.deck_sha256 || e.summary.deck_sha256 || EMPTY_VALUE).slice(0, 12)}`))), ...q.slice(1).map(() => EMPTY_VALUE)]);
  const notes = [];
  for (const e of q) {
    for (const k of ['oil', 'water', 'gas', 'waterInjected']) {
      if (e.q[k]?.how && !/^F[OWG][PI]T$/.test(e.q[k].how) && finite(e.q[k].value)) notes.push(`${runLabel(e.run)}: ${k === 'waterInjected' ? 'water injected' : k} is the ${e.q[k].how} (the summary holds no cumulative).`);
    }
  }
  if (q.some((e) => e.q.deckSystem !== base.q.deckSystem)) notes.push('The runs are in different deck unit systems; each is converted to the display units.');
  return { ok: true, head, rows, runs: q, notes: [...new Set(notes)] };
}

/** Overlay series of one vector across the runs: [{ name, pts: [[t, y]] }] in display units, and the unit. */
export function compareSeries(entries, key, system = 'oilfield') {
  const out = [];
  let unit = '';
  for (const e of entries || []) {
    if (!e?.summary || !Array.isArray(e.summary.field?.[key])) continue;
    const us = summaryUnitSystem(e.summary, null);
    unit = vectorView(key, us.system, system).label;
    out.push({ name: runLabel(e.run), runId: e.run.id, pts: pairs(fieldRows(e.summary, key, { deckSystem: us.system, system }), 'value') });
  }
  return { unit, series: out };
}
