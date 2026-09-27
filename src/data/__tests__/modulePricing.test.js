/**
 * Module pricing: one table, and it must stay one.
 *
 * WHY THIS EXISTS. There were four numbers for the same thing and every one
 * of them disagreed: src/data/pricingModels.js said Geoscience was 899,
 * src/pages/GetQuote.jsx said 500, QuoteEditor said 500, and the
 * generate-quote edge function ignored all three and charged a hardcoded
 * flat 500 for ANY module.
 *
 * Because a purchased module grants every app whose module_id matches, that
 * flat 500 bought 10 to 14 apps worth 5,990 to 11,988 a month a la carte,
 * and it was reachable from the public quote page.
 *
 * These tests pin the things that made it possible: a second copy of the
 * table, a module with no price, and a server fallback that quietly differs
 * from the client.
 */
import fs from 'fs';
import path from 'path';
import { MODULE_PRICING, MODULE_META } from '../pricingModels';

const root = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const SERVER = 'supabase/functions/generate-quote/index.ts';
const MIGRATION = 'supabase/migrations/20260830060000_module_pricing_single_source.sql';
// The 2026-09 pricing review: full reset of module_pricing plus every app price.
const REPRICE = 'supabase/migrations/20260927120000_suite_pricing_2026_09.sql';
// Later migrations that MERGE a module into the seeded object (value || ...).
const ADDITIONS = [
  'supabase/migrations/20260919230000_ps1_process_safety_module_pricing.sql',
  'supabase/migrations/20260923150000_d1_data_ai_module_pricing.sql',
];

describe('the shared table', () => {
  it('prices every module it names, positively', () => {
    const entries = Object.entries(MODULE_PRICING);
    // Nine since PS1 (2026-09-19), ten since D1 (2026-09-23): Process Safety
    // and Data & AI each joined with its first app.
    expect(entries.length).toBe(10);
    entries.forEach(([id, price]) => {
      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThan(0);
      expect(Number.isFinite(price)).toBe(true);
      // A module with no display metadata shows a raw slug to a customer.
      expect(MODULE_META[id]).toBeTruthy();
      expect(MODULE_META[id].name).toBeTruthy();
    });
  });

  it('does not price HSE, which is the separate naira-billed portal', () => {
    expect(MODULE_PRICING.hse).toBeUndefined();
  });
});

describe('nobody keeps a second copy', () => {
  it('GetQuote imports the table instead of declaring one', () => {
    const src = read('src/pages/GetQuote.jsx');
    expect(src).toMatch(/import \{[^}]*MODULE_PRICING[^}]*\} from '@\/data\/pricingModels'/);
    expect(src).not.toMatch(/const MODULE_PRICING\s*=\s*\{/);
  });

  it('QuoteEditor derives its list from the table', () => {
    const src = read('src/components/admin/organizations/quotes/QuoteEditor.jsx');
    expect(src).toMatch(/import \{[^}]*MODULE_PRICING[^}]*\} from '@\/data\/pricingModels'/);
    // The old shape was a literal array with prices written into it.
    expect(src).not.toMatch(/\{\s*id:\s*'geoscience',\s*name:.*price:\s*\d+/);
  });

  it('the dead billing engine is gone', () => {
    // It read .basePrice and .name off entries that are plain numbers, so
    // every module priced at 0. It had no importers, and it duplicated
    // logic that is now server-side.
    expect(fs.existsSync(path.join(root, 'src/utils/billingEngine.js'))).toBe(false);
  });
});

describe('the server', () => {
  const server = read(SERVER);

  it('no longer hardcodes a flat price for every module', () => {
    expect(server).not.toMatch(/const modPrice = 500/);
  });

  it('reads module pricing from pricing_config', () => {
    expect(server).toMatch(/configMap\['module_pricing'\]/);
  });

  it('refuses to quote a module it has no price for', () => {
    // Quietly giving a module away is how the flat 500 survived so long.
    expect(server).toMatch(/No price is configured for the/);
  });

  it('its fallback map matches the shared table exactly', () => {
    // The fallback exists only for a missing config row. If it drifts from
    // the client, a config outage silently reprices the whole catalogue.
    const block = server.match(/MODULE_PRICING_FALLBACK = \{([\s\S]*?)\};/);
    expect(block).toBeTruthy();
    const parsed = {};
    block[1].split(',').forEach((pair) => {
      const m = pair.match(/'?([a-z-]+)'?\s*:\s*(\d+)/);
      if (m) parsed[m[1]] = Number(m[2]);
    });
    expect(parsed).toEqual(MODULE_PRICING);
  });

  it('does not charge an app that a selected module already covers', () => {
    expect(server).toMatch(/coveredByModule/);
    expect(server).toMatch(/included in the/);
  });
});

describe('the migration that seeds it', () => {
  it('the latest pricing migration sets exactly the shared table', () => {
    // 20260927120000 (the 2026-09 pricing review) replaces the whole object,
    // superseding the seed and the per-module additions below.
    const json = read(REPRICE).match(/values \('module_pricing', '(\{[^']*\})'::jsonb\)/);
    expect(json).toBeTruthy();
    expect(JSON.parse(json[1])).toEqual(MODULE_PRICING);
  });

  it('adds a module by merging, so no other module price is overwritten', () => {
    ADDITIONS.forEach((rel) => {
      const sql = read(rel);
      expect(sql).toMatch(/where key = 'module_pricing'/);
      expect(sql).not.toMatch(/on conflict/i);
    });
  });

  it('is idempotent, so re-running it is safe', () => {
    expect(read(MIGRATION)).toMatch(/on conflict \(key\) do update/i);
  });
});

describe('the commercial rule holds', () => {
  // Owner-approved pricing review (2026-09-27): each app has its own price,
  // and a module costs about 35% of its apps bought one by one, or 45 to 65%
  // for a module of fewer than eight apps. App prices are read from the
  // migration that sets them, joined to their module there.
  const APPS = [...read(REPRICE).matchAll(/\('([a-z0-9-]+)', '([a-z-]+)', (\d+)\)/g)]
    .map(([, slug, module, price]) => ({ slug, module, price: Number(price) }));
  const byModule = (id) => APPS.filter((a) => a.module === id);

  it('prices all 102 live apps, each once, inside the approved range', () => {
    expect(APPS).toHaveLength(102);
    expect(new Set(APPS.map((a) => a.slug)).size).toBe(102);
    APPS.forEach((a) => {
      expect(a.price).toBeGreaterThanOrEqual(199);
      expect(a.price).toBeLessThanOrEqual(1990);
    });
  });

  it('every module costs about a third of its apps bought singly', () => {
    Object.keys(MODULE_PRICING).forEach((id) => {
      const apps = byModule(id);
      const sum = apps.reduce((acc, a) => acc + a.price, 0);
      const ratio = MODULE_PRICING[id] / sum;
      if (apps.length >= 8) {
        expect(ratio).toBeGreaterThan(0.3);
        expect(ratio).toBeLessThan(0.42);
      } else {
        expect(ratio).toBeGreaterThan(0.45);
        expect(ratio).toBeLessThan(0.65);
      }
    });
  });

  it('a module always beats buying its apps individually, and costs more than its dearest app', () => {
    Object.keys(MODULE_PRICING).forEach((id) => {
      const apps = byModule(id);
      expect(MODULE_PRICING[id]).toBeLessThan(apps.reduce((acc, a) => acc + a.price, 0));
      expect(MODULE_PRICING[id]).toBeGreaterThan(Math.max(...apps.map((a) => a.price)));
    });
  });

  it('is never cheaper than the platform fee it sits on top of', () => {
    Object.values(MODULE_PRICING).forEach((p) => expect(p).toBeGreaterThan(299));
  });
});
