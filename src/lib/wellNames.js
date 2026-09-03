// One well name per registry (owner rule 2026-09-03): the pure rule and
// its normaliser, shared by the live registry (saveWell / updateWell), the
// in-memory harness backends, and the .pld importer, which must pick a
// free name BEFORE inserting now that geo_wells_owner_name_uniq is live.
// No I/O here so anything can import it, tests included.

/** Normalised key for well-name uniqueness: trimmed, inner whitespace
 *  collapsed, case-folded. "Well 1", "well  1" and " WELL 1 " collide. */
export const wellNameKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * @param {string} name        candidate name
 * @param {Array<{id: string, name: string, user_id?: string}>} wells
 *   the wells visible to the caller (own + shared)
 * @param {{exceptId?: ?string, userId?: ?string}} [opts]
 *   exceptId: the well being renamed (its own row is not a clash);
 *   userId: caller id, used only to word the message
 * @returns {?string} a user-facing error message, or null when free
 */
export function wellNameClashMessage(name, wells, { exceptId = null, userId = null } = {}) {
  const key = wellNameKey(name);
  if (!key) return 'The well needs a name.';
  const clash = (wells || []).find((w) => w && w.id !== exceptId && wellNameKey(w.name) === key);
  if (!clash) return null;
  const own = !userId || !clash.user_id || clash.user_id === userId;
  return own
    ? `A well named "${clash.name}" already exists in your registry. Give this well a different name, or add the data to the existing well.`
    : `A well named "${clash.name}" is already shared with you by a teammate. Give this well a different name so the two can be told apart.`;
}

/**
 * First free variant of `name` against a set of taken keys: the name
 * itself, then "<name> (imported)", "<name> (imported 2)", ... The suffix
 * is spelled out rather than a bare counter so a restored copy is
 * recognisable in every app's well list.
 * @param {string} name
 * @param {Set<string>} takenKeys  wellNameKey() values already in use
 * @param {string} [tag='imported']
 */
export function freeWellName(name, takenKeys, tag = 'imported') {
  const base = String(name ?? '').trim().replace(/\s+/g, ' ') || 'Well';
  if (!takenKeys.has(wellNameKey(base))) return base;
  for (let n = 1; n < 1000; n++) {
    const cand = n === 1 ? `${base} (${tag})` : `${base} (${tag} ${n})`;
    if (!takenKeys.has(wellNameKey(cand))) return cand;
  }
  return `${base} (${tag} ${Date.now()})`;
}
