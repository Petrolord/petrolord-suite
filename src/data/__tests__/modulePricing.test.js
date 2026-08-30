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

describe('the shared table', () => {
  it('prices every module it names, positively', () => {
    const entries = Object.entries(MODULE_PRICING);
    expect(entries.length).toBe(8);
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
  it('seeds exactly the shared table', () => {
    const sql = read(MIGRATION);
    const json = sql.match(/'(\{"geoscience[^']*\})'/);
    expect(json).toBeTruthy();
    expect(JSON.parse(json[1])).toEqual(MODULE_PRICING);
  });

  it('is idempotent, so re-running it is safe', () => {
    expect(read(MIGRATION)).toMatch(/on conflict \(key\) do update/i);
  });
});

describe('the commercial rule holds', () => {
  // A module costs about 3.3x its own per-app price: roughly three apps'
  // worth of money for ten to fourteen apps. These are the a la carte prices
  // on master_apps.price as at 2026-08-30.
  const APP_PRICE = {
    geoscience: 899, drilling: 899, reservoir: 899, facilities: 699,
    production: 699, economics: 599, 'midstream-downstream': 599, assurance: 499,
  };
  const APP_COUNT = {
    geoscience: 10, drilling: 12, reservoir: 13, facilities: 13,
    production: 12, economics: 12, 'midstream-downstream': 10, assurance: 14,
  };

  it('every module costs between three and four of its own apps', () => {
    Object.keys(MODULE_PRICING).forEach((id) => {
      const ratio = MODULE_PRICING[id] / APP_PRICE[id];
      expect(ratio).toBeGreaterThan(2.8);
      expect(ratio).toBeLessThan(4.0);
    });
  });

  it('a module always beats buying its apps individually', () => {
    // If this ever inverts, the bundle is pointless and the a la carte path
    // is the cheap one, which is the opposite of the intent.
    Object.keys(MODULE_PRICING).forEach((id) => {
      const alaCarte = APP_PRICE[id] * APP_COUNT[id];
      expect(MODULE_PRICING[id]).toBeLessThan(alaCarte);
      const discount = 1 - MODULE_PRICING[id] / alaCarte;
      expect(discount).toBeGreaterThan(0.6);
      expect(discount).toBeLessThan(0.85);
    });
  });

  it('is never cheaper than the platform fee it sits on top of', () => {
    Object.values(MODULE_PRICING).forEach((p) => expect(p).toBeGreaterThan(299));
  });
});
