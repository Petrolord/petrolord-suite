/**
 * The Midstream & Downstream routes must match the tiles that link to them.
 *
 * WHY THIS EXISTS. The dashboard builds every tile's URL as
 * /dashboard/apps/${module}/${slug} from the master_apps row, so a route
 * whose path does not equal the seeded slug is a tile that links into a 404.
 * Nothing else in the suite catches it: the app mounts, its own tests pass,
 * the build is clean, and the only symptom appears after the tile migration
 * is applied in production.
 *
 * DS6 shipped with `fuel-pricing-studio` in App.jsx against
 * `fuel-pricing-supply-chain` in the seed, and it was found by reading the
 * seed rather than by any test. This is that test.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const seedSource = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260829850000_ds0_seed_midstream_downstream.sql'),
  'utf8',
);

/** Slugs the seed creates tiles for. */
const seededSlugs = [...seedSource.matchAll(/\('([a-z0-9-]+)', '[^']+',/g)].map((m) => m[1]);

/** Routes App.jsx serves under the module. */
const routes = [...appSource.matchAll(
  /path="apps\/midstream-downstream\/([a-z0-9-]+)"[^>]*?appId="([a-z0-9-]+)"/g,
)].map((m) => ({ path: m[1], appId: m[2] }));

describe('Midstream & Downstream routing', () => {
  it('finds the seeded tiles and the routed apps', () => {
    expect(seededSlugs.length).toBe(10);
    expect(routes.length).toBeGreaterThan(0);
  });

  it('routes every app at the slug its tile was seeded with', () => {
    routes.forEach((r) => {
      // A mismatch here is a dashboard tile that links into a 404.
      expect(seededSlugs).toContain(r.path);
    });
  });

  it('gates every route on the same slug it is served at', () => {
    routes.forEach((r) => {
      // appId is what the entitlement check resolves; a drift between it and
      // the path gates the wrong app, or no app at all.
      expect(r.appId).toBe(r.path);
    });
  });

  it('serves each slug once', () => {
    const paths = routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
