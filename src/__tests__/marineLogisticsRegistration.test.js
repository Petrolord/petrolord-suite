/**
 * Marine Logistics Planner registration (Supply Chain SC4).
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

const SLUG = 'marine-logistics-planner';
const ROUTE = `apps/midstream-downstream/${SLUG}`;
const TABLE_SQL = '20260929100000_sc4_scm_marine_projects.sql';
const SEED_SQL = '20260929110000_sc4_seed_marine_logistics_tile.sql';
const ACTIVATE_SQL = '20260929120000_sc4_activate_marine_logistics_tile.sql';

describe('entitlement and routing', () => {
  it('lists the slug in allApps, without which it cannot be granted', () => {
    expect(read('contexts/SupabaseAuthContext.jsx')).toContain(`'${SLUG}'`);
  });

  it('routes the page lazily, behind the entitlement gate, in the module of the Materials & Spares Planner', () => {
    const app = read('App.jsx');
    expect(app).toContain("lazy(() => import('@/pages/apps/MarineLogisticsPlanner'))");
    expect(app).toContain(`path="${ROUTE}" element={<ProtectedAppRoute appId="${SLUG}" appName="Marine Logistics Planner"><MarineLogisticsPlanner /></ProtectedAppRoute>}`);
    expect(app).toContain('path="apps/midstream-downstream/materials-spares-planner"');
  });

  it('saves to the table the migration creates, with the engine commit in the payload', () => {
    expect(read('contexts/MarineLogisticsContext.jsx')).toContain("const TABLE = 'scm_marine_projects'");
    expect(read('contexts/MarineLogisticsContext.jsx')).toMatch(/engine: ENGINE_COMMIT/);
  });
});

describe('the public catalogue', () => {
  it('lists the planner in Midstream & Downstream, once, with the SC3 planner', () => {
    const md = SUITE_MODULES.find((m) => m.slug === 'midstream-downstream');
    expect(md.apps).toContain('Marine Logistics Planner');
    expect(md.apps).toContain('Materials & Spares Planner');
    expect(SUITE_MODULES.flatMap((m) => m.apps).filter((a) => a === 'Marine Logistics Planner')).toHaveLength(1);
  });
});

describe('the migrations (files only, held for the owner)', () => {
  it('creates a product-prefixed table with owner RLS and no anon access', () => {
    const sql = migration(TABLE_SQL);
    expect(sql).toMatch(/create table if not exists public\.scm_marine_projects/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/revoke all on public\.scm_marine_projects from anon/);
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
    // plus the held SC3 price and this app's price from the seeds.
    const reprice = migration('20260927120000_suite_pricing_2026_09.sql');
    const md = [...reprice.matchAll(/\('([a-z0-9-]+)', 'midstream-downstream', (\d+)\)/g)].map((m) => Number(m[2]));
    const priceOf = (f) => Number(migration(f).match(/v_price numeric := (\d+)/)[1]);
    const price = priceOf(SEED_SQL) + priceOf('20260928110000_sc3_seed_materials_spares_tile.sql');
    const ratio = MODULE_PRICING['midstream-downstream'] / (md.reduce((a, b) => a + b, 0) + price);
    expect(md.length + 2).toBeGreaterThanOrEqual(8);
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
