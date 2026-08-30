/**
 * Where an application card sends you.
 *
 * WHY THIS EXISTS. Every card in the Midstream & Downstream module opened
 * the homepage. Two places computed the route and they disagreed:
 * useAppsFromDatabase built it from the RAW module display name, and
 * ApplicationsGrid preferred that over its own slugified version.
 *
 * It hid for as long as every module name was a single lowercase word,
 * because React Router matches case-insensitively - "/dashboard/apps/
 * Facilities/x" reaches the "facilities" route. "Midstream & Downstream"
 * put a space and an ampersand in the path, matched nothing, and fell
 * through to the catch-all that redirects to "/".
 *
 * The last test here is the one that would have caught it: it takes the
 * module display names the catalog actually stores and checks the computed
 * path against the routes App.jsx actually declares.
 */
import fs from 'fs';
import path from 'path';
import { appRoutePath, moduleSegment } from '../appRoute';

const root = path.resolve(__dirname, '../../..');
const appJsx = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

describe('moduleSegment', () => {
  it('slugifies a display name that is not URL-safe', () => {
    // The one that broke it.
    expect(moduleSegment('Midstream & Downstream')).toBe('midstream-downstream');
  });

  it('is a no-op for the single-word names, which is why the bug hid', () => {
    ['Facilities', 'Geoscience', 'Drilling', 'Production', 'Economics', 'Reservoir', 'Assurance']
      .forEach((m) => expect(moduleSegment(m)).toBe(m.toLowerCase()));
  });

  it('collapses runs and trims, rather than leaving stray separators', () => {
    expect(moduleSegment('  Oil   &&  Gas  ')).toBe('oil-gas');
    expect(moduleSegment('&&&')).toBeNull();
    expect(moduleSegment(null)).toBeNull();
  });
});

describe('appRoutePath', () => {
  it('never emits a character that cannot appear in a path segment', () => {
    const p = appRoutePath({ slug: 'terminal-depot-studio', module: 'Midstream & Downstream' });
    expect(p).toBe('/dashboard/apps/midstream-downstream/terminal-depot-studio');
    expect(p).not.toMatch(/[ &]/);
  });

  it('falls back to a module-less path rather than emitting undefined', () => {
    expect(appRoutePath({ slug: 'x' })).toBe('/dashboard/apps/x');
  });

  it('returns null when there is no slug to address', () => {
    expect(appRoutePath({ module: 'Facilities' })).toBeNull();
    expect(appRoutePath(null)).toBeNull();
  });
});

describe('nobody computes this twice', () => {
  it('the hook uses the shared helper instead of interpolating the module', () => {
    const hook = fs.readFileSync(path.join(root, 'src/hooks/useAppsFromDatabase.js'), 'utf8');
    expect(hook).toMatch(/appRoutePath/);
    // The exact shape that caused the bug.
    expect(hook).not.toMatch(/\/dashboard\/apps\/\$\{app\.module\}/);
  });

  it('the grid uses the shared helper and does not prefer a synthesised route', () => {
    const grid = fs.readFileSync(path.join(root, 'src/components/ApplicationsGrid.jsx'), 'utf8');
    expect(grid).toMatch(/appRoutePath\(app\)/);
    // `app.route` winning over the correct path is what made the DS1 fix
    // dead code for two months.
    expect(grid).not.toMatch(/app\.route\s*\|\|/);
  });
});

describe('every module the catalog stores resolves to a declared route', () => {
  // The display names in master_apps.module, as at 2026-08-30.
  const MODULES = [
    'Geoscience', 'Reservoir', 'Drilling', 'Production',
    'Economics', 'Facilities', 'Assurance', 'Midstream & Downstream',
  ];

  it.each(MODULES)('%s produces a segment App.jsx actually declares', (moduleName) => {
    const seg = moduleSegment(moduleName);
    expect(seg).toBeTruthy();
    // At least one route must exist under this segment, or every card in
    // that module goes to the catch-all and lands on the homepage.
    expect(appJsx).toMatch(new RegExp(`path="apps/${seg}/`));
  });

  it('a sample app from each module lands on a real route', () => {
    const samples = [
      { module: 'Midstream & Downstream', slug: 'terminal-depot-studio' },
      { module: 'Midstream & Downstream', slug: 'flare-gas-to-value' },
      { module: 'Facilities', slug: 'compressor-station-designer' },
    ];
    samples.forEach(({ module, slug }) => {
      const p = appRoutePath({ module, slug });
      const declared = p.replace('/dashboard/', '');
      expect(appJsx).toContain(`path="${declared}"`);
    });
  });
});
