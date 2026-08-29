/**
 * Midstream & Downstream module registration (DS0).
 *
 * A module in this Suite is registered in several places at once, and missing
 * one produces a specific failure rather than an obvious one: an app absent
 * from `allApps` cannot be granted however Active its tile is, and a module
 * absent from `allModules` cannot be licensed at all. The 2026-08-29 repo
 * sweep listed every place; this checks them, because the next person to add
 * a module will not read that list.
 *
 * These read the source rather than importing, because most of the list lives
 * inside React components and hardcoded arrays rather than behind exports.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SLUG = 'midstream-downstream';
const APP_SLUGS = [
  'crude-assay-blending-studio',
  'product-blending-optimizer',
  'refinery-planning-scheduling',
  'modular-refinery-feasibility',
  'terminal-depot-studio',
  'fuel-pricing-supply-chain',
  'lpg-cng-rollout-studio',
  'energy-utilities-efficiency',
  'carbon-footprint-abatement',
  'flare-gas-to-value',
];

describe('entitlement registration', () => {
  const auth = read('contexts/SupabaseAuthContext.jsx');

  it('lists the module, without which it cannot be licensed', () => {
    expect(auth).toMatch(new RegExp(`'${SLUG}'`));
  });

  it('lists every one of its apps, without which they cannot be granted', () => {
    const missing = APP_SLUGS.filter((s) => !auth.includes(`'${s}'`));
    expect(missing).toEqual([]);
  });
});

describe('navigation', () => {
  it('has a dashboard tile', () => {
    expect(read('pages/Dashboard.jsx')).toMatch(new RegExp(`id: '${SLUG}'`));
  });

  it('has a sidebar item pointing at the hub route', () => {
    expect(read('components/DashboardSidebar.jsx')).toContain(`/dashboard/${SLUG}`);
  });

  it('has the hub route wired, lazily like every other hub', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/dashboard/MidstreamDownstreamHub')");
    expect(app).toMatch(new RegExp(`path="${SLUG}"`));
  });

  it('has a hub page that filters on the module name the seed writes', () => {
    // useAppsFromDatabase compares against master_apps.module, which is the
    // display name and not the slug. Filtering on the slug would show nothing.
    const hub = read('pages/dashboard/MidstreamDownstreamHub.jsx');
    expect(hub).toContain("MODULE_FILTER = 'Midstream & Downstream'");
  });
});

describe('admin surfaces', () => {
  it('maps the module name to its slug', () => {
    expect(read('utils/adminHelpers.js')).toContain(`return '${SLUG}'`);
  });

  it('lists the module for admin assignment', () => {
    expect(read('utils/adminHelpers.js')).toMatch(new RegExp(`id: '${SLUG}'`));
  });

  it('is in the super admin fallback list', () => {
    expect(read('pages/SuperAdminConsole.jsx')).toContain(SLUG);
  });
});

describe('pricing', () => {
  // DS0 deliberately does NOT price the module: every app in it is Coming
  // Soon, and a purchasable module with nothing in it is exactly the kind of
  // thing the honest-catalog rule exists to prevent. Each table says so, so
  // the absence reads as a decision rather than an oversight.
  const tables = [
    'data/pricingModels.js',
    'pages/GetQuote.jsx',
    'components/admin/organizations/quotes/QuoteEditor.jsx',
  ];

  it.each(tables)('%s explains why the module is not listed', (rel) => {
    expect(read(rel)).toMatch(/Midstream & Downstream \(DS0\) is deliberately ABSENT/);
  });

  it.each(tables)('%s does not price it', (rel) => {
    // The comment names the module, so look for it as a priced key instead.
    const src = read(rel);
    expect(src).not.toMatch(new RegExp(`['"]?${SLUG}['"]?\\s*:\\s*\\d`));
  });
});

describe('the migrations', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const file = (name) => fs.readFileSync(path.join(migrations, name), 'utf8');

  it('fixes the crossed module ids as its own applied migration', () => {
    const sql = file('20260829840000_ds0_fix_crossed_module_ids.sql');
    expect(sql).toContain('fdp-accelerator');
    expect(sql).toMatch(/slug = 'economics'/);
  });

  it('seeds every app as Coming Soon, since none of them is built', () => {
    const sql = file('20260829850000_ds0_seed_midstream_downstream.sql');
    APP_SLUGS.forEach((s) => expect(sql).toContain(s));
    expect(sql).toMatch(/status := 'Coming Soon'/);
    expect(sql).toMatch(/is_built := false/);
    expect(sql).not.toMatch(/status := 'Active'/);
  });

  it('sets BOTH the module text and the module_id, which is the known trap', () => {
    const sql = file('20260829850000_ds0_seed_midstream_downstream.sql');
    expect(sql).toMatch(/tmpl\.module := 'Midstream & Downstream'/);
    expect(sql).toMatch(/tmpl\.module_id := v_module_id/);
  });

  it('is held for the deploy that ships the hub route', () => {
    expect(file('20260829850000_ds0_seed_midstream_downstream.sql')).toMatch(/DEPLOY GATE/);
  });
});
