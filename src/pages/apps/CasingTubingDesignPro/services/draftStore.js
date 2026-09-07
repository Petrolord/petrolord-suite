// Unsaved-work drafts (Casing & Tubing Design Studio, tester fix
// 2026-09-07): the case document is mirrored into browser storage while it
// is dirty, keyed by wellbore and case, and restored when the case is next
// opened if the draft is newer than the saved row and differs from it.
// Pure over an injected storage so it is testable; every storage call is
// guarded because private windows and blocked site data throw.

export const draftKey = (wellboreId, caseId) => `ct-draft:${wellboreId}:${caseId}`;

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

/** Write the draft; returns the timestamp used, or null when storage refused. */
export function writeDraft(storage, wellboreId, caseId, doc, now = Date.now()) {
  if (!storage || !wellboreId || !caseId || !doc) return null;
  const ok = safe(() => { storage.setItem(draftKey(wellboreId, caseId), JSON.stringify({ savedAt: now, doc })); return true; }, false);
  return ok ? now : null;
}

/** @returns {{savedAt: number, doc: Object}|null} */
export function readDraft(storage, wellboreId, caseId) {
  if (!storage || !wellboreId || !caseId) return null;
  const raw = safe(() => storage.getItem(draftKey(wellboreId, caseId)));
  if (!raw) return null;
  const parsed = safe(() => JSON.parse(raw));
  return parsed && parsed.doc && Number.isFinite(parsed.savedAt) ? parsed : null;
}

export function clearDraft(storage, wellboreId, caseId) {
  if (!storage || !wellboreId || !caseId) return;
  safe(() => storage.removeItem(draftKey(wellboreId, caseId)));
}

/**
 * Should this draft replace the saved document? Only when it is newer than
 * the row's last save and actually differs from it (a draft equal to the
 * saved state is noise and is dropped).
 */
export function draftSupersedes(draft, row, savedDoc) {
  if (!draft) return false;
  const rowTime = row?.updated_at ? Date.parse(row.updated_at) : 0;
  if (Number.isFinite(rowTime) && rowTime >= draft.savedAt) return false;
  return JSON.stringify(draft.doc) !== JSON.stringify(savedDoc);
}

/** Every draft key in storage for a wellbore (housekeeping on delete). */
export function draftKeysFor(storage, wellboreId) {
  const out = [];
  const n = safe(() => storage.length, 0);
  for (let i = 0; i < n; i++) {
    const k = safe(() => storage.key(i));
    if (k && k.startsWith(`ct-draft:${wellboreId}:`)) out.push(k);
  }
  return out;
}
