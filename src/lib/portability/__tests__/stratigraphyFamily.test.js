// Stratigraphy tables in the Geoscience package family (ST0 + ST1): units
// travel with the tops that name them, intervals and core images are
// children of the well, insertion order puts parents first, and a core
// image's blob keeps its own content type.

import { getFamily, tableSpec, importOrder } from '../familySpec';
import '../geoscienceHooks';

test('the geoscience family carries the stratigraphy tables in dependency order', () => {
  const fam = getFamily('geoscience');
  const order = fam.order;
  expect(order.indexOf('geo_strat_units')).toBeLessThan(order.indexOf('geo_wells_tops'));
  expect(order.indexOf('geo_wells')).toBeLessThan(order.indexOf('geo_wells_intervals'));
  expect(order.indexOf('geo_wells')).toBeLessThan(order.indexOf('geo_wells_core_images'));
  expect(importOrder()).toEqual(expect.arrayContaining(['geo_strat_units', 'geo_wells_intervals', 'geo_wells_core_images']));
});

test('intervals and core images are children of the well; a typed top references its unit optionally', () => {
  const wells = tableSpec('geo_wells');
  expect(wells.children.map((c) => c.table)).toEqual(expect.arrayContaining(['geo_wells_intervals', 'geo_wells_core_images']));
  expect(tableSpec('geo_wells_intervals').parent).toEqual({ table: 'geo_wells', column: 'well_id' });
  expect(tableSpec('geo_wells_core_images').parent).toEqual({ table: 'geo_wells', column: 'well_id' });
  expect(tableSpec('geo_wells_tops').softRefs).toEqual([{ path: 'unit_id', table: 'geo_strat_units', optional: true }]);
  expect(tableSpec('geo_strat_units').softRefs).toEqual([{ path: 'parent_id', table: 'geo_strat_units', optional: true }]);
  expect(tableSpec('geo_strat_units').scope).toEqual(['user_id', 'organization_id']);
});

test('a core image blob lives in the wells bucket under the owner path with its own content type', () => {
  const b = tableSpec('geo_wells_core_images').blob;
  expect(b.bucket).toBe('wells');
  expect(b.pathColumn).toBe('storage_path');
  const row = { id: 'img1', well_id: 'w1', storage_path: 'u/w1/core/img1.png', content_type: 'image/png' };
  expect(b.contentType(row)).toBe('image/png');
  expect(b.contentType({})).toBe('image/jpeg');
  expect(b.newPath('u2', row)).toBe('u2/w1/core/img1.png');
  expect(b.newPath('u2', { ...row, storage_path: 'no-extension' })).toBe('u2/w1/core/img1.jpg');
});
