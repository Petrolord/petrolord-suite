// Route protection guard (2026-09-30, docs/scope/AppRouteProtection-STATUS.md).
//
// Every paid app under /dashboard/apps/** must render behind ProtectedAppRoute,
// the licence gate. About 25 Reservoir and Geoscience routes used to render
// their app directly, so anyone signed in could open a paid app (MAP-U1-035).
// This test reads src/App.jsx and fails when:
//   1. an app route renders a component outside ProtectedAppRoute and is not
//      on the allow list below (with its reason);
//   2. a route's appId is missing from the master_apps snapshot
//      (src/data/masterAppSlugs.json), or none of its ids is an Active app,
//      which would lock every customer out (the edge function only grants
//      slugs that exist, and internal orgs only Active ones);
//   3. a legacy redirect under /dashboard/apps lands on a route that is not
//      protected, or on no route at all.
// The negative controls run the same checker over App.jsx with one route
// unwrapped, and with an appId swapped for a slug that does not exist.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/masterAppSlugs.json'), 'utf8'));

// Routes under /dashboard/apps that may render without the licence gate.
// Each entry needs a reason; an empty list is the goal.
export const ALLOW_UNPROTECTED = {
  // (none at present)
};

// Redirect targets outside /dashboard/apps that need no licence: the
// dashboard landing and the module hubs (which gate their own tiles).
const PUBLIC_TARGET = /^\/dashboard(\/(geoscience|reservoir|drilling|production|economics|facilities|midstream-downstream|process-safety|data-ai|assurance))?$/;

const ROUTE_RE = /<Route\s+path="((?:\/dashboard\/)?apps\/[^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g;

export function parseAppRoutes(src) {
  const routes = [];
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(src))) {
    const [, rawPath, element] = m;
    const p = rawPath.replace(/^\/dashboard\//, '');
    const el = element.trim();
    const nav = el.match(/^<Navigate\s+to="([^"]+)"/);
    if (nav) { routes.push({ path: p, kind: 'redirect', to: nav[1] }); continue; }
    const guard = el.match(/^<ProtectedAppRoute\s+appId=(?:"([^"]+)"|\{\[([^\]]+)\]\})[^>]*>\s*<(\w+)[\s\S]*<\/ProtectedAppRoute>$/);
    if (guard) {
      const ids = guard[1] ? [guard[1]] : [...guard[2].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]);
      routes.push({ path: p, kind: 'protected', ids, component: guard[3] });
      continue;
    }
    const comp = el.match(/^<(\w+)/);
    routes.push({ path: p, kind: 'bare', component: comp ? comp[1] : el.slice(0, 40) });
  }
  return routes;
}

const toRegex = (routePath) => new RegExp(`^/dashboard/${routePath
  .replace(/\/\*$/, '(?:/.*)?')
  .replace(/:[^/]+/g, '[^/]+')}$`);

export function findProblems(src, snapshot = SNAPSHOT, allow = ALLOW_UNPROTECTED) {
  const problems = [];
  const routes = parseAppRoutes(src);
  const declared = (src.match(/<Route\s+path="(?:\/dashboard\/)?apps\//g) || []).length;
  if (declared !== routes.length) problems.push(`parsed ${routes.length} app routes of ${declared} declared; the parser missed a route shape`);

  for (const r of routes) {
    if (r.kind === 'bare' && !allow[r.path]) problems.push(`unprotected: ${r.path} renders <${r.component}> outside ProtectedAppRoute`);
    if (r.kind === 'protected') {
      const missing = r.ids.filter((id) => !(id in snapshot.apps));
      if (missing.length === r.ids.length) problems.push(`${r.path}: no appId exists in master_apps (${r.ids.join(', ')})`);
      if (!r.ids.some((id) => snapshot.apps[id] === 'Active')) problems.push(`${r.path}: no appId is an Active master_apps row (${r.ids.join(', ')})`);
    }
  }

  // redirects: the target must be a protected route, an allowed one, or a hub
  for (const r of routes.filter((x) => x.kind === 'redirect')) {
    const target = r.to.split('?')[0];
    if (PUBLIC_TARGET.test(target)) continue;
    if (!target.startsWith('/dashboard/apps/')) { problems.push(`redirect ${r.path} -> ${r.to} leaves the dashboard app routes`); continue; }
    const hit = routes.find((x) => x.kind !== 'redirect' && toRegex(x.path).test(target));
    if (!hit) problems.push(`redirect ${r.path} -> ${r.to} matches no app route`);
    else if (hit.kind === 'bare' && !allow[hit.path]) problems.push(`redirect ${r.path} -> ${r.to} lands on unprotected ${hit.path}`);
  }
  return problems;
}

describe('every /dashboard/apps route is licence-gated', () => {
  test('App.jsx has no unprotected app route, unknown appId or open redirect', () => {
    expect(findProblems(APP_SRC)).toEqual([]);
  });

  test('the parser sees the whole route table', () => {
    const routes = parseAppRoutes(APP_SRC);
    expect(routes.length).toBeGreaterThan(200);
    expect(routes.filter((r) => r.kind === 'protected').length).toBeGreaterThan(150);
  });

  test('every allow-listed route still exists and carries a reason', () => {
    const paths = new Set(parseAppRoutes(APP_SRC).map((r) => r.path));
    for (const [p, reason] of Object.entries(ALLOW_UNPROTECTED)) {
      expect(paths.has(p)).toBe(true);
      expect(String(reason).length).toBeGreaterThan(10);
    }
  });

  // the routes this change wrapped, by the slug a paying customer holds
  test.each([
    ['geoscience/basinflow-genesis', 'basinflow-genesis'],
    ['reservoir/fluid-systems-studio', 'fluid-systems-studio'],
    ['reservoir/voidage-replacement-monitor', 'voidage-replacement-monitor'],
    ['reservoir/waterflood-design-studio', 'fractional-flow-calculator'],
    ['reservoir/fractional-flow-calculator', 'fractional-flow-calculator'],
    ['reservoir/scal-studio', 'scal-studio'],
    ['reservoir/well-test-analysis-studio', 'well-test-analyzer'],
    ['reservoir/well-test-analyzer', 'well-test-analyzer'],
    ['reservoir/recovery-factor-estimator', 'recovery-factor-estimator'],
    ['reservoir/risked-reserves-valuation', 'risked-reserves-valuation'],
    ['reservoir/eor-screening', 'eor-screening'],
    ['reservoir/forecast-scenario-hub', 'forecast-scenario-hub'],
    ['reservoir/decline-curve-analysis', 'decline-curve-analysis'],
    ['reservoir/reservoir-balance', 'reservoir-balance'],
    ['reservoir/material-balance-studio/cases/:caseId', 'reservoir-balance'],
    ['reservoir/reservoir-balance-surveillance', 'reservoir-balance'],
  ])('apps/%s is gated on %s', (p, slug) => {
    const r = parseAppRoutes(APP_SRC).find((x) => x.path === `apps/${p}`);
    expect(r).toMatchObject({ kind: 'protected', ids: [slug] });
  });
});

describe('negative controls: the guard fails when it should', () => {
  test('an unwrapped route is caught', () => {
    const broken = APP_SRC.replace(
      /<Route path="apps\/reservoir\/scal-studio" element=\{<ProtectedAppRoute[^>]*>(<ScalStudio \/>)<\/ProtectedAppRoute>\} \/>/,
      '<Route path="apps/reservoir/scal-studio" element={$1} />',
    );
    expect(broken).not.toBe(APP_SRC);
    expect(findProblems(broken)).toContain('unprotected: apps/reservoir/scal-studio renders <ScalStudio> outside ProtectedAppRoute');
  });

  test('an allow-listed route passes, so the list is the only way out', () => {
    const broken = APP_SRC.replace(
      /<Route path="apps\/reservoir\/scal-studio" element=\{<ProtectedAppRoute[^>]*>(<ScalStudio \/>)<\/ProtectedAppRoute>\} \/>/,
      '<Route path="apps/reservoir/scal-studio" element={$1} />',
    );
    expect(findProblems(broken, SNAPSHOT, { 'apps/reservoir/scal-studio': 'test: an allowed free tool' })).toEqual([]);
  });

  test('an appId that is not in master_apps is caught', () => {
    const broken = APP_SRC.replace('appId="scal-studio"', 'appId="scal-studio-typo"');
    expect(findProblems(broken).join('\n')).toMatch(/apps\/reservoir\/scal-studio: no appId exists in master_apps/);
  });

  test('an appId that only names an Archived app is caught', () => {
    const broken = APP_SRC.replace('appId="scal-studio"', 'appId="waterflood-dashboard"');
    expect(findProblems(broken).join('\n')).toMatch(/apps\/reservoir\/scal-studio: no appId is an Active master_apps row/);
  });

  test('a redirect onto an unprotected route is caught', () => {
    const broken = APP_SRC
      .replace(/<Route path="apps\/reservoir\/scal-studio" element=\{<ProtectedAppRoute[^>]*>(<ScalStudio \/>)<\/ProtectedAppRoute>\} \/>/, '<Route path="apps/reservoir/scal-studio" element={$1} />');
    expect(findProblems(broken, SNAPSHOT, {}).join('\n'))
      .toMatch(/redirect apps\/reservoir\/relative-permeability-designer -> \/dashboard\/apps\/reservoir\/scal-studio lands on unprotected/);
  });

  test('a redirect to a path with no route is caught', () => {
    const broken = APP_SRC.replace('to="/dashboard/apps/reservoir/scal-studio"', 'to="/apps/reservoir/scal-studio"');
    expect(findProblems(broken).join('\n')).toMatch(/relative-permeability-designer -> \/apps\/reservoir\/scal-studio leaves the dashboard app routes/);
  });
});

describe('the master_apps snapshot', () => {
  test('is the production export (327 rows, slug to status)', () => {
    expect(Object.keys(SNAPSHOT.apps).length).toBeGreaterThanOrEqual(300);
    expect(new Set(Object.values(SNAPSHOT.apps))).toEqual(new Set(['Active', 'Archived']));
    expect(SNAPSHOT._refresh).toMatch(/master_apps/);
  });
});
