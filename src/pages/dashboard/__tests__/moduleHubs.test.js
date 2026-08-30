/**
 * Module hubs list applications from the catalog and from nowhere else.
 *
 * WHY THIS EXISTS. Two hand-written lists went stale the moment their apps
 * shipped, and both were visible to the owner on the live site:
 *
 *  - The Midstream & Downstream hub carried three "track" cards naming all
 *    ten apps as bullet points, plus a banner saying the module was being
 *    built and nothing in it was sold. All ten had gone Active.
 *  - The Facilities hub carried a "Featured Applications" card for Produced
 *    Water Treatment pointing at /apps/produced-water-treatment, a path that
 *    matches no route. The one app it promoted was the one you could not
 *    open from that page.
 *
 * A hand-written list on a hub has no way to know what the catalog says, and
 * promotes by whoever edited the file last. master_apps is the only list.
 */
import fs from 'fs';
import path from 'path';

const dir = path.resolve(__dirname, '..');
const hubs = fs.readdirSync(dir)
  .filter((f) => f.endsWith('Hub.jsx'))
  .map((f) => ({ name: f, src: fs.readFileSync(path.join(dir, f), 'utf8') }));

describe('module hubs', () => {
  it('finds the hub files', () => {
    // A guard that scans nothing passes vacuously.
    expect(hubs.length).toBeGreaterThanOrEqual(5);
  });

  it('render their applications from the catalog', () => {
    hubs.forEach(({ name, src }) => {
      expect(src).toMatch(/ApplicationsGrid/);
    });
  });

  it('hard-code no route to an individual application', () => {
    // The Facilities one was broken as well as hand-written: it omitted both
    // the /dashboard prefix and the module segment.
    const offenders = hubs
      .filter(({ src }) => /(?:Link\s+to|navigate\()\s*=?\s*["'`]\/(?:dashboard\/)?apps\//.test(src))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('have no featured-application section', () => {
    // Not in the playbook: it promotes by edit history rather than by merit.
    const offenders = hubs.filter(({ src }) => /Featured/i.test(src)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('do not claim a shipped module is still being built', () => {
    const offenders = hubs
      .filter(({ src }) => /is being built|Nothing here is sold|listed as Coming Soon/i.test(src))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});

describe('the Midstream & Downstream hub specifically', () => {
  const src = hubs.find((h) => h.name === 'MidstreamDownstreamHub.jsx').src;

  it('no longer carries the track narrative', () => {
    expect(src).not.toMatch(/Refining core/);
    expect(src).not.toMatch(/Commercial and logistics/);
    expect(src).not.toMatch(/Energy transition/);
    expect(src).not.toMatch(/const TRACKS/);
  });

  it('names none of its ten applications by hand', () => {
    [
      'Crude Assay & Blending Studio', 'Product Blending Optimizer',
      'Refinery Planning & Scheduling Studio', 'Modular Refinery Feasibility Studio',
      'Terminal & Depot Studio', 'Fuel Pricing & Supply Chain Studio',
      'LPG & CNG Rollout Studio', 'Energy & Utilities Efficiency Studio',
      'Carbon Footprint & Abatement Studio', 'Flare Gas to Value Studio',
    ].forEach((app) => expect(src).not.toContain(app));
  });

  it('still filters on the exact module text the catalog stores', () => {
    // useAppsFromDatabase compares master_apps.module, a display name.
    expect(src).toMatch(/MODULE_FILTER = 'Midstream & Downstream'/);
  });
});
