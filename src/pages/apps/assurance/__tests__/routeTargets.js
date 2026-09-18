/**
 * AS13: does every `${BASE}...` target in an app resolve to a route
 * that is actually declared?
 *
 * Quality Assurance Plan sent every register row to `${BASE}/plan/<id>`
 * while its routes declared `:planId` at the root, so each click fell
 * through the catch-all and showed the Dashboard. A regex over the app
 * tree finds that; reading page by page did not.
 *
 * A literal target segment must match a literal route segment, and an
 * interpolated one (`${id}`) must land on a parameter, so a typo cannot
 * pass by matching `:id`.
 */

/** Route paths under `prefix` in App.jsx, as segment arrays. */
export const routesFromApp = (appSource, prefix) => [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p === prefix || p.startsWith(`${prefix}/`))
  .map((p) => p.slice(prefix.length).split('/').filter(Boolean));

/** Every `${BASE}...` template literal in the given sources. */
export const baseTargets = (sources) => sources.flatMap(({ file, src }) => [
  ...src.matchAll(/`\$\{BASE\}([^`]*)`/g),
].map((m) => ({ file, target: m[1] })));

export const resolves = (declared, target) => {
  const segments = target.split(/[?#]/)[0].split('/').filter(Boolean)
    .map((s) => (/^\$\{/.test(s) ? ':dynamic' : s));
  return declared.some((route) => route.length === segments.length
    && route.every((r, i) => (r.startsWith(':') ? segments[i] === ':dynamic' : r === segments[i])));
};

export const unresolved = (declared, targets) => targets
  .filter((t) => !resolves(declared, t.target))
  .map((t) => `${t.file}: ${t.target}`);
