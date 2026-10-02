// The Reservoir record tables are registered with the sharing rules exactly
// as migration 20261002130000_reservoir_record_sharing.sql registers them,
// and the .pld import never carries a sharing state across.
import fs from 'fs';
import path from 'path';
import { SHARING_TABLES, tableSpec, isShared, accessOf } from '../rules';
import { makeSharingDb } from '../memoryDb';

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../../../supabase/migrations/20261002130000_reservoir_record_sharing.sql'), 'utf8');
const RESERVOIR = ['saved_fluid_studio_projects', 'saved_scal_projects', 'saved_dca_projects', 'saved_scenario_hub_projects',
  'saved_well_test_projects', 'saved_waterflood_design_projects', 'saved_vrr_projects', 'saved_rf_projects', 'rb_cases', 'sim_cases'];

describe('Reservoir record tables under the sharing rules', () => {
  test('the app list and the migration list are the same ten tables, all shared by visibility', () => {
    const inMigration = [...MIGRATION.matchAll(/\('([a-z_]+)',\s+'(visibility|organization_id)',\s+'[^']+'\)/g)].map((m) => [m[1], m[2]]);
    expect(inMigration.map((r) => r[0]).sort()).toEqual([...RESERVOIR].sort());
    for (const [table, sharedWhen] of inMigration) {
      expect(SHARING_TABLES[table]).toBeTruthy();
      expect(tableSpec(table).sharedWhen).toBe(sharedWhen);
      expect(sharedWhen).toBe('visibility');
    }
  });
  test('the name column is the one the table has', () => {
    for (const t of RESERVOIR) expect(tableSpec(t).nameColumn).toBe(t === 'rb_cases' || t === 'sim_cases' ? 'name' : 'project_name');
  });
  test('a case that names an organisation is private until its owner shares it', () => {
    const row = { id: 'c1', user_id: 'u1', organization_id: 'org', visibility: 'private', org_access: 'view' };
    expect(isShared('sim_cases', row)).toBe(false);
    expect(isShared('sim_cases', { ...row, visibility: 'organization' })).toBe(true);
    expect(accessOf('rb_cases', { ...row, visibility: 'organization' }, { userId: 'u2' }).mode).toBe('colleague-view');
    expect(accessOf('rb_cases', row, { userId: 'u2' }).mode).toBe('none');
  });
  test('the in-memory mirror accepts every Reservoir table', () => {
    const db = makeSharingDb();
    for (const t of RESERVOIR) expect(() => db.attach(t, { get: () => [], set: () => {} })).not.toThrow();
  });
  test('the migration does not redefine the shared rules and has no transaction lines', () => {
    expect(MIGRATION).not.toMatch(/create (or replace )?function public\.suite_record_(guard|log|log_updated|take|renew|release|lock_row|child_log)\(/i);
    expect(MIGRATION).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
    expect(MIGRATION).not.toMatch(/alter table public\.(organizations|users|invitations|organization_members)\b/i);
  });
});
