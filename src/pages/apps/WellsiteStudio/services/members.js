// Well membership (spec section 9): who may read and write a live well and
// in which role. The creator becomes the first administrator (the bootstrap
// trigger); an administrator of the well, or an organisation administrator,
// adds the rest from the organisation. Members are never deleted: a member
// who leaves is made inactive so the record of who wrote what keeps its
// names. Changes are online only because membership is what the server's
// row level security checks.

import { WS_ROLES } from './vocab';

const ROLE_CODES = WS_ROLES.map((r) => r.code);
const ORG_ADMIN_ROLES = ['admin', 'org_admin', 'owner', 'super_admin'];

/** May this user change the members of the well (ws_can_admin on the server)? */
export function canManageMembers(user, members) {
  if (!user) return false;
  if (ORG_ADMIN_ROLES.includes(user.org_role)) return true;
  return (members || []).some((m) => m.user_id === user.id && m.status === 'active' && m.role === 'administrator');
}

/**
 * Why a membership change is refused, or null when it may go ahead.
 * A well always keeps one active administrator, so nobody locks the well
 * out of its settings by demoting or deactivating the last one.
 */
export function memberChangeError(members, { userId, role, status = 'active' }) {
  if (!userId) return 'Choose a person first.';
  if (!ROLE_CODES.includes(role)) return `Unknown role ${role}.`;
  if (!['active', 'inactive'].includes(status)) return `Unknown member status ${status}.`;
  const otherAdmins = (members || []).filter((m) => m.user_id !== userId && m.status === 'active' && m.role === 'administrator').length;
  const staysAdmin = status === 'active' && role === 'administrator';
  if (!otherAdmins && !staysAdmin) return 'A well keeps at least one active administrator. Make someone else administrator first.';
  return null;
}

/** Display name of a member from the organisation list; the short user id when offline or unknown. */
export function memberName(member, people, currentUser) {
  const p = (people || []).find((x) => x.user_id === member.user_id);
  if (p) return p.name;
  if (currentUser && currentUser.id === member.user_id) return currentUser.name || currentUser.email || 'You';
  return `User ${String(member.user_id).slice(0, 8)}`;
}
