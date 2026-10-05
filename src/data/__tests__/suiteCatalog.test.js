// Guards the public catalogue that the homepage and Solutions page read.
import fs from 'fs';
import path from 'path';
import { SUITE_MODULES, suiteStats, NEXTGEN_LIVE_COURSES, NEXTGEN_APP_COURSES } from '@/data/suiteCatalog';
import LIVE from '@/data/__fixtures__/live-catalogue.json';
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

  // The reconciled homepage counts (docs/scope/Homepage-Counts.md), pinned
  // to a read-only snapshot of the live databases taken 2026-10-05. Change
  // the lists, the constants and the snapshot together.
  it('matches the live catalogue snapshot module by module, name by name', () => {
    expect(LIVE.taken).toBe('2026-10-05');
    const live = {};
    for (const a of LIVE.suiteLiveApps) (live[a.module] ||= []).push(a.name);
    const listed = Object.fromEntries(SUITE_MODULES.map((m) => [m.slug, [...m.apps].sort()]));
    for (const k of Object.keys(live)) live[k].sort();
    expect(listed).toEqual(live);
    expect(suiteStats()).toEqual({ apps: 104, modules: 10, modulesWord: 'Ten' });
    expect(suiteStats().apps).toBe(LIVE.suiteLiveApps.length);
  });

  it('counts only apps that have a route on main', () => {
    const app = read('App.jsx');
    const unrouted = LIVE.suiteLiveApps.filter(
      (a) => !app.includes(`appId="${a.slug}"`) && !app.includes(`path="apps/${a.module}/${a.slug}"`),
    );
    expect(unrouted).toEqual([]);
  });

  it('pins the NextGen course figures to the academy catalogue', () => {
    const available = LIVE.nextgenCourses.filter((c) => c.status === 'available');
    expect(NEXTGEN_LIVE_COURSES).toBe(available.length);
    expect(NEXTGEN_APP_COURSES).toBe(available.filter((c) => c.courseType === 'app').length);
    expect([NEXTGEN_LIVE_COURSES, NEXTGEN_APP_COURSES]).toEqual([79, 72]);
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

  it('shows the brand wordmark and lists the UK office and phone before Nigeria', () => {
    expect(home).toContain("'/petrolord-suite-wordmark.png'");
    expect(home.indexOf('+44 7403 660720')).toBeLessThan(home.indexOf('+234 901 556 6981'));
    expect(home.indexOf('London EC1V 2NX')).toBeLessThan(home.indexOf('Lekki Phase 1'));
  });

  it('send signed-in visitors to the real quote route', () => {
    expect(home).toContain("'/dashboard/upgrade'");
    expect(home).not.toContain("'/dashboard/get-quote'");
    expect(home).not.toMatch(/navigate\('\/get-quote'\)/);
  });
});
