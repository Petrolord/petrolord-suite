// Project Data Inventory: what a user adds to the auto-built inventory, and
// how it is saved inside the host app's existing project payload (QI Studio:
// the saved_qi_studio_projects inputs; Petrophysics Studio: the
// interpretation's facies._dataInventory sibling, the _rules/_scenarios
// pattern). No table of its own, so no migration. Pure.
//
// Shape (version 1):
//   interval  { mode: 'well' } | { mode: 'zones', names: string[] }
//   cells     { [wellId]: { [columnKey]: { status, note } } }
//   remarks   { [wellId]: string }
//   manual    [{ id, kind, title, well, state, source, date, note }]
//   notes     { [ruleId]: { dismissed: boolean, comment: string } }

import { COLUMN_BY_KEY } from './columns';
import { MANUAL_STATE_BY_KEY } from './status';

export const STATE_VERSION = 1;

export const MANUAL_KINDS = Object.freeze([
  { key: 'fwr', label: 'Final well report', tag: 'well' },
  { key: 'mudlog', label: 'Mud log', tag: 'well' },
  { key: 'core', label: 'Core report (RCA or SCAL)', tag: 'core' },
  { key: 'swc', label: 'Sidewall core description', tag: 'core' },
  { key: 'pressure', label: 'Formation pressure data (RFT, MDT)', tag: 'pressure' },
  { key: 'pvt', label: 'PVT or fluid sample report', tag: 'pvt' },
  { key: 'biostrat', label: 'Biostratigraphy report', tag: 'well' },
  { key: 'plt', label: 'Production log or well test report', tag: 'production' },
  { key: 'acq', label: 'Seismic acquisition report', tag: 'seismic' },
  { key: 'proc', label: 'Seismic processing report', tag: 'seismic' },
  { key: 'velocity', label: 'Velocity data (stacking or migration)', tag: 'velocity' },
  { key: 'study', label: 'Previous study or interpretation report', tag: 'study' },
  { key: 'other', label: 'Other', tag: 'other' },
]);
export const MANUAL_KIND_BY_KEY = Object.freeze(Object.fromEntries(MANUAL_KINDS.map((k) => [k.key, k])));

const OVERRIDES = new Set(['external', 'notAcquired', 'partial', 'missing']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');

export const blankInventoryState = () => ({ v: STATE_VERSION, interval: null, cells: {}, remarks: {}, manual: [], notes: {} });

/** A saved value back to the shape, dropping anything unknown or malformed. */
export function sanitiseInventoryState(raw) {
  const s = isObj(raw) ? raw : {};
  const out = blankInventoryState();
  if (isObj(s.interval)) {
    if (s.interval.mode === 'zones' && Array.isArray(s.interval.names)) {
      const names = s.interval.names.filter((n) => typeof n === 'string' && n).slice(0, 50);
      out.interval = names.length ? { mode: 'zones', names } : null;
    } else if (s.interval.mode === 'well') out.interval = { mode: 'well' };
  }
  if (isObj(s.cells)) {
    for (const [wellId, cols] of Object.entries(s.cells)) {
      if (!isObj(cols)) continue;
      const clean = {};
      for (const [k, c] of Object.entries(cols)) {
        if (!COLUMN_BY_KEY[k] || !isObj(c)) continue;
        const status = OVERRIDES.has(c.status) ? c.status : null;
        const note = str(c.note);
        if (status || note) clean[k] = { status: status || 'auto', note };
      }
      if (Object.keys(clean).length) out.cells[wellId] = clean;
    }
  }
  if (isObj(s.remarks)) for (const [k, v] of Object.entries(s.remarks)) if (str(v)) out.remarks[k] = str(v);
  if (Array.isArray(s.manual)) {
    out.manual = s.manual.filter(isObj).slice(0, 200).map((m) => ({
      id: str(m.id, 80) || `m-${Math.random().toString(36).slice(2, 9)}`,
      kind: MANUAL_KIND_BY_KEY[m.kind] ? m.kind : 'other',
      title: str(m.title, 200),
      well: str(m.well, 120),
      state: MANUAL_STATE_BY_KEY[m.state] ? m.state : 'received',
      source: str(m.source, 200),
      date: /^\d{4}-\d{2}-\d{2}$/.test(m.date || '') ? m.date : '',
      note: str(m.note, 600),
    }));
  }
  if (isObj(s.notes)) {
    for (const [k, n] of Object.entries(s.notes)) {
      if (!isObj(n)) continue;
      const comment = str(n.comment, 600);
      if (n.dismissed || comment) out.notes[k] = { dismissed: !!n.dismissed, comment };
    }
  }
  return out;
}

/** True when nothing has been added (the host can then omit it from its payload). */
export const isBlankInventoryState = (s) => {
  const c = sanitiseInventoryState(s);
  return !c.interval && !Object.keys(c.cells).length && !Object.keys(c.remarks).length && !c.manual.length && !Object.keys(c.notes).length;
};

// --- edits (each returns a new state) -----------------------------------
export function setCellOverride(state, wellId, column, patch) {
  const s = sanitiseInventoryState(state);
  const cur = s.cells[wellId]?.[column] || { status: 'auto', note: '' };
  const next = { ...cur, ...patch };
  const cells = { ...s.cells, [wellId]: { ...(s.cells[wellId] || {}), [column]: next } };
  return sanitiseInventoryState({ ...s, cells });
}
export const setRemark = (state, wellId, text) => sanitiseInventoryState({ ...state, remarks: { ...(state?.remarks || {}), [wellId]: text } });
export const setInterval = (state, interval) => sanitiseInventoryState({ ...state, interval });
export function upsertManual(state, row) {
  const s = sanitiseInventoryState(state);
  const id = row.id || `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const list = s.manual.slice();
  const at = list.findIndex((m) => m.id === id);
  if (at >= 0) list[at] = { ...list[at], ...row, id }; else list.push({ ...row, id });
  return sanitiseInventoryState({ ...s, manual: list });
}
export const removeManual = (state, id) => sanitiseInventoryState({ ...state, manual: (state?.manual || []).filter((m) => m.id !== id) });
export const setNote = (state, ruleId, patch) => {
  const s = sanitiseInventoryState(state);
  return sanitiseInventoryState({ ...s, notes: { ...s.notes, [ruleId]: { ...(s.notes[ruleId] || { dismissed: false, comment: '' }), ...patch } } });
};

/** Whether the manual list holds a received or loaded item of this tag (core, pressure, pvt, seismic, velocity). */
export function manualHas(state, tag) {
  return (state?.manual || []).some((m) => MANUAL_KIND_BY_KEY[m.kind]?.tag === tag && ['received', 'loaded', 'incomplete'].includes(m.state));
}
