// Sharing for the /dev harnesses and the apps' in-memory backends: one
// signed-out "you" in a small organisation with one colleague, on the
// in-memory mirror of the database (./memoryDb). The harness shows the same
// control and the same refusals as production with the migration applied.

import { makeSharingDb } from './memoryDb';
import { makeSharingStore, memoryTransport } from './store';

export const HARNESS_ME = 'user-dev';
export const HARNESS_COLLEAGUE = 'user-colleague';
export const HARNESS_ORG = 'org-dev';

/**
 * @param {{ me?: string, applied?: boolean, inOrganisation?: boolean, members?: Object }} opts
 *   members: more people, user id -> { orgId, name } (a harness that already
 *   has its own second user)
 * @returns {{ db: Object, store: Object, me: string, colleagueStore: Object, storeAs: (id: string) => Object }}
 */
export function makeHarnessSharing({ me = HARNESS_ME, applied = true, inOrganisation = true, members = {} } = {}) {
  const db = makeSharingDb({
    applied,
    members: {
      [me]: { orgId: inOrganisation ? HARNESS_ORG : null, name: 'You' },
      [HARNESS_COLLEAGUE]: { orgId: HARNESS_ORG, name: 'Ada Colleague' },
      ...members,
    },
  });
  return {
    db,
    me,
    store: makeSharingStore(memoryTransport(db, me)),
    /** The colleague's side, for tests that act as the second user. */
    colleagueStore: makeSharingStore(memoryTransport(db, HARNESS_COLLEAGUE)),
    storeAs: (id) => makeSharingStore(memoryTransport(db, id)),
  };
}

/** A fixture row the colleague owns and shares with the harness organisation. */
export function colleagueShared(row, { access = 'view' } = {}) {
  return { ...row, user_id: HARNESS_COLLEAGUE, visibility: 'organization', organization_id: HARNESS_ORG, org_access: access, updated_by: HARNESS_COLLEAGUE };
}
