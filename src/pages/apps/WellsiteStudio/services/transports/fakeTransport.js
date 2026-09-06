// The harness transport (/dev/wellsite-studio and jest): no network, a
// fixed user, the seeded registry wells, and creates that succeed locally.
// The sync engine (WS6) treats it as a server that accepts everything.

import { newId } from '@/lib/wellsite/ids';

export function makeFakeTransport({ user, registryWells = [], online = true } = {}) {
  const wsWells = new Map();
  let isOnline = online;
  const u = user || { id: 'user-a', email: 'geologist@example.com', name: 'A. Geologist', organization_id: 'org-1', role: 'wellsite_geologist' };
  return {
    kind: 'fake',
    async currentUser() { return u; },
    online() { return isOnline; },
    setOnline(v) { isOnline = !!v; },
    async listRegistryWells() { return registryWells; },
    async listWsWells() { return [...wsWells.values()]; },
    async createWsWell(row) {
      const now = new Date().toISOString();
      const well = { ...row, created_at: now, updated_at: now, schema_version: 1 };
      const member = { id: newId(), well_id: well.id, user_id: u.id, role: 'administrator', status: 'active', added_by: u.id, created_at: now, updated_at: now };
      const entry = { well, members: [member] };
      wsWells.set(well.id, entry);
      return entry;
    },
    async pullWell(id) { return wsWells.get(id) || null; },
    _wells: wsWells,
  };
}
