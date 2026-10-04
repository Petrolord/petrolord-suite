/**
 * The bottomhole pressure match of a history run (SIM-U2-001, RL6, RL8):
 * per well, the simulated WBHP against the observed bottomhole pressure the
 * deck carried (WCONHIST item 10, reported by the simulator as WBHPH), at
 * every simulator time step of the history phase where an observation was
 * given; the residual is simulated minus observed.
 *
 * Where the observations come from. OPM Flow 2026.04 carries the last
 * observed BHP forward through a history period that gives none (seen in the
 * isolated worker gate, test_u2_deck.py), so WBHPH alone cannot tell an
 * observation from a repeat. The saved builder form that made the deck that
 * ran (same SHA-256) knows which periods were observed: it is the source
 * when it applies, and the run's WBHPH, when the worker kept it, is checked
 * against it (the simulator read the pressures as written). For a deck the
 * builder did not make, WBHPH is the source and the report says that a
 * period without an observation repeats the previous one. A time step after
 * the history end is a prediction and is never matched; a zero or blank
 * WBHPH (before the first observation) is no observation.
 *
 * Pure.
 */
import { vectorView } from './simUnits.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Root mean square of residuals. */
export const rms = (r) => (r.length ? Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length) : null);

/** The observation of a well at a simulator day from the form's history periods: { bhp (psia), k (period) } or null. */
function formObservation(periods, endDate, startIso, well, day) {
  const t0 = Date.parse(`${startIso}T00:00:00Z`);
  const t = t0 + day * 86400000;
  for (let i = 0; i < periods.length; i += 1) {
    const a = Date.parse(`${periods[i].date}T00:00:00Z`);
    const b = Date.parse(`${(i + 1 < periods.length ? periods[i + 1].date : endDate)}T00:00:00Z`);
    if (t > a && t <= b + 1e-3) {
      const row = [...(periods[i].prod || []), ...(periods[i].inj || [])].find((r) => r.name === well);
      return row && finite(Number(row.bhp)) && Number(row.bhp) > 0 ? { bhp: Number(row.bhp), k: i } : null;
    }
  }
  return null;
}

/**
 * @param {{summary: object, opts: {deckSystem: string, system: string}, historyEnd?: ?string,
 *   form?: ?object, formApplies?: boolean}} a
 * @returns {{applies: boolean, source: ?('WBHPH'|'form'), reason: ?string, unit: string,
 *   wells: Array<{well: string, points: number, obsMin: number, obsMax: number, rms: number, bias: number, maxAbs: number, pairs: Array<{day: number, sim: number, obs: number}>}>,
 *   overall: ?{points: number, rms: number, wells: number}}}
 */
export function bhpMatch({ summary, opts, historyEnd = null, form = null, formApplies = false }) {
  const view = vectorView('WBHP', opts.deckSystem, opts.system);
  const unit = view.label;
  const empty = (reason) => ({ applies: false, source: null, reason, unit, wells: [], overall: null });
  const wells = summary?.wells || {};
  const days = summary?.days || [];
  const start = String(summary?.start_date || '').slice(0, 10);
  const endDay = historyEnd && start ? (Date.parse(`${historyEnd}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 : Infinity;
  const fromSummary = Object.keys(wells).some((w) => Array.isArray(wells[w].WBHPH) && wells[w].WBHPH.some((v) => finite(v) && v > 0));
  const periods = formApplies && form?.history?.enabled && Array.isArray(form.history.periods) ? form.history.periods : null;
  const formHas = !!periods?.some((p) => [...(p.prod || []), ...(p.inj || [])].some((r) => finite(Number(r.bhp)) && Number(r.bhp) > 0));
  if (!fromSummary && !formHas) {
    return empty(Object.keys(wells).some((w) => Array.isArray(wells[w].WBHPH))
      ? 'The deck asks for WBHPH but carries no observed pressure in its history.'
      : 'The deck carries no observed bottomhole pressure (no WBHPH): add a bhp column to the per-well history file on the Builder tab.');
  }
  const source = formHas ? 'form' : 'WBHPH';
  // the form's pressures are psia; the run's WBHPH is in the deck's unit system
  const obsConv = source === 'WBHPH' ? view.convert : vectorView('WBHP', 'FIELD', opts.system).convert;
  const out = [];
  let echoN = 0; let echoOff = 0;
  for (const [well, entry] of Object.entries(wells)) {
    if (!Array.isArray(entry.WBHP)) continue;
    // one point per observation: the observed pressure of a period against the
    // simulated WBHP averaged over the period's time steps (time weighted), so
    // a period the simulator cut into many short steps counts once
    const groups = new Map();
    let prevDay = 0;
    let run = -1; let last = null;
    days.forEach((day, i) => {
      const dt = day - prevDay;
      prevDay = day;
      if (day > endDay + 1e-6 || !finite(entry.WBHP[i])) return;
      let raw = null; let key = null;
      if (source === 'WBHPH') {
        raw = entry.WBHPH?.[i];
        if (!finite(raw) || raw <= 0) { last = null; return; }
        if (raw !== last) { run += 1; last = raw; }
        key = run;
      } else {
        const o = formObservation(periods, form.history.endDate, start, well, day);
        if (!o) return;
        raw = o.bhp; key = o.k;
        const h = entry.WBHPH?.[i];
        if (fromSummary && Array.isArray(entry.WBHPH) && finite(h)) {
          echoN += 1;
          if (Math.abs(h - raw) > 0.011 + 1e-6 * raw) echoOff += 1;
        }
      }
      const g = groups.get(key) || { obs: obsConv(raw), simDt: 0, dt: 0, day, steps: 0 };
      g.simDt += view.convert(entry.WBHP[i]) * dt;
      g.dt += dt;
      g.day = day;
      g.steps += 1;
      groups.set(key, g);
    });
    const pairs = [...groups.values()].filter((g) => g.dt > 0).map((g) => ({ day: g.day, sim: g.simDt / g.dt, obs: g.obs, steps: g.steps }));
    if (!pairs.length) continue;
    const res = pairs.map((p) => p.sim - p.obs);
    out.push({
      well,
      points: pairs.length,
      obsMin: Math.min(...pairs.map((p) => p.obs)),
      obsMax: Math.max(...pairs.map((p) => p.obs)),
      rms: rms(res),
      bias: res.reduce((s2, x) => s2 + x, 0) / res.length,
      maxAbs: Math.max(...res.map(Math.abs)),
      pairs,
    });
  }
  if (!out.length) return empty('No time step of the history phase has both an observed and a simulated bottomhole pressure.');
  const all = out.flatMap((w) => w.pairs.map((p) => p.sim - p.obs));
  // the form is the source and the run kept WBHPH: did the simulator read the pressures as written (every step)?
  const echo = source === 'form' && fromSummary ? { checked: echoN, differ: echoOff } : null;
  return {
    applies: true,
    source,
    reason: null,
    unit,
    wells: out,
    overall: { points: all.length, rms: rms(all), wells: out.length },
    echo,
  };
}
