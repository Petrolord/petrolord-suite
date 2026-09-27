/**
 * The quote screens (src/data/quotePricing.js) and generate-quote
 * (supabase/functions/_shared/suite-pricing.ts, authoritative) apply the
 * same pricing rules. These tests run the same scenarios through both, and
 * check that the constants, the server fallbacks and the migration that
 * seeds pricing_config all agree.
 */
import fs from 'fs';
import path from 'path';
import * as client from '../quotePricing';
import {
  SEAT_TIERS, ESSENTIALS_SEAT_TIERS, ESSENTIALS_SEAT_APPS, INCLUDED_WITH,
  ALL_ACCESS_PRICE, PLATFORM_FEE_WAIVED_TERMS, MODULE_PRICING,
} from '../pricingModels';
import * as server from '../../../supabase/functions/_shared/suite-pricing.ts';

const root = path.resolve(__dirname, '../../..');
const MIGRATION = fs.readFileSync(path.join(root, 'supabase/migrations/20260927120000_suite_pricing_2026_09.sql'), 'utf8');
const configValue = (key) => {
  const m = MIGRATION.match(new RegExp(`\\('${key}', '([^']*)'::jsonb\\)`));
  if (!m) throw new Error(`migration does not set ${key}`);
  return JSON.parse(m[1]);
};
const rulesFromMigration = server.pricingRulesFromConfig({
  essentials_seat_tiers: configValue('essentials_seat_tiers'),
  essentials_seat_apps: configValue('essentials_seat_apps'),
  bundle_included_with: configValue('bundle_included_with'),
  all_access_price: configValue('all_access_price'),
});
const serverDefaults = server.pricingRulesFromConfig({});

describe('one set of rules', () => {
  it('client constants equal the server fallbacks', () => {
    expect(SEAT_TIERS).toEqual(server.SEAT_TIERS_FALLBACK);
    expect(ESSENTIALS_SEAT_TIERS).toEqual(server.ESSENTIALS_SEAT_TIERS_FALLBACK);
    expect([...ESSENTIALS_SEAT_APPS].sort()).toEqual([...server.ESSENTIALS_SEAT_APPS_FALLBACK].sort());
    expect(INCLUDED_WITH).toEqual(server.INCLUDED_WITH_FALLBACK);
    expect(ALL_ACCESS_PRICE).toBe(server.ALL_ACCESS_PRICE_FALLBACK);
    expect(PLATFORM_FEE_WAIVED_TERMS).toEqual(server.PLATFORM_FEE_WAIVED_TERMS);
  });

  it('the migration seeds pricing_config with the same values', () => {
    expect(rulesFromMigration.essentialsSeatTiers).toEqual(ESSENTIALS_SEAT_TIERS);
    expect([...rulesFromMigration.essentialsApps].sort()).toEqual([...ESSENTIALS_SEAT_APPS].sort());
    expect(rulesFromMigration.includedWith).toEqual(INCLUDED_WITH);
    expect(rulesFromMigration.allAccessPrice).toBe(ALL_ACCESS_PRICE);
  });

  it('every Essentials and bundled app is a real priced app', () => {
    const priced = new Set([...MIGRATION.matchAll(/\('([a-z0-9-]+)', '[a-z-]+', \d+\)/g)].map((m) => m[1]));
    ESSENTIALS_SEAT_APPS.forEach((slug) => expect(priced.has(slug)).toBe(true));
    Object.entries(INCLUDED_WITH).forEach(([app, host]) => {
      expect(priced.has(app)).toBe(true);
      expect(priced.has(host)).toBe(true);
    });
  });

  it('a malformed config row falls back instead of zeroing prices', () => {
    const r = server.pricingRulesFromConfig({ essentials_seat_tiers: 'nonsense', all_access_price: -5 });
    expect(r.essentialsSeatTiers).toEqual(server.ESSENTIALS_SEAT_TIERS_FALLBACK);
    expect(r.allAccessPrice).toBe(server.ALL_ACCESS_PRICE_FALLBACK);
  });
});

describe('same scenarios, same answers', () => {
  const seatCases = [
    ['seismolord', 1], ['seismolord', 3], ['seismolord', 12], ['seismolord', 50],
    ['risk-register', 1], ['risk-register', 10], ['document-control', 45], ['decision-studio', 3],
  ];
  it.each(seatCases)('seat cost for %s x %i', (slug, n) => {
    expect(client.appSeatCost(slug, n)).toBe(server.appSeatCost(slug, n, serverDefaults));
  });

  it('Essentials seats are cheaper and standard seats are unchanged', () => {
    expect(client.appSeatCost('risk-register', 10)).toBe(5 * 19 + 5 * 15);
    expect(client.appSeatCost('seismolord', 10)).toBe(5 * 49 + 5 * 39);
  });

  it('an included app is free only when its host is quoted', () => {
    const withHost = new Set(['risk-register', 'risk-heatmap']);
    const alone = new Set(['risk-heatmap']);
    expect(client.includedWithHost('risk-heatmap', withHost)).toBe('risk-register');
    expect(server.includedWithHost('risk-heatmap', withHost, serverDefaults)).toBe('risk-register');
    expect(client.includedWithHost('risk-heatmap', alone)).toBeNull();
    expect(server.includedWithHost('risk-heatmap', alone, serverDefaults)).toBeNull();
    const line = client.priceApp({ slug: 'risk-heatmap', moduleSlug: 'assurance', price: 199, seats: 4 }, { quotedSlugs: withHost });
    expect(line).toMatchObject({ licence: 0, seatCost: 0, includedWith: 'risk-register' });
  });

  it.each([
    [[], 'monthly', false], [[], 'quarterly', false], [[], 'annual', true], [[], '2year', true],
    [['geoscience'], 'monthly', true],
  ])('platform fee waived for modules %j on %s: %s', (mods, term, waived) => {
    expect(client.platformFeeWaived(mods, term)).toBe(waived);
    expect(server.platformFeeWaived(mods, term)).toBe(waived);
  });

  it.each([
    [['geoscience']], [['geoscience', 'reservoir', 'drilling']], [Object.keys(MODULE_PRICING)],
  ])('module charge for %j', (mods) => {
    expect(client.modulesCharge(mods)).toEqual(server.modulesCharge(mods, MODULE_PRICING, serverDefaults));
  });

  it('every module together is the all-access price', () => {
    const all = client.modulesCharge(Object.keys(MODULE_PRICING));
    expect(all).toEqual({ allAccess: true, total: ALL_ACCESS_PRICE });
    const nine = client.modulesCharge(Object.keys(MODULE_PRICING).slice(1));
    expect(nine.allAccess).toBe(false);
  });

  it('a module-covered app carries seats but no licence', () => {
    const line = client.priceApp({ slug: 'seismolord', moduleSlug: 'geoscience', price: 1490, seats: 3 }, { moduleSlugs: ['geoscience'] });
    expect(line).toMatchObject({ licence: 0, seatCost: 147, covered: true });
    const alaCarte = client.priceApp({ slug: 'seismolord', moduleSlug: 'geoscience', price: 1490, seats: 3 });
    expect(alaCarte.licence).toBe(1490);
  });
});

describe('the quote screens use the rules', () => {
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  it('neither screen prices from the old hardcoded app list', () => {
    const qb = read('src/pages/QuoteBuilder.jsx');
    expect(qb).not.toMatch(/getAppPrice/);
    expect(qb).toMatch(/price: Number\(app\.price\) \|\| 0/);
    expect(read('src/data/pricingModels.js')).not.toMatch(/SPECIAL_APP_PRICING|getAppPrice/);
  });
  it('the upgrade screen sends module slugs, never module ids, and starts with no module', () => {
    const qb = read('src/pages/QuoteBuilder.jsx');
    expect(qb).toMatch(/modules: selectedModules\.map\(id => appsGroupedByModule\[id\]\?\.slug\)/);
    expect(qb).not.toMatch(/useState\(\['geoscience'\]\)/);
  });
  it('generate-quote applies the shared rules', () => {
    const src = read('supabase/functions/generate-quote/index.ts');
    ['pricingRulesFromConfig(configMap)', 'includedWithHost(', 'platformFeeWaived(', 'modulesCharge(', 'ruleSeatCost('].forEach((s) => expect(src).toContain(s));
  });
});
