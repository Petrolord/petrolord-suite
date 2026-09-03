import {
  WELL_APPS, DEV_APP_PATHS, appPath, buildOpenInHref, wellDataManagerHref, parseWellsParam, moduleHomePath,
} from '../appLinks';

const byId = (id) => WELL_APPS.find((a) => a.id === id);

describe('appLinks', () => {
  test('every well app resolves to its Geoscience route by default', () => {
    for (const app of WELL_APPS) {
      expect(appPath(app.id)).toBe(`/dashboard/apps/geoscience/${app.id}`);
    }
  });

  test('Petrophysics opens on one well, Well Correlation on a list', () => {
    expect(buildOpenInHref(byId('petrophysics-studio'), ['w-1'])).toBe('/dashboard/apps/geoscience/petrophysics-studio?well=w-1');
    expect(buildOpenInHref(byId('petrophysics-studio'), ['w-1', 'w-2'])).toBe('/dashboard/apps/geoscience/petrophysics-studio?well=w-1');
    expect(buildOpenInHref(byId('well-correlation'), ['w-1', 'w-2'])).toBe('/dashboard/apps/geoscience/well-correlation?wells=w-1,w-2');
  });

  test('apps without a preselection open on their plain route, and no wells means the plain route everywhere', () => {
    expect(buildOpenInHref(byId('rock-physics-studio'), ['w-1'])).toBe('/dashboard/apps/geoscience/rock-physics-studio');
    expect(buildOpenInHref(byId('petrophysics-studio'), [])).toBe('/dashboard/apps/geoscience/petrophysics-studio');
    expect(buildOpenInHref(byId('well-correlation'), null)).toBe('/dashboard/apps/geoscience/well-correlation');
  });

  test('harness overrides swap the route but keep the query', () => {
    expect(buildOpenInHref(byId('well-correlation'), ['corr-w1', 'corr-w2'], DEV_APP_PATHS))
      .toBe('/dev/well-correlation?wells=corr-w1,corr-w2');
    expect(buildOpenInHref(byId('seismolord'), ['w-1'], DEV_APP_PATHS)).toBe('/dashboard/apps/geoscience/seismolord');
  });

  test('well ids are URL-encoded', () => {
    expect(buildOpenInHref(byId('petrophysics-studio'), ['a b/c'])).toBe('/dashboard/apps/geoscience/petrophysics-studio?well=a%20b%2Fc');
  });

  test('Well Data Manager deep link carries the tab', () => {
    expect(wellDataManagerHref('w-1', 'tops')).toBe('/dashboard/apps/geoscience/well-data-manager?well=w-1&tab=tops');
    expect(wellDataManagerHref('w-1', 'checkshots', '/dev/well-data-manager')).toBe('/dev/well-data-manager?well=w-1&tab=checkshots');
    expect(wellDataManagerHref('w-1', null)).toBe('/dashboard/apps/geoscience/well-data-manager?well=w-1');
  });

  test('parseWellsParam trims, drops empties and duplicates, keeps order', () => {
    expect(parseWellsParam('a, b,,a ,c')).toEqual(['a', 'b', 'c']);
    expect(parseWellsParam('')).toEqual([]);
    expect(parseWellsParam(null)).toEqual([]);
    expect(parseWellsParam(undefined)).toEqual([]);
  });

  test('module home path', () => {
    expect(moduleHomePath('geoscience')).toBe('/dashboard/geoscience');
  });
});
