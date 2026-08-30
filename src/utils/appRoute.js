// Where an application lives, computed in exactly one place.
//
// WHY THIS FILE EXISTS. There were two of these and they disagreed.
//
// useAppsFromDatabase synthesised `route` from the RAW module display name:
//   `/dashboard/apps/${app.module}/${app.slug}`
// while ApplicationsGrid computed a correctly SLUGIFIED path - and then
// preferred `app.route` over its own, so the slugified version was dead
// code.
//
// It went unnoticed for as long as every module name happened to be a
// single lowercase word: React Router matches case-insensitively, so
// "/dashboard/apps/Facilities/..." reached the "facilities" route. The
// moment a module was called "Midstream & Downstream" the synthesised path
// contained a space and an ampersand, matched nothing, and fell through to
// the catch-all that sends unmatched paths to the homepage. Every card in
// that module opened the homepage.
//
// One function now, used by both.

/**
 * The URL segment for a module display name.
 *
 * master_apps.module is a display name ("Midstream & Downstream"), not a
 * slug, so it has to be slugified before it can appear in a URL. This is a
 * no-op for the single-word module names, which is why the bug hid.
 */
export const moduleSegment = (moduleName) => {
  if (!moduleName) return null;
  const seg = String(moduleName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return seg || null;
};

/**
 * The dashboard path for an application row from master_apps.
 *
 * Returns null when the row cannot address an app, so a caller can decide
 * what to do rather than being handed a path that silently goes nowhere.
 */
export const appRoutePath = (app) => {
  if (!app || !app.slug) return null;
  const seg = moduleSegment(app.module);
  return seg
    ? `/dashboard/apps/${seg}/${app.slug}`
    : `/dashboard/apps/${app.slug}`;
};
