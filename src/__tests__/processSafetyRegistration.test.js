/**
 * Process Safety module registration (PS0).
 *
 * The Suite's ninth module, registered in every place the eighth
 * (Midstream & Downstream, DS0) was. Missing one produces a specific failure
 * rather than an obvious one: an app absent from `allApps` cannot be granted
 * however Active its tile is, a module absent from `allModules` cannot be
 * licensed at all, and a hub filtering on the slug instead of the display
 * name shows an empty grid forever.
 *
 * These read the source rather than importing, because most of the list lives
 * inside React components and hardcoded arrays rather than behind exports.
 */
import fs from 'fs';
import path from 'path';
import { normalizeModuleName, getModuleList } from '@/utils/adminHelpers';
import { MODULE_PRICING } from '@/data/pricingModels';
import { moduleSegment, appRoutePath } from '@/utils/appRoute';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SLUG = 'process-safety';
const NAME = 'Process Safety';
const APP_SLUGS = ['lopa-sil-studio', 'consequence-studio', 'qra-studio'];
const SEED = '20260919200000_ps0_seed_process_safety_module.sql';

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
    expect(read('pages/Dashboard.jsx')).toMatch(new RegExp(`id: '${SLUG}', name: '${NAME}'`));
  });

  it('has a sidebar item pointing at the hub route', () => {
    expect(read('components/DashboardSidebar.jsx')).toContain(`to="/dashboard/${SLUG}"`);
  });

  it('has the hub route wired, lazily like every other hub', () => {
    const app = read('App.jsx');
    expect(app).toContain("import('@/pages/dashboard/ProcessSafetyHub')");
    expect(app).toMatch(new RegExp(`path="${SLUG}" element={<AppRoute appName="${SLUG}"><ProcessSafetyHub />`));
  });

  it('has a hub page that filters on the module name the seed writes', () => {
    // useAppsFromDatabase compares against master_apps.module, which is the
    // display name and not the slug. Filtering on the slug would show nothing.
    const hub = read('pages/dashboard/ProcessSafetyHub.jsx');
    expect(hub).toContain(`MODULE_FILTER = '${NAME}'`);
    expect(hub).toContain('<ApplicationsGrid moduleFilter={MODULE_FILTER}');
  });

  it('routes its apps under the slug the hub route uses', () => {
    expect(moduleSegment(NAME)).toBe(SLUG);
    expect(appRoutePath({ module: NAME, slug: 'lopa-sil-studio' }))
      .toBe('/dashboard/apps/process-safety/lopa-sil-studio');
  });
});

describe('admin surfaces', () => {
  it('maps the module name to its slug', () => {
    expect(normalizeModuleName('Process Safety')).toBe(SLUG);
    expect(normalizeModuleName('process-safety')).toBe(SLUG);
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

describe('the hse identifier stays with the external portal', () => {
  it('leaves the HSE mapping, dashboard tile and entitlements untouched', () => {
    expect(normalizeModuleName('HSE')).toBe('hse');
    expect(read('pages/Dashboard.jsx')).toMatch(/id: 'hse',[\s\S]*url: 'https:\/\/hse\.petrolord\.com\/'/);
    const ids = getModuleList().map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['hse_free', 'hse_premium']));
  });

  it('never registers process safety under an hse id', () => {
    const files = [
      'pages/dashboard/ProcessSafetyHub.jsx',
      `../supabase/migrations/${SEED}`,
    ];
    files.forEach((rel) => {
      expect(read(rel)).not.toMatch(/slug\s*=\s*'hse'|'hse-/);
    });
  });
});

describe('pricing, held until the first app ships', () => {
  it('is not priced while every app is Coming Soon', () => {
    // A purchasable module with nothing in it is what the honest-catalog rule
    // exists to prevent. PS1 prices it, as DS1 did for Midstream & Downstream.
    expect(MODULE_PRICING[SLUG]).toBeUndefined();
    expect(read('../supabase/functions/generate-quote/index.ts')).not.toContain(SLUG);
  });
});

describe('marketing, which follows the catalog rather than leading it', () => {
  it('does not advertise the module before any app in it works', () => {
    expect(read('components/home/ModulesShowcase.jsx')).not.toContain(NAME);
  });
});

describe('the hub copy', () => {
  it('follows the owner copy rule: no em or en dashes', () => {
    expect(read('pages/dashboard/ProcessSafetyHub.jsx')).not.toMatch(/[–—]/);
  });
});

describe('the seed migration', () => {
  const migrations = path.resolve(ROOT, '../supabase/migrations');
  const sql = fs.readFileSync(path.join(migrations, SEED), 'utf8');

  it('sorts after every other migration', () => {
    const all = fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
    expect(all[all.length - 1]).toBe(SEED);
  });

  it('creates the module row on the process-safety slug, idempotently', () => {
    expect(sql).toMatch(/where slug = 'process-safety'/);
    expect(sql).toMatch(/if v_module_id is null then/);
  });

  it('seeds every app as Coming Soon, since none of them is built', () => {
    APP_SLUGS.forEach((s) => expect(sql).toContain(`'${s}'`));
    expect(sql).toMatch(/status := 'Coming Soon'/);
    expect(sql).toMatch(/is_built := false/);
    expect(sql).toMatch(/is_functional := false/);
    expect(sql).not.toMatch(/status := 'Active'/);
    // Re-running over an existing tile re-homes it and leaves its status.
    const update = sql.match(/update public\.master_apps([\s\S]*?)where slug = rec\.slug;/);
    expect(update).toBeTruthy();
    expect(update[1]).not.toMatch(/status/);
  });

  it('sets BOTH the module text and the module_id, which is the known trap', () => {
    expect(sql).toMatch(/tmpl\.module := 'Process Safety'/);
    expect(sql).toMatch(/tmpl\.module_id := v_module_id/);
    expect(sql).toMatch(/set module = 'Process Safety',\s*module_id = v_module_id/);
  });

  it('is held for the deploy that ships the hub route', () => {
    expect(sql).toMatch(/DEPLOY GATE/);
  });

  it('adds no pricing', () => {
    expect(sql).not.toMatch(/(insert into|update)\s+(public\.)?pricing_config/i);
  });

  it('follows the owner copy rule in its descriptions', () => {
    expect(sql).not.toMatch(/[–—]/);
  });

  it('is logged in MIGRATIONS.md as not applied', () => {
    const log = fs.readFileSync(path.resolve(ROOT, '../MIGRATIONS.md'), 'utf8');
    const row = log.split('\n').find((l) => l.includes(SEED));
    expect(row).toBeTruthy();
    expect(row).toMatch(/NOT APPLIED \(owner-run\) \| NOT APPLIED \(owner-run\) \|$/);
  });
});
