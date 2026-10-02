// Names kept on the record (upgrade U2-013, the part that needs no schema
// change; WS-U1-026). People are shown by name from the organisation list,
// which is only there online and only lists people still in the
// organisation. So that a signed report and a called top still say who,
// offline and years later, the name is also written where an existing
// column can carry it:
//
//   a sign-off     its statement ends "Signed as <name>." (ws_signoffs.statement)
//   an official call  the top_called event of the call carries by_name
//                     (ws_records.payload)
//
// An interpretation of a top has no such column (ws_tops has no free JSON
// or text beside the geologist's own basis); that needs the migration in
// docs/upgrade/WellsiteStudio-UPGRADE.md. The organisation list still wins
// when it knows the person. Pure.

import { memberName } from './members';

const SIGNED_AS = /\s*Signed as (.+?)\.$/;

/** The statement a sign-off stores: what the signer wrote, then who signed. */
export function statementWithName(statement, name) {
  const s = String(statement || '').trim().replace(SIGNED_AS, '');
  const n = String(name || '').trim().replace(/\.$/, '');
  return n ? `${s} Signed as ${n}.` : s;
}

/** The name kept in a sign-off's statement, or null. */
export function nameFromStatement(statement) {
  const m = String(statement || '').match(SIGNED_AS);
  return m ? m[1] : null;
}

/** The statement as the signer wrote it, without the name line. */
export const statementText = (statement) => String(statement || '').replace(SIGNED_AS, '');

/** user id to name, from what the record itself carries (sign-off statements, call events). */
export function namesOnRecord({ signoffs = [], records = [] } = {}) {
  const out = new Map();
  for (const r of records) if (r.created_by && r.payload && typeof r.payload.by_name === 'string' && r.payload.by_name.trim()) out.set(r.created_by, r.payload.by_name.trim());
  for (const s of signoffs) { const n = nameFromStatement(s.statement); if (n && s.user_id) out.set(s.user_id, n); }
  return out;
}

/**
 * The name to show for a user id: the organisation list (or the signed-in
 * user) when it knows the person, else the name the record carries, else
 * the short id.
 */
export function displayName(userId, { people = [], user = null, recordNames = new Map() } = {}) {
  if (!userId) return 'n/a';
  const known = (people || []).some((x) => x.user_id === userId) || !!(user && user.id === userId);
  if (!known && recordNames.has(userId)) return recordNames.get(userId);
  return memberName({ user_id: userId }, people, user);
}
