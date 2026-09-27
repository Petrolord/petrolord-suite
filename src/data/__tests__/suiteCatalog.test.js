// Guards the public catalogue that the homepage and Solutions page read.
import fs from 'fs';
import path from 'path';
import { SUITE_MODULES, suiteStats, NEXTGEN_LIVE_COURSES } from '@/data/suiteCatalog';
import { MODULE_PRICING } from '@/data/pricingModels';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

describe('the public app catalogue', () => {
  it('lists every priced module once, and prices every listed module', () => {
    const slugs = SUITE_MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual(Object.keys(MODULE_PRICING).sort());
  });

  it('names each app once across the whole suite', () => {
    const apps = SUITE_MODULES.flatMap((m) => m.apps);
    expect(new Set(apps).size).toBe(apps.length);
  });

  it('matches the live catalogue checked on 2026-09-27', () => {
    // 102 Active, built and functional tiles in master_apps. Update this
    // number together with the module lists when an app goes live.
    expect(suiteStats()).toEqual({ apps: 102, modules: 10, modulesWord: 'Ten' });
    expect(NEXTGEN_LIVE_COURSES).toBeGreaterThan(0);
  });

  it('follows the owner copy rule: no em or en dashes', () => {
    for (const m of SUITE_MODULES) {
      expect(`${m.name} ${m.tagline} ${m.description}`).not.toMatch(/[–—]/);
    }
  });
});

describe('the pages that read it', () => {
  const home = read('pages/Home.jsx');
  const solutions = read('pages/Solutions.jsx');

  it('derive their counts instead of typing them', () => {
    for (const page of [home, solutions]) {
      expect(page).toContain("from '@/data/suiteCatalog'");
      expect(page).not.toMatch(/\d+\+ (apps|applications|Engineering)/i);
    }
  });

  it('keep public copy free of em and en dashes', () => {
    // Strip comments first: the rule covers what visitors read.
    const visible = home.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(visible).not.toMatch(/[–—]/);
  });

  it('keep prices off the homepage (owner, 2026-09-27: prices live in the quote builder)', () => {
    expect(home).not.toMatch(/pricingModels|MODULE_PRICING|SEAT_TIERS/);
    const visible = home.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(visible).not.toMatch(/\$\d|\$\{usd/);
    expect(read('../index.html')).not.toMatch(/published prices/i);
  });

  it('send signed-in visitors to the real quote route', () => {
    expect(home).toContain("'/dashboard/get-quote'");
    expect(home).not.toMatch(/navigate\('\/get-quote'\)/);
  });
});
