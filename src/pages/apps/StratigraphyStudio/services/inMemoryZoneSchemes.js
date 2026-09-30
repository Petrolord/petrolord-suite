// In-memory strat_zone_schemes for the harness and jest (AppUpgrade
// STRAT-U2-008). Mirrors the table's RLS (migration 20260930180000) so tests
// cover the member, non-member and admin cases, and the registry service's
// contract (same errors, same-name update, 0-row refusals):
//   select  members of the row's organisation
//   insert  a member, created_by = the caller; unique (organisation, lower(trim(name)))
//   update  the creator or an organisation admin; organisation and creator pinned
//   delete  the creator or an organisation admin
// `missing: true` behaves as a database without the table.

import { ZoneSchemesUnavailable } from '@/lib/stratigraphy/zoneSchemesUnavailable';

let n = 0;

/**
 * @param {{ members?: Object<string, {orgId: string, role?: string, email?: string}>, me?: string, rows?: Array, missing?: boolean }} opts
 */
export function makeZoneSchemeStore({ members = { 'user-a': { orgId: 'org-dev', role: 'member', email: 'a.geologist@example.com' } }, me = 'user-a', rows = [], missing = false } = {}) {
  let current = me;
  const table = rows.map((r) => ({ ...r }));
  const who = () => members[current] || null;
  const isMember = (org) => !!who() && who().orgId === org;
  const isAdmin = (org) => isMember(org) && ['admin', 'owner'].includes(who().role);
  const guard = () => { if (missing) throw new ZoneSchemesUnavailable(); };
  const now = () => new Date(Date.UTC(2026, 8, 30, 12, 0, n++)).toISOString();
  const key = (s) => String(s || '').trim().toLowerCase();

  return {
    as(userId) { current = userId; },
    _rows: () => table.map((r) => ({ ...r })),
    async zoneSchemeContext() {
      const m = who();
      return { userId: current, email: m?.email || null, orgId: m?.orgId || null, role: m?.role || null };
    },
    async listOrgZoneSchemes() {
      guard();
      return table.filter((r) => isMember(r.organization_id)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).map((r) => ({ ...r, zones: r.zones.map((z) => ({ ...z })) }));
    },
    async saveOrgZoneScheme(scheme, { organizationId, appBuild = null } = {}) {
      guard();
      if (!organizationId) throw new Error('You are not in an organisation, so the scheme cannot be shared; it stays in this browser.');
      const row = { name: String(scheme.name || '').trim(), source: String(scheme.source || '').trim(), chart_version: scheme.chart_version || null, zones: scheme.zones || [], notes: scheme.notes || null, app_build: appBuild };
      if (!row.name) throw new Error('The scheme needs a name.');
      if (!row.source) throw new Error(`The ${row.name} scheme needs a source (the calibration it follows) before it is shared.`);
      const existing = table.find((r) => isMember(r.organization_id) && r.organization_id === organizationId && key(r.name) === key(row.name));
      if (existing) {
        const allowed = existing.created_by === current || isAdmin(existing.organization_id);
        if (!allowed) throw new Error(`The organisation already has a ${row.name} scheme shared by someone else; only its creator or an organisation admin can replace it. Rename yours to share it beside it.`);
        Object.assign(existing, row, { updated_at: now() }); // organisation and creator pinned (trigger)
        return { row: { ...existing }, replaced: true };
      }
      if (!isMember(organizationId)) throw new Error('Could not share the scheme: new row violates row-level security policy for table "strat_zone_schemes"');
      const r = { id: `zs-${++n}`, organization_id: organizationId, created_by: current, created_at: now(), updated_at: now(), ...row };
      table.push(r);
      return { row: { ...r }, replaced: false };
    },
    async deleteOrgZoneScheme(id) {
      guard();
      const i = table.findIndex((r) => r.id === id && isMember(r.organization_id) && (r.created_by === current || isAdmin(r.organization_id)));
      if (i < 0) throw new Error('Only the scheme\'s creator or an organisation admin can delete it.');
      table.splice(i, 1);
    },
  };
}
