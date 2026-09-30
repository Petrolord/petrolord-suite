// The chart version every age was entered under (AppUpgrade STRAT-U2-003,
// 2026-09-30). Programme decision: ICS 2026/06 is the default chart; every
// age carries the chart version it was entered under; an age entered under
// an older chart that sits on a boundary the new chart moved is flagged with
// the numeric change (J/K 145.0 to 143.1 Ma) and the user accepts the update
// per project. The stamps live in the existing strat_projects payload (no
// schema change):
//
//   view.ageCharts = { tops:  { <geo_wells_tops id>: { age_ma, hiatus_to_ma } },
//                      units: { <geo_strat_units id>: { age_top_ma, age_base_ma } } }
//
// each value a chart version string. An age with no stamp was entered before
// this build, so under ICS 2023/09 (the only chart the app shipped before).
// The engine (timescale.js ageOnChart) says what the new chart means for it.
// Pure; the workstation writes.

import { TIMESCALE_VERSION, TIMESCALE_V2023, ageOnChart, isTimescaleVersion } from './timescale';

export const LEGACY_CHART = TIMESCALE_V2023;
export const AGE_FIELDS = Object.freeze({ tops: ['age_ma', 'hiatus_to_ma'], units: ['age_top_ma', 'age_base_ma'] });
const FIELD_LABEL = { age_ma: 'age', hiatus_to_ma: 'hiatus end', age_top_ma: 'top age', age_base_ma: 'base age' };

/** The chart an age was entered under: its stamp, else 2023/09 (entered before stamps). */
export function chartOf(stamps, kind, id, field) {
  const v = stamps?.[kind]?.[id]?.[field];
  return typeof v === 'string' && v ? v : LEGACY_CHART;
}

/**
 * Stamps with the given ages set to a chart version (a new object).
 * @param {Object} stamps view.ageCharts
 * @param {Array<{kind: 'tops'|'units', id: string, field: string}>} ages
 */
export function withStamps(stamps, ages, version = TIMESCALE_VERSION) {
  const out = { tops: { ...(stamps?.tops || {}) }, units: { ...(stamps?.units || {}) } };
  for (const a of ages) {
    if (!a?.id || !out[a.kind]) continue;
    out[a.kind][a.id] = { ...(out[a.kind][a.id] || {}), [a.field]: version };
  }
  return out;
}

/** The age fields of a row whose value a patch changes (the ones to stamp). */
export function changedAges(kind, before, patch) {
  const out = [];
  for (const f of AGE_FIELDS[kind]) {
    if (patch?.[f] === undefined) continue;
    const a = before?.[f] == null || before[f] === '' ? null : Number(before[f]);
    const b = patch[f] == null || patch[f] === '' ? null : Number(patch[f]);
    if (b !== null && a !== b) out.push({ kind, id: before?.id, field: f });
  }
  return out;
}

/**
 * Every age that reads differently on the current chart than on the chart it
 * was entered under.
 * @param {{ tops?: Array<{id, name, well_id, age_ma?, hiatus_to_ma?}>, units?: Array<{id, name, age_top_ma?, age_base_ma?}>,
 *   wellName?: (id: string) => string, canEdit?: (kind: string, row: Object) => boolean, stamps?: Object }} p
 * @returns {Array<{kind, id, field, where, value, chart, update: ?Object, stageFrom: ?string, stageTo: ?string, canEdit: boolean, unreadable?: boolean}>}
 */
export function flagAges({ tops = [], units = [], wellName = (id) => id, canEdit = () => true, stamps = {} } = {}) {
  const out = [];
  const look = (kind, row, where) => {
    for (const field of AGE_FIELDS[kind]) {
      const raw = row[field];
      if (raw == null || raw === '' || !Number.isFinite(Number(raw))) continue;
      const value = Number(raw);
      const chart = chartOf(stamps, kind, row.id, field);
      if (chart === TIMESCALE_VERSION) continue;
      const base = { kind, id: row.id, field, where: `${where} ${FIELD_LABEL[field]}`, value, chart, canEdit: !!canEdit(kind, row) };
      if (!isTimescaleVersion(chart)) { out.push({ ...base, update: null, stageFrom: null, stageTo: null, unreadable: true }); continue; }
      const r = ageOnChart(value, chart, TIMESCALE_VERSION);
      if (r.update || (r.stageFrom && r.stageTo && r.stageFrom !== r.stageTo)) out.push({ ...base, ...r });
    }
  };
  for (const t of tops) look('tops', t, `${wellName(t.well_id)} ${t.name}`);
  for (const u of units) look('units', u, `unit ${u.name}`);
  return out;
}

/** One line for a flag: "entered under ICS 2023/09 on the base of the Berriasian (base of the Cretaceous): 145 to 143.1 Ma (-1.9)". */
export function flagText(f) {
  if (f.unreadable) return `stamped ${f.chart}, a chart this build does not read; left as entered`;
  if (f.update) {
    const d = f.update.delta_ma;
    return `entered under ${f.chart} on the ${f.update.label}: ${f.update.from_ma} to ${f.update.to_ma} Ma (${d > 0 ? '+' : ''}${d} Myr) on ${TIMESCALE_VERSION}`;
  }
  return `entered under ${f.chart}; the number stays, but on ${TIMESCALE_VERSION} it falls in the ${f.stageTo} (was ${f.stageFrom})`;
}

/**
 * The writes that accept every flag of a project: each age on a moved
 * boundary takes the new number, every flagged age is stamped with the
 * current chart. Rows the user cannot edit, and an unconformity whose
 * hiatus would no longer end older than its surface, are left and named.
 * @returns {{ writes: Array<{kind, id, patch}>, stamps: Array<{kind, id, field}>, skipped: string[] }}
 */
export function acceptPlan(flags, { tops = [], units = [] } = {}) {
  const byId = { tops: new Map(tops.map((t) => [t.id, t])), units: new Map(units.map((u) => [u.id, u])) };
  const writes = new Map();
  const stamps = [];
  const skipped = [];
  for (const f of flags) {
    if (f.unreadable) { skipped.push(`${f.where} (${f.chart})`); continue; }
    if (!f.canEdit) { skipped.push(`${f.where} (shared with you, read-only; its owner accepts it)`); continue; }
    stamps.push({ kind: f.kind, id: f.id, field: f.field });
    if (!f.update) continue;
    const key = `${f.kind}:${f.id}`;
    const w = writes.get(key) || { kind: f.kind, id: f.id, patch: {} };
    w.patch[f.field] = f.update.to_ma;
    writes.set(key, w);
  }
  const out = [];
  for (const w of writes.values()) {
    const row = byId[w.kind].get(w.id) || {};
    const next = { ...row, ...w.patch };
    const lo = w.kind === 'tops' ? next.age_ma : next.age_top_ma;
    const hi = w.kind === 'tops' ? next.hiatus_to_ma : next.age_base_ma;
    if (lo != null && hi != null && !(Number(hi) > Number(lo))) {
      skipped.push(`${w.kind === 'tops' ? row.name : `unit ${row.name}`} (after the update the ${w.kind === 'tops' ? 'hiatus end' : 'base age'}, ${hi} Ma, would not be older than ${lo} Ma)`);
      for (let i = stamps.length - 1; i >= 0; i--) if (stamps[i].kind === w.kind && stamps[i].id === w.id) stamps.splice(i, 1);
      continue;
    }
    out.push(w);
  }
  return { writes: out, stamps, skipped };
}
