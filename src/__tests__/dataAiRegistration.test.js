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

describe('pricing, held until the first app ships', () => {
  it('is not priced while every app is Coming Soon', () => {
    // A purchasable module with nothing in it is what the honest-catalog rule
    // exists to prevent. D1 prices it, as PS1 did for Process Safety.
    expect(MODULE_PRICING[SLUG]).toBeUndefined();
    expect(MODULE_META[SLUG]).toBeUndefined();
    expect(read('../supabase/functions/generate-quote/index.ts')).not.toContain(SLUG);
  });
});

describe('marketing, which follows the catalog rather than leading it', () => {
  it('does not advertise the module before any app in it works', () => {
    expect(read('components/home/ModulesShowcase.jsx')).not.toContain(NAME);
    expect(read('pages/Home.jsx')).not.toContain(NAME);
    expect(read('pages/Solutions.jsx')).not.toContain(NAME);
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
    ['Data Quality Studio', 'ML Workbench', 'Electrofacies Studio'].forEach((a) => {
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
