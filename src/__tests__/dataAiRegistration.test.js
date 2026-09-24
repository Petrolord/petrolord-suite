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
const APP_SLUGS = ['data-quality-studio', 'ml-workbench', 'electrofacies-studio', 'forecasting-ml-workbench'];
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

  it('does not register AI Evaluation Studio, which is not in this run', () => {
    expect(auth).not.toMatch(/ai-evaluation/);
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
    // All four of this run (D1 to D4). The count is what is built, not what is planned.
    const showcase = read('components/home/ModulesShowcase.jsx');
    const block = showcase.slice(showcase.indexOf(`name: '${NAME}'`));
    expect(block).toMatch(/count: 4,/);
    expect(block).toContain("apps: ['Data Quality Studio', 'ML Workbench', 'Electrofacies Studio', 'Production Forecasting ML Workbench']");
    expect(block).not.toMatch(/AI Evaluation/);
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
    ['Data Quality Studio', 'ML Workbench', 'Electrofacies Studio', 'Forecasting ML Workbench'].forEach((a) => {
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
    APP_SLUGS.forEach((s) => expect(sql).toContain(`'${s}'`));
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

  it('is logged in MIGRATIONS.md as not applied', () => {
    const log = fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
    const row = log.split('\n').find((l) => l.includes(SEED));
    expect(row).toBeTruthy();
    expect(row).toMatch(/NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/);
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

  it('logs every D1 migration as not applied (owner-run), after the DA0 seed', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE, PRICING].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf(SEED));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(/NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/);
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

  it('logs both D2 migrations as not applied (owner-run), after the D1 ones', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf('20260923150000_d1_data_ai_module_pricing.sql'));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(/NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/);
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

  it('logs both D3 migrations as not applied (owner-run), after the D2 ones', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf('20260924130000_d2_activate_ml_workbench_tile.sql'));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(/NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/);
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

  it('logs both D4 migrations as not applied (owner-run), after the D3 ones', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    [TABLE, TILE].forEach((f) => {
      expect(all.indexOf(f)).toBeGreaterThan(all.indexOf('20260924150000_d3_activate_electrofacies_studio_tile.sql'));
      const row = log().split('\n').find((l) => l.includes(f));
      expect(row).toBeTruthy();
      expect(row).toMatch(/NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/);
    });
    expect(all.indexOf(TABLE)).toBeLessThan(all.indexOf(TILE));
  });
});
