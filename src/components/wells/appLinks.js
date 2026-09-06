// Cross-app links for the well registry apps (Geoscience cross-app
// navigation, 2026-09-03). Pure: the launchers (Well Data Manager's
// "Open in" menu, the explorers' reverse links) and the deep-link
// consumers (Petrophysics `?well=`, Well Correlation `?wells=`) share one
// table so a route or parameter change happens in one place.
//
// Petrophysics, Well Correlation and Mapping preselect wells from the
// query string; the rest open on their own explorer, where the registry
// well is one click away. Mapping also opens on a surface (`?surface=`)
// or grids a top on arrival (`?top=&wells=`, the "Map this top"
// launchers, MS4); Earth Modeling stacks a surface from `?surface=`.

export const DASHBOARD_BASE = '/dashboard';
export const GEOSCIENCE_APP_BASE = '/dashboard/apps/geoscience';

/** Apps that consume registry wells, in menu order. `query` builds the
 *  preselection part of the href from the well ids; absent = plain route. */
export const WELL_APPS = [
  { id: 'petrophysics-studio', label: 'Petrophysics Studio', query: (ids) => `?well=${encodeURIComponent(ids[0])}` },
  { id: 'well-correlation', label: 'Well Correlation', query: (ids) => `?wells=${ids.map(encodeURIComponent).join(',')}` },
  { id: 'mapping-surface-studio', label: 'Mapping & Surface Studio', query: (ids) => `?wells=${ids.map(encodeURIComponent).join(',')}` },
  { id: 'rock-physics-studio', label: 'Rock Physics Studio' },
  { id: 'pore-pressure-studio', label: 'Pore Pressure Studio' },
  { id: 'earth-modeling', label: 'Earth Modeling' },
  { id: 'seismolord', label: 'Seismolord' },
  { id: 'reservoircalc-pro', label: 'ReservoirCalc Pro' },
];

export const WELL_DATA_MANAGER_ID = 'well-data-manager';
export const MAPPING_ID = 'mapping-surface-studio';
export const EARTH_MODELING_ID = 'earth-modeling';

/** Harness route overrides: the /dev/* routes mount the same apps on
 *  in-memory backends, so links between harnesses stay inside the
 *  authless world the Playwright suite drives. */
export const DEV_APP_PATHS = {
  'well-data-manager': '/dev/well-data-manager',
  'petrophysics-studio': '/dev/petrophysics-studio',
  'well-correlation': '/dev/well-correlation',
  'mapping-surface-studio': '/dev/mapping-surface-studio',
  'rock-physics-studio': '/dev/rock-physics-studio',
  'pore-pressure-studio': '/dev/pore-pressure-studio',
  'earth-modeling': '/dev/earth-modeling',
};

/** Route of an app, honouring an override map (harness paths). */
export function appPath(appId, paths = {}) {
  return paths?.[appId] ?? `${GEOSCIENCE_APP_BASE}/${appId}`;
}

/** Href that opens `app` on the given wells (none = plain route). */
export function buildOpenInHref(app, wellIds, paths = {}) {
  const ids = [].concat(wellIds || []).filter(Boolean);
  const base = appPath(app.id, paths);
  return app.query && ids.length ? `${base}${app.query(ids)}` : base;
}

/** Well Data Manager deep link: `?well=<id>&tab=<tab>` (WellWorkstation
 *  reads both). */
export function wellDataManagerHref(wellId, tab = 'header', path = appPath(WELL_DATA_MANAGER_ID)) {
  const q = new URLSearchParams();
  q.set('well', wellId);
  if (tab) q.set('tab', tab);
  return `${path}?${q.toString()}`;
}

/** Mapping & Surface Studio deep link that grids `topName` on arrival,
 *  from `wellIds` when given (else every well carrying the top). */
export function mapTopHref(topName, wellIds = [], path = appPath(MAPPING_ID)) {
  const q = new URLSearchParams();
  q.set('top', topName);
  const ids = [].concat(wellIds || []).filter(Boolean);
  if (ids.length) q.set('wells', ids.join(','));
  return `${path}?${q.toString()}`;
}

/** Mapping & Surface Studio deep link that selects a surface. */
export function mapSurfaceHref(surfaceId, path = appPath(MAPPING_ID)) {
  return `${path}?surface=${encodeURIComponent(surfaceId)}`;
}

/** Earth Modeling deep link that stacks a surface on arrival. */
export function earthModelingSurfaceHref(surfaceId, path = appPath(EARTH_MODELING_ID)) {
  return `${path}?surface=${encodeURIComponent(surfaceId)}`;
}

/** `?wells=a,b,,a ` -> ['a', 'b'] (trim, drop empties, first occurrence wins). */
export function parseWellsParam(raw) {
  if (!raw) return [];
  const out = [];
  for (const part of String(raw).split(',')) {
    const id = part.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Module dashboard route, e.g. `/dashboard/geoscience`. */
export function moduleHomePath(module) {
  return `${DASHBOARD_BASE}/${module}`;
}

export const MODULE_LABELS = {
  geoscience: 'Geoscience',
  reservoir: 'Reservoir',
  drilling: 'Drilling',
  production: 'Production',
  economics: 'Economics',
  facilities: 'Facilities',
  'midstream-downstream': 'Midstream & Downstream',
  assurance: 'Assurance',
};
