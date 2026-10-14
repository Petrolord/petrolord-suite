// The prognosis a design was reviewed against (2026-10-14, NAPE data
// governance: a change to a decision object tells you which downstream
// outputs need refreshing).
//
// The mud window reads the PP/FP/OBG curves Pore Pressure Studio published
// live, so a republished prognosis used to move the casing seats with
// nothing said. A design now keeps a source reference (src/lib/sourceFreshness,
// kind 'ppfg_prognosis') for the prognosis it was reviewed against: which
// curve rows were published on which well, and what this design saw on its
// trajectory (casing seats at the default margins, the tightest window, the
// highest pore pressure). On open the reference is compared with what is
// published now; a republish (new curve rows) or a deleted prognosis shows
// the shared "Source changed" notice, with what moved on this trajectory.
//
// Stored without a schema change in the design row's tie_on jsonb, beside
// md/inc/azi: tie_on.sources.ppfg = { refs: { 'ppfg:<well id>': ref }, kept: {} }.
// One reference per source well: choosing another well under "Prognosis
// from" is a new reference to record, not a change.
//
// Pure helpers plus one registry reader (readPpfgSource) with injectable
// readers for the tests.

import { sourceRef } from '@/lib/sourceFreshness/model';
import {
  pickPpfgLogs, readyCurve, buildMudWindow, buildMudWindowByTvdss, curvesByTvdss,
  casingSeatsOnWindow, tightestWindowBelow, SEATS_BELOW_TOP_M, DEFAULT_TRIP_PPG, DEFAULT_KICK_PPG,
} from './ppfg';

export const PPFG_SOURCE_KIND = 'ppfg_prognosis';
const FT = 0.3048;

export const ppfgRefKey = (wellId) => `ppfg:${wellId}`;

/**
 * The registry "row" this kind compares: the curves as published, by row.
 * @param {{id: string, name?: string}} well
 * @param {Object<string, {log: object}>} curves loadPpfgCurves / readyCurve output, or raw logs by mnemonic
 * @returns {null|{id, name, updated_at, curves: object[]}} null when neither PP nor FP is published
 */
export function ppfgRowFromCurves(well, curves) {
  const list = [];
  for (const m of ['PP', 'FP', 'OBG']) {
    const c = curves?.[m];
    const log = c?.log || c;
    if (!log || !log.id) continue;
    list.push({
      mnemonic: m,
      log_id: log.id,
      pipeline_version: log.provenance?.pipeline_version || null,
      published_at: log.created_at || null,
    });
  }
  if (!list.some((c) => c.mnemonic === 'PP' || c.mnemonic === 'FP')) return null;
  const times = list.map((c) => c.published_at).filter((t) => t && !Number.isNaN(Date.parse(t))).sort();
  return { id: well.id, name: well.name || null, updated_at: times.length ? times[times.length - 1] : null, curves: list };
}

/**
 * Mud-window rows on a trajectory, the way the panel builds them: the
 * bridged well's curves on its own MD, an offset's by TVDSS.
 * @returns {{rows: object[], note: ?string}}
 */
export function mudWindowRowsFor({ curves, well, bridged, stations, kbElevM = 0 }) {
  if (bridged) return { rows: buildMudWindow(curves, stations, { kbElevM }), note: null };
  const byTvdss = curvesByTvdss(curves, well);
  return { rows: buildMudWindowByTvdss(byTvdss.curves, stations, { kbElevM }), note: byTvdss.error || null };
}

/**
 * What the design sees in the mud window: the bottom-up casing seats at the
 * default margins below the conductor section (the panel's defaults), the
 * tightest window and the highest pore pressure, in metres TVD and ppg EMW.
 */
export function mudWindowSeen(rows, { tripPpg = DEFAULT_TRIP_PPG, kickPpg = DEFAULT_KICK_PPG } = {}) {
  const use = (rows || []).filter((r) => Number.isFinite(r.tvd));
  if (!use.length) return null;
  const fromTvdM = Math.min(...use.map((r) => r.tvd)) + SEATS_BELOW_TOP_M;
  const s = casingSeatsOnWindow(use, { tripPpg, kickPpg, fromTvdM });
  // the tightest window below the same cut-off the seats and the panel summary use
  const tightest = tightestWindowBelow(use, { fromTvdM });
  let maxPp = null;
  for (const r of use) {
    if (r.ppPpg != null && (!maxPp || r.ppPpg > maxPp.ppg)) maxPp = { ppg: r.ppPpg, tvd: r.tvd };
  }
  const round = (v, k) => (Number.isFinite(v) ? Number(v.toFixed(k)) : null);
  return {
    trip_ppg: tripPpg,
    kick_ppg: kickPpg,
    seats: s && !s.error ? s.seats.map((q) => ({ tvd: round(q.tvd, 2), md: round(q.md, 2), mud_ppg: round(q.mudBelowPpg, 3) })) : [],
    tightest: tightest ? { ppg: round(tightest.ppg, 3), tvd: round(tightest.tvd, 2) } : null,
    max_pp: maxPp ? { ppg: round(maxPp.ppg, 3), tvd: round(maxPp.tvd, 2) } : null,
  };
}

/**
 * The reference a design records for the prognosis it shows now.
 * @param {{well: object, curves: object, rows: object[], bridged: boolean, usedAt?: string}} a
 */
export function ppfgReference({ well, curves, rows, bridged, usedAt = new Date().toISOString() }) {
  const row = ppfgRowFromCurves(well, curves);
  if (!row) return null;
  return sourceRef({
    key: ppfgRefKey(well.id),
    kind: PPFG_SOURCE_KIND,
    row,
    name: `The prognosis on ${well.name || 'the source well'}`,
    usedAt,
    extra: { well_name: well.name || null, bridged: !!bridged, seen: mudWindowSeen(rows) },
  });
}

/** The design's prognosis references and keep decisions (tie_on.sources.ppfg). */
export function designPpfgSources(design) {
  const p = design?.tie_on?.sources?.ppfg;
  return {
    refs: p && typeof p.refs === 'object' && p.refs ? p.refs : {},
    kept: p && typeof p.kept === 'object' && p.kept ? p.kept : {},
  };
}

/**
 * A tie_on with the prognosis references replaced, everything else kept.
 * @param {object} tieOn the design's tie_on (or the one about to be saved)
 * @param {{refs: object, kept: object}} ppfg
 */
export function tieOnWithPpfg(tieOn, ppfg) {
  const base = tieOn && typeof tieOn === 'object' ? tieOn : {};
  return { ...base, sources: { ...(base.sources || {}), ppfg: { refs: ppfg.refs || {}, kept: ppfg.kept || {} } } };
}

/** The tie_on Save writes: the solver's tie-on, with the design's references carried over. */
export function tieOnForSave(design, tieOn) {
  const s = design?.tie_on?.sources;
  return s ? { ...tieOn, sources: s } : tieOn;
}

const fmtZ = (m, unit) => `${Math.round(unit === 'ft' ? m / FT : m).toLocaleString('en-GB')} ${unit}`;
const fmtP = (v) => Number(v).toFixed(2);

/**
 * What moved on this trajectory between the prognosis the design was
 * reviewed against (seen at the pull) and the one published now, in words.
 * @param {?object} was ref.seen
 * @param {?object} now mudWindowSeen of the prognosis now published
 * @param {{unit?: 'ft'|'m'}} [o]
 * @returns {string[]}
 */
export function ppfgMoveText(was, now, { unit = 'ft' } = {}) {
  if (!was || !now) return [];
  const out = [];
  const tol = 0.5; // metres
  const a = was.seats || [];
  const b = now.seats || [];
  const gone = [];
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    const p = a[k]; const q = b[k];
    if (p && q) {
      if (Math.abs(p.tvd - q.tvd) > tol) out.push(`shoe ${k + 1} at least TVD ${fmtZ(p.tvd, unit)} to ${fmtZ(q.tvd, unit)}`);
    } else if (q) {
      out.push(`a new shoe ${k + 1} at least TVD ${fmtZ(q.tvd, unit)}`);
    } else if (p) {
      gone.push(k + 1);
    }
  }
  if (gone.length) {
    const names = gone.length === 1 ? `shoe ${gone[0]}` : `shoes ${gone.slice(0, -1).join(', ')} and ${gone[gone.length - 1]}`;
    out.push(`${names} no longer needed`);
  }
  if (a.length && b.length && !out.length) out.push('casing seats unchanged');
  const pair = (label, x, y) => {
    if (!x || !y) return;
    if (Math.abs(x.ppg - y.ppg) < 0.005 && Math.abs(x.tvd - y.tvd) <= tol) return;
    out.push(Math.abs(x.tvd - y.tvd) <= tol
      ? `${label} ${fmtP(x.ppg)} to ${fmtP(y.ppg)} ppg`
      : `${label} ${fmtP(x.ppg)} ppg at TVD ${fmtZ(x.tvd, unit)} to ${fmtP(y.ppg)} ppg at TVD ${fmtZ(y.tvd, unit)}`);
  };
  pair('highest pore pressure', was.max_pp, now.max_pp);
  pair('tightest window', was.tightest, now.tightest);
  return out;
}

export const PPFG_REFRESH_EFFECT = 'The mud window shows the prognosis published now. Refresh from source records it as the one this design is reviewed against.';

/**
 * The notice items with "What moved" on this trajectory. Once the mud window
 * has loaded the changed well's prognosis (`panelSeen`, mudWindowSeen of the
 * rows it shows), that is what the record is compared with; before, the
 * registry read's own summary (none when the trajectory was not compiled at
 * the read), and with neither the kit's generic words stay.
 * @param {object[]} items useSourceFreshness items
 * @param {{rowFor?: function(string): ?object, panelSeen?: ?{wellId: string, seen: object}, unit?: 'ft'|'m'}} o
 */
export function ppfgNoticeItems(items, { rowFor = () => null, panelSeen = null, unit = 'ft' } = {}) {
  return (items || []).map((i) => {
    const seenNow = panelSeen && panelSeen.wellId === i.ref?.id ? panelSeen.seen : rowFor(i.key)?.seen;
    const moved = i.status === 'changed' ? ppfgMoveText(i.ref?.seen, seenNow, { unit }) : [];
    return {
      ...i,
      differences: moved.length ? moved : i.differences,
      effect: i.status === 'changed' ? PPFG_REFRESH_EFFECT : null,
    };
  });
}

/** One line for a design whose reference matches what is published. */
export function reviewedText(ref, { unit = 'ft' } = {}) {
  if (!ref) return null;
  const when = ref.updated_at ? `${new Date(ref.updated_at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null;
  const seats = ref.seen?.seats || [];
  const shoes = seats.length
    ? `; casing seats then at TVD ${seats.map((s) => fmtZ(s.tvd, unit).replace(` ${unit}`, '')).join(', ')} ${unit}`
    : '';
  return `This design was reviewed against ${ref.name ? ref.name.replace(/^The /, 'the ') : 'a published prognosis'}${when ? `, published ${when}` : ''}${shoes}.`;
}

/**
 * The prognosis published now for a reference, as the freshness hook reads
 * it: the row (with `seen` on this trajectory when the stations are known),
 * null when no PP or FP curve is published there any more.
 * @param {object} ref
 * @param {{stations?: object[], kbElevM?: number}} ctx
 * @param {{listLogs: Function, downloadCurve: Function, getWell: Function}} readers
 */
export async function readPpfgSource(ref, { stations = null, kbElevM = 0 } = {}, readers) {
  const logs = await readers.listLogs(ref.id);
  const picked = pickPpfgLogs(logs);
  const well = { id: ref.id, name: ref.well_name || null };
  const row = ppfgRowFromCurves(well, picked);
  if (!row) return null;
  if (!Array.isArray(stations) || stations.length < 2) return row;
  try {
    const curves = {};
    for (const [m, log] of Object.entries(picked)) curves[m] = readyCurve(log, await readers.downloadCurve(log));
    const full = ref.bridged ? well : await readers.getWell(ref.id);
    const { rows } = mudWindowRowsFor({ curves, well: full, bridged: !!ref.bridged, stations, kbElevM });
    return { ...row, seen: mudWindowSeen(rows) };
  } catch {
    return row; // what moved is a nicety; the change itself is known
  }
}
