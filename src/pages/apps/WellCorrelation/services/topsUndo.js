// Undo for tops edits (AppUpgrade WC-U2-007): a session stack of the edits
// this app wrote to the shared geo_wells_tops rows (drag, pick, propagate,
// rename, delete). Each entry holds what is needed to put the rows back.
// Before undoing, the rows are read again: an edit made since in another app
// (Petrophysics, Well Data Manager) is never overwritten; the undo is
// refused with the reason instead.

export const UNDO_LIMIT = 50;

const TOP_FIELDS = ['name', 'interpreter', 'surface_type', 'unit_id', 'confidence', 'age_ma', 'notes', 'hiatus_to_ma'];

/** The saveTop input that recreates a deleted row with every attribute. */
export function recreateInput(row) {
  const out = { name: row.name, mdM: row.md_m };
  for (const k of TOP_FIELDS) if (k !== 'name' && row[k] !== undefined && row[k] !== null) out[k] = row[k];
  return out;
}

/** @returns {Object} entry: {kind, label, ...} */
export const undoEntry = {
  move: (top, fromMd, toMd, label) => ({ kind: 'move', label, topId: top.id, wellId: top.well_id, name: top.name, fromMd, toMd }),
  create: (rows, label) => ({ kind: 'create', label, rows: rows.map((r) => ({ ...r })) }),
  rename: (rows, from, to, label) => ({ kind: 'rename', label, from, to, rows: rows.map((r) => ({ id: r.id, well_id: r.well_id })) }),
  remove: (rows, label) => ({ kind: 'delete', label, rows: rows.map((r) => ({ ...r })) }),
};

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

/**
 * Put the rows back. listTops reads the registry now.
 * @returns {Promise<{wellIds: string[], remap: Object<string,string>, skipped: string[]}>}
 */
export async function applyUndo(entry, backend) {
  const wellIds = new Set();
  const remap = {};
  const skipped = [];
  const current = async (wellId, id) => (await backend.listTops(wellId)).find((t) => t.id === id) || null;
  if (entry.kind === 'move') {
    const now = await current(entry.wellId, entry.topId);
    if (!now) skipped.push(`${entry.name} is no longer on that well`);
    else if (!near(now.md_m, entry.toMd)) skipped.push(`${entry.name} was moved again since (now at ${Number(now.md_m).toFixed(2)} m MD)`);
    else { await backend.updateTop(entry.topId, { mdM: entry.fromMd }); wellIds.add(entry.wellId); }
  } else if (entry.kind === 'create') {
    for (const r of entry.rows) {
      const now = await current(r.well_id, r.id);
      if (!now) { skipped.push(`${r.name} was already removed`); continue; }
      if (!near(now.md_m, r.md_m) || now.name !== r.name) { skipped.push(`${r.name} was edited since and was kept`); continue; }
      await backend.deleteTop(now);
      wellIds.add(r.well_id);
    }
  } else if (entry.kind === 'rename') {
    for (const r of entry.rows) {
      const now = await current(r.well_id, r.id);
      if (!now || now.name !== entry.to) { skipped.push(`a ${entry.to} top was changed since and was kept`); continue; }
      await backend.updateTop(r.id, { name: entry.from });
      wellIds.add(r.well_id);
    }
  } else if (entry.kind === 'delete') {
    for (const r of entry.rows) {
      const tops = await backend.listTops(r.well_id);
      if (tops.some((t) => t.name === r.name)) { skipped.push(`${r.name} exists again on that well`); continue; }
      const row = await backend.saveTop(r.well_id, recreateInput(r));
      if (row?.id) remap[r.id] = row.id;
      wellIds.add(r.well_id);
    }
  }
  return { wellIds: [...wellIds], remap, skipped };
}

/** Entries left on the stack, their top ids moved to the recreated rows. */
export function remapStack(stack, remap) {
  if (!Object.keys(remap).length) return stack;
  const id = (x) => remap[x] || x;
  return stack.map((e) => (e.kind === 'move'
    ? { ...e, topId: id(e.topId) }
    : { ...e, rows: e.rows.map((r) => ({ ...r, id: id(r.id) })) }));
}
