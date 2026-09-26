/**
 * Data & AI module registration (DA0).
 *
 * The Suite's tenth module, registered in every place the ninth (Process
 * Safety, PS0) was. Missing one produces a specific failure rather than an
 * obvious one: an app absent from `allApps` cannot be granted however Active
 * its tile is, a module absent from `allModules` cannot be licensed at all,
 * and a hub filtering on the slug instead of the display name shows an empty
 * grid forever.
 *
 * These read the source rather than importing, because most of the list lives
 * inside React components and hardcoded arrays rather than behind exports.
 */
import fs from 'fs';
import path from 'path';
import { normalizeModuleName, getModuleList } from '@/utils/adminHelpers';
import { MODULE_PRICING, MODULE_META } from '@/data/pricingModels';
import { moduleSegment, appRoutePath } from '@/utils/appRoute';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SLUG = 'data-ai';
const NAME = 'Data & AI';
// D1 to D4 were seeded by DA0; D5 seeds its own tile (20260925180000).
const DA0_SLUGS = ['data-quality-studio', 'ml-workbench', 'electrofacies-studio', 'forecasting-ml-workbench'];
const APP_SLUGS = [...DA0_SLUGS, 'ai-evaluation-studio'];
// A migration row in MIGRATIONS.md: held (NOT APPLIED, owner-run) in both
// columns, or applied with a dated record. DA0 to D4 were applied on
// 2026-09-25 (PR #622); D5 is held.
const LOGGED = /(NOT APPLIED \(owner-run\)|\*\*APPLIED \d{4}-\d{2}-\d{2}\*\*[^|]*) \| (NOT APPLIED \(owner-run\)|\*\*APPLIED \d{4}-\d{2}-\d{2}\*\*[^|]*) \|$/;
const HELD = /NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/;
const SEED = '20260923120000_da0_seed_data_ai_module.sql';
const HUB = 'pages/dashboard/DataAiHub.jsx';

describe('entitlement registration', () => {
  const auth = read('contexts/SupabaseAuthContext.jsx');

  it('lists the module, without which it cannot be licensed', () => {
    expect(auth).toMatch(new RegExp(`'${SLUG}'`));
  });

  it('lists every one of its apps, without which they cannot be granted', () => {
    const missing = APP_SLUGS.filter((s) => !auth.includes(`'${s}'`));
    expect(missing).toEqual([]);
  });

  it('registers AI Evaluation Studio (D5) once', () => {
    expect(auth.match(/'ai-evaluation-studio'/g)).toHaveLength(1);
  });
});

describe('navigation', () => {
  it('has a dashboard tile', () => {
    expect(read('pages/Dashboard.jsx')).toMatch(new RegExp(`id: '${SLUG}', name: '${NAME}'`));
  });

  it('has a sidebar item pointing at the hub route', () => {
    expect(read('components/DashboardSidebar.jsx')).toContain(`label="${NAME}" to="/dashboard/${SLUG}"`);
  });

  it('has the hub route wired, lazily like every other hub', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/dashboard/DataAiHub')");
    expect(app).toMatch(new RegExp(`path="${SLUG}" element={<AppRoute appName="${SLUG}"><DataAiHub />`));
  });

  it('has a hub page that filters on the module name the seed writes', () => {
    // useAppsFromDatabase compares against master_apps.module, which is the
    // display name and not the slug. Filtering on the slug would show nothing.
    const hub = read(HUB);
    expect(hub).toContain(`MODULE_FILTER = '${NAME}'`);
    expect(hub).toContain('<ApplicationsGrid moduleFilter={MODULE_FILTER}');
  });

  it('routes its apps under the slug the hub route uses', () => {
    // The ampersand is the trap the appRoute fix exists for.
    expect(moduleSegment(NAME)).toBe(SLUG);
    APP_SLUGS.forEach((s) => {
      expect(appRoutePath({ module: NAME, slug: s })).toBe(`/dashboard/apps/data-ai/${s}`);
    });
  });
});

describe('admin surfaces', () => {
  it('maps the module name to its slug', () => {
    expect(normalizeModuleName(NAME)).toBe(SLUG);
    expect(normalizeModuleName('data-ai')).toBe(SLUG);
    expect(normalizeModuleName('Data and AI')).toBe(SLUG);
  });

  it('does not capture other modules whose names contain "data" or "ai"', () => {
    expect(normalizeModuleName('Production Operations')).toBe('production');
    expect(normalizeModuleName('Geoscience')).toBe('geoscience');
    expect(normalizeModuleName('HSE')).toBe('hse');
    expect(normalizeModuleName('Process Safety')).toBe('process-safety');
  });

  it('lists the module for admin assignment', () => {
    const mod = getModuleList().find((m) => m.id === SLUG);
    expect(mod).toBeTruthy();
    expect(mod.name).toBe(NAME);
    expect(mod.type).toBe('suite');
  });

  it('is in the super admin fallback list', () => {
    expect(read('pages/SuperAdminConsole.jsx'))
      .toContain(`{ app_id: '${SLUG}', name: '${NAME}', module_id: '${SLUG}' }`);
  });

  it('has a label for module home links', () => {
    expect(read('components/wells/appLinks.js')).toContain(`'${SLUG}': '${NAME}'`);
  });
});

describe('pricing, which lands with the first app (D1)', () => {
  const PRICING = '20260923150000_d1_data_ai_module_pricing.sql';

  it('is priced in the shared table, the server fallback and the migration alike', () => {
    // The Coming Soon-only module was unpriced at DA0. D1 ships the Data
    // Quality Studio and prices the module, as PS1 did for Process Safety.
    expect(MODULE_PRICING[SLUG]).toBe(2999);
    expect(MODULE_META[SLUG].name).toBe(NAME);
    expect(read('../supabase/functions/generate-quote/index.ts')).toMatch(/'data-ai': 2999/);
    expect(read(`../supabase/migrations/${PRICING}`)).toContain('{"data-ai":2999}');
  });
});

describe('marketing, which follows the catalog rather than leading it', () => {
  it('counts ten modules now that the tenth has a working app', () => {
    expect(read('pages/Home.jsx')).toMatch(/value: '10',\s*label: 'Discipline Modules'/);
    expect(read('pages/Solutions.jsx')).toContain('Ten modules');
  });

  it('shows the module with the number of apps that actually work', () => {
    // All five (D1 to D5). The count is what is built, not what is planned.
    const showcase = read('components/home/ModulesShowcase.jsx');
    const block = showcase.slice(showcase.indexOf(`name: '${NAME}'`));
    expect(block).toMatch(/count: 5,/);
    expect(block).toContain("apps: ['Data Quality Studio', 'ML Workbench', 'Electrofacies Studio', 'Production Forecasting ML Workbench', 'AI Evaluation Studio']");
    expect(block.slice(0, block.indexOf('],'))).not.toMatch(/AI-powered|[–—]/);
  });
});

describe('the hub copy', () => {
  const hub = read(HUB);

  it('follows the owner copy rule: no em or en dashes', () => {
    expect(hub).not.toMatch(/[–—]/);
  });

  it('names methods and claims no AI it does not run', () => {
    expect(hub).not.toMatch(/AI-powered|powered by AI|artificial intelligence/i);
    expect(hub).toMatch(/machine learning/);
  });

  it('names none of its applications by hand in what it renders', () => {
    // The header comment may name them; the page itself lists only the catalog.
    const rendered = hub.slice(hub.indexOf('export const MODULE_FILTER'));
    ['Data Quality Studio', 'ML Workbench', 'Electrofacies Studio', 'Forecasting ML Workbench', 'AI Evaluation Studio'].forEach((a) => {
      expect(rendered).not.toContain(a);
    });
  });
});

describe('the seed migration', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sql = fs.readFileSync(path.join(migrations, SEED), 'utf8');

  it('sorts before every Data & AI wave migration that needs its rows', () => {
    // D1 to D4 migrations are named <timestamp>_d<N>_* with N from 1 (an
    // unrelated 20260826100000_d0_drilling_* exists). Other modules may
    // land later migrations too, so this pins the dependency, not the tail.
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    const at = all.indexOf(SEED);
    expect(at).toBeGreaterThan(-1);
    const waves = all.filter((f) => /^\d{14}_d[1-5]_/.test(f));
    waves.forEach((f) => expect(all.indexOf(f)).toBeGreaterThan(at));
  });

  it('creates the module row on the data-ai slug, idempotently', () => {
    expect(sql).toMatch(/where slug = 'data-ai'/);
    expect(sql).toMatch(/if v_module_id is null then/);
  });

  it('seeds exactly the four D1 to D4 apps, all Coming Soon', () => {
    DA0_SLUGS.forEach((s) => expect(sql).toContain(`'${s}'`));
    expect(sql).not.toMatch(/'ai-evaluation/);
    expect(sql).toMatch(/status := 'Coming Soon'/);
    expect(sql).toMatch(/is_built := false/);
    expect(sql).toMatch(/is_functional := false/);
    expect(sql).not.toMatch(/status := 'Active'/);
    // Re-running over an existing tile re-homes it and leaves its status.
    const update = sql.match(/update public\.master_apps([\s\S]*?)where slug = rec\.slug;/);
    expect(update).toBeTruthy();
    expect(update[1]).not.toMatch(/status/);
  });

  it('uses only icon names the icon registry knows', () => {
    const icons = [...sql.matchAll(/\('[a-z-]+', '[^']+', '([A-Za-z0-9]+)',/g)].map((m) => m[1]);
    expect(icons).toHaveLength(4);
    const registry = read('data/applications.js');
    const block = registry.slice(registry.indexOf('iconRegistry = {'), registry.indexOf('};', registry.indexOf('iconRegistry = {')));
    icons.forEach((i) => expect(block).toMatch(new RegExp(`\\b${i}\\b`)));
  });

  it('sets BOTH the module text and the module_id, which is the known trap', () => {
    expect(sql).toMatch(/tmpl\.module := 'Data & AI'/);
    expect(sql).toMatch(/tmpl\.module_id := v_module_id/);
    expect(sql).toMatch(/set module = 'Data & AI',\s*module_id = v_module_id/);
  });

  it('is held for the deploy that ships the hub route', () => {
    expect(sql).toMatch(/DEPLOY GATE/);
  });

  it('adds no pricing', () => {
    expect(sql).not.toMatch(/(insert into|update)\s+(public\.)?pricing_config/i);
  });

  it('follows the owner copy rule in its descriptions', () => {
    expect(sql).not.toMatch(/[–—]/);
    expect(sql).not.toMatch(/AI-powered/i);
  });

  it('is logged in MIGRATIONS.md, held or with its apply record', () => {
    const log = fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
    const row = log.split('\n').find((l) => l.includes(SEED));
    expect(row).toBeTruthy();
    expect(row).toMatch(LOGGED);
  });
});

describe('D1: the Data Quality Studio', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sqlOf = (f) => fs.readFileSync(path.join(migrations, f), 'utf8');
  const log = () => fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
  const TABLE = '20260923130000_d1_dai_qc_runs.sql';
  const TILE = '20260923140000_d1_activate_data_quality_studio_tile.sql';
  const PRICING = '20260923150000_d1_data_ai_module_pricing.sql';

  it('is routed where appRoutePath sends the tile, behind its own entitlement, with its help guide', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/apps/DataQualityStudio')");
    expect(app).toContain("import('@/pages/apps/DataQualityStudioHelpGuide')");
    expect(app).toContain('<Route path="apps/data-ai/data-quality-studio" element={<ProtectedAppRoute appId="data-quality-studio"');
    expect(app).toContain('<Route path="apps/data-ai/data-quality-studio/help" element={<ProtectedAppRoute appId="data-quality-studio"');
    expect(appRoutePath({ module: NAME, slug: 'data-quality-studio' })).toBe('/dashboard/apps/data-ai/data-quality-studio');
  });

  it('keeps its runs in a dai_* table scoped by organization membership', () => {
    const sql = sqlOf(TABLE);
    expect(sql).toMatch(/create table if not exists public\.dai_qc_runs/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/public\.is_org_member\(organization_id\)/);
    expect(sql).toMatch(/has_org_role\(organization_id, array\['owner', 'admin'\]\)/);
    expect(sql).toMatch(/revoke all on table public\.dai_qc_runs from anon/);
    expect(sql).not.toMatch(/using \(true\)/i);
    // Shared tables need a second engineer; this migration only references them.
    expect(sql).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations)\b/i);
  });

  it('flips only its own tile Active, and only if the DA0 seed made it', () => {
    const sql = sqlOf(TILE);
    expect(sql).toMatch(/v_slug text := 'data-quality-studio'/);
    expect(sql).toMatch(/and module = 'Data & AI'/);
    expect(sql).toMatch(/set status = 'Active'/);
    expect(sql).toMatch(/is_built = true/);
    expect(sql).toMatch(/is_functional = true/);
    expect(sql).toMatch(/Nothing done/);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql.slice(sql.indexOf('do $$'))).not.toMatch(/ml-workbench|electrofacies-studio|forecasting-ml-workbench/);
    expect(sql).not.toMatch(/[–—]/);
    expect(sql).not.toMatch(/AI-powered|artificial intelligence/i);
  });

  it('merges its price into the single source without touching another module', () => {
    const sql = sqlOf(PRICING);
    expect(sql).toMatch(/set value = value \|\| '\{"data-ai":2999\}'::jsonb/);
    expect(sql).toMatch(/where key = 'module_pricing'/);
  });

  it('logs every D1 migration (held or applied), after the DA0 seed', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE, PRICING].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf(SEED));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(LOGGED);
    });
  });
});

describe('D2: the ML Workbench', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sqlOf = (f) => fs.readFileSync(path.join(migrations, f), 'utf8');
  const log = () => fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
  const TABLE = '20260924120000_d2_dai_ml_runs.sql';
  const TILE = '20260924130000_d2_activate_ml_workbench_tile.sql';

  it('is routed where appRoutePath sends the tile, behind its own entitlement, with its help guide', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/apps/MlWorkbench')");
    expect(app).toContain("import('@/pages/apps/MlWorkbenchHelpGuide')");
    expect(app).toContain('<Route path="apps/data-ai/ml-workbench" element={<ProtectedAppRoute appId="ml-workbench"');
    expect(app).toContain('<Route path="apps/data-ai/ml-workbench/help" element={<ProtectedAppRoute appId="ml-workbench"');
    expect(appRoutePath({ module: NAME, slug: 'ml-workbench' })).toBe('/dashboard/apps/data-ai/ml-workbench');
  });

  it('runs the engine vendored at the VENDOR.json pin, through a one-line shim', () => {
    const vendor = JSON.parse(read('../packages/engines/VENDOR.json'));
    const wf = read('utils/dataAi/mlWorkflows.js');
    expect(wf).toContain(`ENGINE_COMMIT = '${vendor.canonical.commit}'`);
    expect(wf).toContain(`ENGINE_VERSION = 'petrolord-engines ${vendor.canonical.commit.slice(0, 7)} `);
    const shim = read('utils/dataAi/engine/ml.js').split('\n').filter((l) => l && !l.startsWith('//'));
    expect(shim).toEqual(["export * from '../../../../packages/engines/engines/dataai/ml.js';"]);
  });

  it('runs its fits in a worker that jest maps to the inline fallback', () => {
    expect(read('utils/dataAi/mlWorkerFactory.js')).toContain("new URL('./workers/ml.worker.js', import.meta.url)");
    expect(fs.readFileSync(path.resolve(ROOT, '../jest.config.js'), 'utf8')).toContain("'mlWorkerFactory(\\\\.js)?$': '<rootDir>/src/__mocks__/mlWorkerFactoryMock.js'");
  });

  it('keeps its runs in a dai_* table scoped by organization membership', () => {
    const sql = sqlOf(TABLE);
    expect(sql).toMatch(/create table if not exists public\.dai_ml_runs/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/public\.is_org_member\(organization_id\)/);
    expect(sql).toMatch(/has_org_role\(organization_id, array\['owner', 'admin'\]\)/);
    expect(sql).toMatch(/revoke all on table public\.dai_ml_runs from anon/);
    expect(sql).toMatch(/task in \('regression', 'classification'\)/);
    expect(sql).not.toMatch(/using \(true\)/i);
    expect(sql).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations)\b/i);
  });

  it('flips only its own tile Active, only if the DA0 seed made it, and changes no price', () => {
    const sql = sqlOf(TILE);
    expect(sql).toMatch(/v_slug text := 'ml-workbench'/);
    expect(sql).toMatch(/and module = 'Data & AI'/);
    expect(sql).toMatch(/set status = 'Active'/);
    expect(sql).toMatch(/is_built = true/);
    expect(sql).toMatch(/is_functional = true/);
    expect(sql).toMatch(/Nothing done/);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql.slice(sql.indexOf('do $$'))).not.toMatch(/data-quality-studio|electrofacies-studio|forecasting-ml-workbench/);
    expect(sql).not.toMatch(/pricing_config/);
    expect(sql).not.toMatch(/[–—]/);
    expect(sql).not.toMatch(/AI-powered|artificial intelligence/i);
    // the module price already covers its apps; D2 changes no number
    expect(MODULE_PRICING[SLUG]).toBe(2999);
  });

  it('logs both D2 migrations (held or applied), after the D1 ones', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf('20260923150000_d1_data_ai_module_pricing.sql'));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(LOGGED);
    });
    expect(all.indexOf(TABLE)).toBeLessThan(all.indexOf(TILE));
  });
});

describe('D3: the Electrofacies Studio', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sqlOf = (f) => fs.readFileSync(path.join(migrations, f), 'utf8');
  const log = () => fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
  const TABLE = '20260924140000_d3_dai_facies_runs.sql';
  const TILE = '20260924150000_d3_activate_electrofacies_studio_tile.sql';

  it('is routed where appRoutePath sends the tile, behind its own entitlement, with its help guide', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/apps/ElectrofaciesStudio')");
    expect(app).toContain("import('@/pages/apps/ElectrofaciesStudioHelpGuide')");
    expect(app).toContain('<Route path="apps/data-ai/electrofacies-studio" element={<ProtectedAppRoute appId="electrofacies-studio"');
    expect(app).toContain('<Route path="apps/data-ai/electrofacies-studio/help" element={<ProtectedAppRoute appId="electrofacies-studio"');
    expect(appRoutePath({ module: NAME, slug: 'electrofacies-studio' })).toBe('/dashboard/apps/data-ai/electrofacies-studio');
  });

  it('runs the engine vendored at the VENDOR.json pin, through one-line shims', () => {
    const vendor = JSON.parse(read('../packages/engines/VENDOR.json'));
    const wf = read('utils/dataAi/faciesWorkflows.js');
    expect(wf).toContain(`ENGINE_COMMIT = '${vendor.canonical.commit}'`);
    expect(wf).toContain(`ENGINE_VERSION = 'petrolord-engines ${vendor.canonical.commit.slice(0, 7)} `);
    const code = (f) => read(f).split('\n').filter((l) => l && !l.startsWith('//'));
    expect(code('utils/dataAi/engine/cluster.js')).toEqual(["export * from '../../../../packages/engines/engines/dataai/cluster.js';"]);
    expect(code('utils/dataAi/engine/stats.js')).toEqual(["export { mulberry32 } from '../../../../packages/engines/lib/stats/stats.js';"]);
  });

  it('offers no self-organising map, which the engine does not have', () => {
    ['utils/dataAi/faciesWorkflows.js', 'utils/dataAi/faciesJobs.js', 'pages/apps/ElectrofaciesStudio.jsx'].forEach((f) => {
      expect(read(f)).not.toMatch(/\bsom\b|self-organi[sz]ing/i);
    });
  });

  it('runs its jobs in a worker that jest maps to the inline fallback', () => {
    expect(read('utils/dataAi/faciesWorkerFactory.js')).toContain("new URL('./workers/facies.worker.js', import.meta.url)");
    expect(fs.readFileSync(path.resolve(ROOT, '../jest.config.js'), 'utf8')).toContain("'faciesWorkerFactory(\\\\.js)?$': '<rootDir>/src/__mocks__/faciesWorkerFactoryMock.js'");
  });

  it('keeps its runs in a dai_* table scoped by organization membership', () => {
    const sql = sqlOf(TABLE);
    expect(sql).toMatch(/create table if not exists public\.dai_facies_runs/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/public\.is_org_member\(organization_id\)/);
    expect(sql).toMatch(/has_org_role\(organization_id, array\['owner', 'admin'\]\)/);
    expect(sql).toMatch(/revoke all on table public\.dai_facies_runs from anon/);
    expect(sql).not.toMatch(/using \(true\)/i);
    expect(sql).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations)\b/i);
  });

  it('flips only its own tile Active, only if the DA0 seed made it, and changes no price', () => {
    const sql = sqlOf(TILE);
    expect(sql).toMatch(/v_slug text := 'electrofacies-studio'/);
    expect(sql).toMatch(/and module = 'Data & AI'/);
    expect(sql).toMatch(/set status = 'Active'/);
    expect(sql).toMatch(/is_built = true/);
    expect(sql).toMatch(/is_functional = true/);
    expect(sql).toMatch(/Nothing done/);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql.slice(sql.indexOf('do $$'))).not.toMatch(/data-quality-studio|ml-workbench|forecasting-ml-workbench/);
    expect(sql).not.toMatch(/pricing_config/);
    expect(sql).not.toMatch(/[\u2013\u2014]/);
    expect(sql).not.toMatch(/AI-powered|artificial intelligence/i);
    expect(MODULE_PRICING[SLUG]).toBe(2999);
  });

  it('logs both D3 migrations (held or applied), after the D2 ones', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf('20260924130000_d2_activate_ml_workbench_tile.sql'));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(LOGGED);
    });
    expect(all.indexOf(TABLE)).toBeLessThan(all.indexOf(TILE));
  });
});

describe('D4: the Production Forecasting ML Workbench', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sqlOf = (f) => fs.readFileSync(path.join(migrations, f), 'utf8');
  const log = () => fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
  const TABLE = '20260924160000_d4_dai_forecast_runs.sql';
  const TILE = '20260924170000_d4_tile_activation.sql';

  it('is routed where appRoutePath sends the tile, behind its own entitlement, with its help guide', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/apps/ForecastingMlWorkbench')");
    expect(app).toContain("import('@/pages/apps/ForecastingMlWorkbenchHelpGuide')");
    expect(app).toContain('<Route path="apps/data-ai/forecasting-ml-workbench" element={<ProtectedAppRoute appId="forecasting-ml-workbench"');
    expect(app).toContain('<Route path="apps/data-ai/forecasting-ml-workbench/help" element={<ProtectedAppRoute appId="forecasting-ml-workbench"');
    expect(appRoutePath({ module: NAME, slug: 'forecasting-ml-workbench' })).toBe('/dashboard/apps/data-ai/forecasting-ml-workbench');
  });

  it('runs the engine vendored at the VENDOR.json pin, through a one-line shim', () => {
    const vendor = JSON.parse(read('../packages/engines/VENDOR.json'));
    const wf = read('utils/dataAi/forecastWorkflows.js');
    expect(wf).toContain(`ENGINE_COMMIT = '${vendor.canonical.commit}'`);
    expect(wf).toContain(`ENGINE_VERSION = 'petrolord-engines ${vendor.canonical.commit.slice(0, 7)} `);
    const code = read('utils/dataAi/engine/forecast.js').split('\n').filter((l) => l && !l.startsWith('//'));
    expect(code).toEqual(["export * from '../../../../packages/engines/engines/dataai/forecast.js';"]);
  });

  it('computes no Monte Carlo, NPV or Arps of its own: the bootstrap and the Arps fit are the engine\'s', () => {
    ['utils/dataAi/forecastWorkflows.js', 'utils/dataAi/forecastJobs.js', 'utils/dataAi/forecastData.js', 'utils/dataAi/forecastReport.js'].forEach((f) => {
      const src = read(f);
      expect(src).not.toMatch(/Math\.random|mulberry32\(|fitArpsModel\(|calculateArpsHyperbolic\(/);
    });
  });

  it('runs its jobs in a worker that jest maps to the inline fallback', () => {
    expect(read('utils/dataAi/forecastWorkerFactory.js')).toContain("new URL('./workers/forecast.worker.js', import.meta.url)");
    expect(fs.readFileSync(path.resolve(ROOT, '../jest.config.js'), 'utf8')).toContain("'forecastWorkerFactory(\\\\.js)?$': '<rootDir>/src/__mocks__/forecastWorkerFactoryMock.js'");
  });

  it('keeps its runs in a dai_* table scoped by organization membership', () => {
    const sql = sqlOf(TABLE);
    expect(sql).toMatch(/create table if not exists public\.dai_forecast_runs/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/public\.is_org_member\(organization_id\)/);
    expect(sql).toMatch(/has_org_role\(organization_id, array\['owner', 'admin'\]\)/);
    expect(sql).toMatch(/revoke all on table public\.dai_forecast_runs from anon/);
    expect(sql).toMatch(/source in \('upload', 'spine'\)/);
    expect(sql).not.toMatch(/using \(true\)/i);
    expect(sql).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations|po_[a-z_]+)\b/i);
  });

  it('flips only its own tile Active, only if the DA0 seed made it, and changes no price', () => {
    const sql = sqlOf(TILE);
    expect(sql).toMatch(/v_slug text := 'forecasting-ml-workbench'/);
    expect(sql).toMatch(/and module = 'Data & AI'/);
    expect(sql).toMatch(/set status = 'Active'/);
    expect(sql).toMatch(/is_built = true/);
    expect(sql).toMatch(/is_functional = true/);
    expect(sql).toMatch(/Nothing done/);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql.slice(sql.indexOf('do $$'))).not.toMatch(/data-quality-studio|(?<!forecasting-)ml-workbench|electrofacies-studio/);
    expect(sql).not.toMatch(/pricing_config/);
    expect(sql).not.toMatch(/[\u2013\u2014]/);
    expect(sql).not.toMatch(/AI-powered|artificial intelligence/i);
    expect(MODULE_PRICING[SLUG]).toBe(2999);
  });

  it('logs both D4 migrations (held or applied), after the D3 ones', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf('20260924150000_d3_activate_electrofacies_studio_tile.sql'));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(LOGGED);
    });
    expect(all.indexOf(TABLE)).toBeLessThan(all.indexOf(TILE));
  });
});

describe('D5: the AI Evaluation Studio', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sqlOf = (f) => fs.readFileSync(path.join(migrations, f), 'utf8');
  const log = () => fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
  const SEED5 = '20260925180000_d5_seed_ai_evaluation_studio_tile.sql';
  const TABLE = '20260925190000_d5_dai_eval_runs.sql';
  const LLM = '20260925200000_d5_dai_llm_calls.sql';
  const TILE = '20260925210000_d5_activate_ai_evaluation_studio_tile.sql';
  const USERCAP = '20260926120000_d5_dai_llm_user_cap.sql';

  it('is routed where appRoutePath sends the tile, behind its own entitlement, with its help guide', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/apps/AiEvaluationStudio')");
    expect(app).toContain("import('@/pages/apps/AiEvaluationStudioHelpGuide')");
    expect(app).toContain('<Route path="apps/data-ai/ai-evaluation-studio" element={<ProtectedAppRoute appId="ai-evaluation-studio"');
    expect(app).toContain('<Route path="apps/data-ai/ai-evaluation-studio/help" element={<ProtectedAppRoute appId="ai-evaluation-studio"');
    expect(appRoutePath({ module: NAME, slug: 'ai-evaluation-studio' })).toBe('/dashboard/apps/data-ai/ai-evaluation-studio');
  });

  it('runs the engine vendored at the VENDOR.json pin, through a one-line shim', () => {
    const vendor = JSON.parse(read('../packages/engines/VENDOR.json'));
    const wf = read('utils/dataAi/evalWorkflows.js');
    expect(wf).toContain(`ENGINE_COMMIT = '${vendor.canonical.commit}'`);
    expect(wf).toContain(`ENGINE_VERSION = 'petrolord-engines ${vendor.canonical.commit.slice(0, 7)} `);
    const code = read('utils/dataAi/engine/evaluate.js').split('\n').filter((l) => l && !l.startsWith('//'));
    expect(code).toEqual(["export * from '../../../../packages/engines/engines/dataai/evaluate.js';"]);
  });

  it('computes no bootstrap, Monte Carlo or metric of its own: the numbers are the engine\'s', () => {
    ['utils/dataAi/evalWorkflows.js', 'utils/dataAi/evalJobs.js', 'utils/dataAi/evalData.js', 'utils/dataAi/evalReport.js', 'contexts/EvaluationContext.jsx'].forEach((f) => {
      const src = read(f);
      expect(src).not.toMatch(/Math\.random|mulberry32\(|Math\.log2\(|Math\.log\(/);
    });
  });

  it('reads the same Ekene documents fixture the engine gate and the course read', () => {
    const data = read('utils/dataAi/evalData.js');
    ['corpus', 'queries', 'systems', 'extraction', 'calibration'].forEach((f) => {
      expect(data).toContain(`from '../../../packages/engines/test-data/dataai/ekene-docs/${f}.json'`);
    });
  });

  it('runs its jobs in a worker that jest maps to the inline fallback', () => {
    expect(read('utils/dataAi/evalWorkerFactory.js')).toContain("new URL('./workers/eval.worker.js', import.meta.url)");
    expect(fs.readFileSync(path.resolve(ROOT, '../jest.config.js'), 'utf8')).toContain("'evalWorkerFactory(\\\\.js)?$': '<rootDir>/src/__mocks__/evalWorkerFactoryMock.js'");
  });

  it('seeds its own Coming Soon tile with both module and module_id, on the DA0 insert branch, with no price', () => {
    const sql = sqlOf(SEED5);
    expect(sql).toMatch(/v_slug text := 'ai-evaluation-studio'/);
    expect(sql).toMatch(/where slug = 'data-ai'/);
    expect(sql).toMatch(/tmpl\.module := 'Data & AI'/);
    expect(sql).toMatch(/tmpl\.module_id := v_module_id/);
    expect(sql).toMatch(/set module = 'Data & AI',\s*module_id = v_module_id/);
    expect(sql).toMatch(/tmpl\.status := 'Coming Soon'/);
    expect(sql).toMatch(/tmpl\.is_built := false/);
    expect(sql).toMatch(/tmpl\.is_functional := false/);
    expect(sql).not.toMatch(/status := 'Active'|set status/);
    expect(sql).toMatch(/Nothing done/);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql).not.toMatch(/pricing_config/);
    expect(sql).not.toMatch(/[–—]/);
    expect(sql).not.toMatch(/AI-powered|artificial intelligence/i);
    const icon = sql.match(/v_icon text := '([A-Za-z0-9]+)'/)[1];
    const registry = read('data/applications.js');
    const block = registry.slice(registry.indexOf('iconRegistry = {'), registry.indexOf('};', registry.indexOf('iconRegistry = {')));
    expect(block).toMatch(new RegExp(`\\b${icon}\\b`));
  });

  it('keeps its runs in a dai_* table scoped by organization membership', () => {
    const sql = sqlOf(TABLE);
    expect(sql).toMatch(/create table if not exists public\.dai_eval_runs/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/public\.is_org_member\(organization_id\)/);
    expect(sql).toMatch(/has_org_role\(organization_id, array\['owner', 'admin'\]\)/);
    expect(sql).toMatch(/revoke all on table public\.dai_eval_runs from anon/);
    expect(sql).toMatch(/source in \('ekene', 'upload'\)/);
    expect(sql).not.toMatch(/using \(true\)/i);
    expect(sql).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations)\b/i);
  });

  it('meters language-model calls in a log only the service role writes, with the cap reserved under a lock', () => {
    const sql = sqlOf(LLM);
    expect(sql).toMatch(/create table if not exists public\.dai_llm_calls/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select to authenticated\s+using \(public\.is_org_member\(organization_id\) or public\.is_super_admin\(\)\)/);
    expect(sql).not.toMatch(/for (insert|update|delete|all) to authenticated/);
    expect(sql).toMatch(/revoke all on table public\.dai_llm_calls from authenticated;\s+grant select on table public\.dai_llm_calls to authenticated;/);
    expect(sql).toMatch(/revoke all on table public\.dai_llm_calls from anon/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/status in \('reserved', 'ok'\)/);
    expect(sql).toMatch(/grant execute on function public\.dai_llm_reserve_call\(uuid, uuid, text, text, integer\) to service_role/);
    expect(sql).toMatch(/revoke all on function public\.dai_llm_reserve_call\(uuid, uuid, text, text, integer\) from authenticated/);
    expect(sql).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations)\b/i);
  });

  it('flips only its own tile Active, only if its seed made it, and changes no price', () => {
    const sql = sqlOf(TILE);
    expect(sql).toMatch(/v_slug text := 'ai-evaluation-studio'/);
    expect(sql).toMatch(/and module = 'Data & AI'/);
    expect(sql).toMatch(/set status = 'Active'/);
    expect(sql).toMatch(/is_built = true/);
    expect(sql).toMatch(/is_functional = true/);
    expect(sql).toMatch(/Nothing done/);
    expect(sql).toMatch(/DEPLOY GATE/);
    expect(sql.slice(sql.indexOf('do $$'))).not.toMatch(/data-quality-studio|ml-workbench|electrofacies-studio/);
    expect(sql).not.toMatch(/pricing_config/);
    expect(sql).not.toMatch(/[–—]/);
    expect(sql).not.toMatch(/AI-powered|artificial intelligence/i);
    expect(MODULE_PRICING[SLUG]).toBe(2999);
  });

  it('logs all four D5 migrations, in order, after the D4 ones, as held or as applied on 2026-09-26', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    const order = [SEED5, TABLE, LLM, TILE].map((f) => all.indexOf(f));
    expect(order.every((i) => i > all.indexOf('20260924170000_d4_tile_activation.sql'))).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    [SEED5, TABLE, LLM, TILE].forEach((f) => {
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      // held when written; the owner applied all four on 2026-09-26 (production column)
      expect(row).toMatch(/NOT APPLIED \(owner-run\) \| (NOT APPLIED \(owner-run\)|\*\*APPLIED 2026-09-26\*\*[^|]*) \|$/);
    });
  });

  it('adds a personal cap as a new overload of the reserve function, keeping the deployed 5-argument one, service role only', () => {
    const sql = sqlOf(USERCAP);
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).toMatch(/create or replace function public\.dai_llm_reserve_call\(\s*p_org uuid,\s*p_user uuid,\s*p_function text,\s*p_model text,\s*p_cap integer,\s*p_user_cap integer\s*\)/);
    expect(code).not.toMatch(/p_user_cap integer default/i);
    expect(code).not.toMatch(/drop function/i);
    expect(code).toMatch(/returns table \(call_id uuid, calls_today integer, user_calls_today integer, cap_hit text\)/);
    expect(code).toMatch(/pg_advisory_xact_lock\(hashtextextended\('dai_llm_calls:' \|\| p_org::text, 0\)\)/);
    expect(code).toMatch(/status in \('reserved', 'ok'\)/);
    expect(code).toMatch(/count\(\*\) filter \(where user_id = p_user\)/);
    expect(code).toMatch(/'organization'::text/);
    expect(code).toMatch(/'user'::text/);
    expect(code).toMatch(/security definer/);
    const sig = 'public\\.dai_llm_reserve_call\\(uuid, uuid, text, text, integer, integer\\)';
    ['public', 'anon', 'authenticated'].forEach((r) => expect(code).toMatch(new RegExp(`revoke all on function ${sig} from ${r};`)));
    expect(code).toMatch(new RegExp(`grant execute on function ${sig} to service_role;`));
    expect(code).not.toMatch(/grant execute on function [^;]* to (anon|authenticated)/);
    expect(code).toMatch(/add column if not exists reasoning_effort text/);
    expect(code).toMatch(/reasoning_effort in \('none', 'low', 'medium', 'high', 'xhigh', 'max'\)/);
    expect(sql).toMatch(/ORDER: apply this migration FIRST, then redeploy the edge function/);
    expect(sql).not.toMatch(/[–—]/);
    expect(code).not.toMatch(/alter table (if exists )?public\.(organizations|organization_members|users|invitations)\b/i);
    // the applied metering migration is never edited
    expect(sqlOf(LLM)).toMatch(/DAILY_CAP in\s+-- supabase\/functions\/ai-eval-assist\/logic\.ts, 50 by default/);
  });

  it('logs the personal-cap migration after the D5 ones, with the order migration then deploy, held or applied by the owner', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    expect(all.indexOf(USERCAP)).toBeGreaterThan(all.indexOf(TILE));
    const row = log().split('\n').find((l) => l.includes(USERCAP));
    expect(row).toBeTruthy();
    // held when written; the owner applied it on 2026-09-26 (production column)
    expect(row).toMatch(/NOT APPLIED \(owner-run\) \| (NOT APPLIED \(owner-run\)|\*\*APPLIED 2026-09-26\*\*[^|]*) \|$/);
    expect(row).toMatch(/apply this migration FIRST, then redeploy/);
  });

  it('keeps the helper optional, metered and ungraded, and the edge function undeployed by this change', () => {
    const fn = fs.readFileSync(path.resolve(ROOT, '../supabase/functions/ai-eval-assist/index.ts'), 'utf8');
    expect(fn).toMatch(/Deploy is HELD for the owner/);
    const page = read('components/dataai/evaluate/AnswersPanel.jsx');
    expect(page).toContain('Model output, not graded');
    // a saved run and the report never carry the helper's output
    ['utils/dataAi/evalStudy.js', 'utils/dataAi/evalReport.js'].forEach((f) => {
      const code = read(f).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code).not.toMatch(/assist/i);
    });
  });
});
