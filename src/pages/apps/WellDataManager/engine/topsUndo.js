// Undo the last tops save on a well (AppUpgrade WDM-U2-016, finding
// WDM-U1-028). A grid save deletes the rows the user removed and a paste
// replaces every top; before this there was no way back. The workstation
// keeps a snapshot of the tops as they were before the save; restoring it
// is planned here as plain per-top writes:
//
//   a top still present (same id) whose fields changed -> updateTop (id kept)
//   a top present now but not in the snapshot          -> deleteTop
//   a snapshot top that is gone                        -> saveTop (NEW id)
//
// Well Correlation references tops by id, so a re-created top is a new
// pick there; the status line says how many were re-created. Pure, no I/O.

export const TOP_FIELDS = ['name', 'md_m', 'interpreter', 'surface_type', 'unit_id', 'confidence', 'age_ma', 'notes', 'hiatus_to_ma'];

const norm = (v) => (v === undefined || v === '' ? null : v);

/**
 * @param {Object[]} current tops on the well now
 * @param {Object[]} snapshot tops before the last save
 * @returns {{updates: {id: string, patch: Object}[], deletes: Object[], creates: Object[], unchanged: number}}
 */
export function planRestore(current, snapshot) {
  const now = new Map((current || []).map((t) => [t.id, t]));
  const was = new Map((snapshot || []).map((t) => [t.id, t]));
  const updates = [];
  const creates = [];
  let unchanged = 0;
  for (const t of snapshot || []) {
    const c = now.get(t.id);
    if (!c) { creates.push(t); continue; }
    const diff = TOP_FIELDS.filter((k) => (k === 'md_m' ? Math.abs(Number(c.md_m) - Number(t.md_m)) > 1e-12 : norm(c[k]) !== norm(t[k])));
    if (!diff.length) { unchanged += 1; continue; }
    const patch = {};
    for (const k of diff) {
      if (k === 'md_m') patch.mdM = Number(t.md_m);
      else patch[k] = norm(t[k]);
    }
    updates.push({ id: t.id, patch });
  }
  const deletes = (current || []).filter((t) => !was.has(t.id));
  return { updates, deletes, creates, unchanged };
}

/** saveTop payload re-creating a snapshot top. */
export const recreatePayload = (t) => ({
  name: t.name, mdM: Number(t.md_m), interpreter: t.interpreter ?? null, surface_type: t.surface_type ?? undefined,
  unit_id: t.unit_id ?? null, confidence: t.confidence ?? null, age_ma: t.age_ma ?? null, notes: t.notes ?? null,
});
