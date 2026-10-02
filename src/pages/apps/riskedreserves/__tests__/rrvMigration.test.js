// The rrv_valuations migration (20261002151500) and the app agree, and the
// file keeps to the approved shape: one new product table under the rules
// of 20261002100000, nothing redefined, no transaction lines, anon revoked,
// and the storage-lesson check in place. The database side is proved by
// tools/validation/rrv-valuations/run.sh (scratch Postgres) and pentest.sql.
import fs from 'fs';
import path from 'path';
import { SHARING_TABLES, tableSpec, accessOf } from '@/lib/recordSharing/rules';
import { makeSharingDb } from '@/lib/recordSharing/memoryDb';
import { RRV_TABLE } from '../services/rrvBackend';
import { toRow, fromRcpProspect } from '../services/rrvStore';

const ROOT = path.join(__dirname, '../../../../..');
const FILE = 'supabase/migrations/20261002151500_rrv_valuations.sql';
const SQL = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const code = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

describe('rrv_valuations migration', () => {
  test('the table is registered with the sharing rules as the migration registers it', () => {
    expect(RRV_TABLE).toBe('rrv_valuations');
    expect(code).toMatch(/\('rrv_valuations',\s+'visibility',\s+'risked valuation'\)/);
    expect(tableSpec(RRV_TABLE)).toMatchObject({ sharedWhen: 'visibility', nameColumn: 'name' });
    expect(SHARING_TABLES.rrv_valuations).toBeTruthy();
    expect(() => makeSharingDb().attach(RRV_TABLE, { get: () => [], set: () => {} })).not.toThrow();
    expect(accessOf(RRV_TABLE, { id: 'v', user_id: 'u1', organization_id: 'org', visibility: 'organization', org_access: 'view' }, { userId: 'u2' }).mode).toBe('colleague-view');
  });

  test('every column the app writes exists in the table', () => {
    const row = toRow(fromRcpProspect({ id: '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11', name: 'N', pg_factors: {}, inputs: {}, risked: { pg: 0.3, success: { p90: 1, p10: 2 } } }));
    for (const col of [...Object.keys(row), 'user_id', 'schema_version', 'app_build', 'version', 'change_note']) {
      expect(code).toMatch(new RegExp(`\\b${col}\\b`));
    }
    // the source prospect is kept as provenance, so it is not a foreign key
    expect(code).toMatch(/rcp_prospect_id\s+uuid,/);
    expect(code).not.toMatch(/references public\.rcp_prospects/);
    expect(code).toMatch(/unique \(user_id, prospect_key\)/);
  });

  test('the approved shape: four policies to authenticated through is_org_member, nothing else', () => {
    const policies = [...code.matchAll(/create policy (%I|"[^"]+") on public\.(%I|[a-z_]+)\s+for (select|insert|update|delete) to (\w+)/g)].map((m) => `${m[3]}:${m[4]}`);
    expect(policies.sort()).toEqual(['delete:authenticated', 'insert:authenticated', 'select:authenticated', 'select:authenticated', 'update:authenticated']);
    expect(code).toMatch(/public\.is_org_member\(organization_id\)/);
    expect(code).not.toMatch(/organization_members|organization_users|is_org_admin_of|get_my_claim/);
    expect(code).not.toMatch(/for \w+ to (public|anon)\b/i);
    expect(code).toMatch(/revoke all on public\.rrv_valuations from anon/);
    expect(code).toMatch(/revoke all on public\.rrv_valuations from public/);
    expect(code).toMatch(/grant select, insert, update, delete on public\.rrv_valuations to authenticated/);
  });

  test('no rule of its own: no function, no shared table, no transaction lines, one statement', () => {
    expect(code).not.toMatch(/create (or replace )?function/i);
    expect(code).not.toMatch(/alter table public\.(organizations|users|invitations|organization_members|onboarding)\b/i);
    expect(SQL).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
    expect(code.trim().startsWith('do $rrv$')).toBe(true);
    expect(code.trim().endsWith('$rrv$;')).toBe(true);
    expect((code.match(/^\$rrv\$;/gm) || []).length).toBe(1);
    // the triggers are the shared ones
    expect(code).toMatch(/execute function public\.suite_record_guard\('visibility'\)/);
    expect(code).toMatch(/execute function public\.suite_record_log\('visibility'\)/);
    // the only other table touched is the change log, by one additive reader policy
    const others = [...code.matchAll(/ on public\.([a-z_]+)(?!\()\b/g)].map((m) => m[1]).filter((t) => t !== 'rrv_valuations' && !/^suite_record_(guard|log)$/.test(t));
    expect([...new Set(others)]).toEqual(['suite_record_changes']);
  });

  test('the storage lesson is enforced at apply time, and the file refuses before the sharing rules', () => {
    expect(code).toMatch(/Not applied: a policy granted to PUBLIC or anon reads a table this migration revokes anon on/);
    expect(code).toMatch(/Apply 20261002100000_suite_record_sharing\.sql first/);
  });

  test('it is logged as not applied, with the exact owner command', () => {
    const log = fs.readFileSync(path.join(ROOT, 'MIGRATIONS.md'), 'utf8');
    const row = log.split('\n').find((l) => l.includes('20261002151500_rrv_valuations.sql'));
    expect(row).toBeTruthy();
    expect(row).toContain('supabase db query --linked -f supabase/migrations/20261002151500_rrv_valuations.sql');
    expect(row).toMatch(/NOT APPLIED|applied/i);
    for (const f of ['run.sh', 'pentest.sql', 'dry-run-sql.sh']) expect(fs.existsSync(path.join(ROOT, 'tools/validation/rrv-valuations', f))).toBe(true);
    const pentest = fs.readFileSync(path.join(ROOT, 'tools/validation/rrv-valuations/pentest.sql'), 'utf8');
    expect(pentest).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
    expect(pentest).toMatch(/raise exception E'RRV-VALUATIONS PENTEST %/);
  });
});
