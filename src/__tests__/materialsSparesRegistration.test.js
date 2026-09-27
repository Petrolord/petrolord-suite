/**
 * Materials & Spares Planner registration (Supply Chain SC3).
 *
 * The app is registered in several places at once, and missing one produces a
 * specific failure: a slug absent from allApps cannot be granted, a route
 * absent from App.jsx sends the tile to the home page, and a tile seeded with
 * `module` and without `module_id` cannot be sold. These read the sources.
 */
import fs from 'fs';
import path from 'path';
import { SUITE_MODULES } from '@/data/suiteCatalog';
import { MODULE_PRICING } from '@/data/pricingModels';
import { iconRegistry } from '@/data/applications';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const migration = (name) => fs.readFileSync(path.resolve(ROOT, '../supabase/migrations', name), 'utf8');

const SLUG = 'materials-spares-planner';
const ROUTE = `apps/midstream-downstream/${SLUG}`;
const TABLE_SQL = '20260928100000_sc3_scm_materials_projects.sql';
const SEED_SQL = '20260928110000_sc3_seed_materials_spares_tile.sql';
const ACTIVATE_SQL = '20260928120000_sc3_activate_materials_spares_tile.sql';

describe('entitlement and routing', () => {
  it('lists the slug in allApps, without which it cannot be granted', () => {
    expect(read('contexts/SupabaseAuthContext.jsx')).toContain(`'${SLUG}'`);
  });

  it('routes the page lazily, behind the entitlement gate, in the module of the Terminal & Depot Studio', () => {
    const app = read('App.jsx');
    expect(app).toContain("lazy(() => import('@/pages/apps/MaterialsSparesPlanner'))");
    expect(app).toContain(`path="${ROUTE}" element={<ProtectedAppRoute appId="${SLUG}" appName="Materials & Spares Planner"><MaterialsSparesPlanner /></ProtectedAppRoute>}`);
    expect(app).toContain('path="apps/midstream-downstream/terminal-depot-studio"');
  });

  it('saves to the table the migration creates', () => {
    expect(read('contexts/MaterialsSparesContext.jsx')).toContain("const TABLE = 'scm_materials_projects'");
  });
});

describe('the public catalogue', () => {
  it('lists the planner in Midstream & Downstream, once', () => {
    const md = SUITE_MODULES.find((m) => m.slug === 'midstream-downstream');
    expect(md.apps).toContain('Materials & Spares Planner');
    expect(SUITE_MODULES.flatMap((m) => m.apps).filter((a) => a === 'Materials & Spares Planner')).toHaveLength(1);
  });
});

describe('the migrations (files only, held for the owner)', () => {
  it('creates a product-prefixed table with owner RLS and no anon access', () => {
    const sql = migration(TABLE_SQL);
    expect(sql).toMatch(/create table if not exists public\.scm_materials_projects/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/revoke all on public\.scm_materials_projects from anon/);
    expect(sql).toMatch(/schema_version integer/);
    expect(sql).toMatch(/app_build text/);
  });

  it('seeds the tile Coming Soon with BOTH module and module_id, priced by slug', () => {
    const sql = migration(SEED_SQL);
    expect(sql).toMatch(/tmpl\.module := 'Midstream & Downstream'/);
    expect(sql).toMatch(/tmpl\.module_id := v_module_id/);
    expect(sql).toMatch(/tmpl\.status := 'Coming Soon'/);
    expect(sql).toMatch(/tmpl\.is_built := false/);
    expect(sql).not.toMatch(/status := 'Active'/);
    expect(sql).toMatch(/v_price numeric := 299/);
    expect(sql).toMatch(/DEPLOY GATE/);
  });

  it('names an icon the hub can draw', () => {
    const icon = migration(SEED_SQL).match(/v_icon text := '([A-Za-z]+)'/)[1];
    expect(iconRegistry[icon]).toBeDefined();
  });

  it('activates only on slug and module, deploy-gated', () => {
    const sql = migration(ACTIVATE_SQL);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql).toMatch(/where slug = v_slug\s+and module = 'Midstream & Downstream'/);
  });

  it('keeps no transaction control of its own, so a rolled-back dry run stays rolled back', () => {
    for (const f of [TABLE_SQL, SEED_SQL, ACTIVATE_SQL]) {
      expect(migration(f)).not.toMatch(/^\s*(begin|commit)\s*;/im);
    }
  });

  it('keeps the module price within the commercial rule with the new app', () => {
    // App prices of the module from the applied 2026-09 pricing migration,
    // plus this app's price from the seed.
    const reprice = migration('20260927120000_suite_pricing_2026_09.sql');
    const md = [...reprice.matchAll(/\('([a-z0-9-]+)', 'midstream-downstream', (\d+)\)/g)].map((m) => Number(m[2]));
    const price = Number(migration(SEED_SQL).match(/v_price numeric := (\d+)/)[1]);
    const ratio = MODULE_PRICING['midstream-downstream'] / (md.reduce((a, b) => a + b, 0) + price);
    expect(md.length + 1).toBeGreaterThanOrEqual(8);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.42);
  });

  it('is logged in MIGRATIONS.md as not yet applied', () => {
    const log = fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
    for (const f of [TABLE_SQL, SEED_SQL, ACTIVATE_SQL]) {
      const row = log.split('\n').find((l) => l.includes(f));
      expect(row).toBeDefined();
      expect(row).toMatch(/NOT YET APPLIED/);
    }
  });
});
