// WS9: the wellsite family registers after geoscience with its tables in dependency order and the photo prefix.
import '@/lib/portability/familyWellsite';
import { getFamily, importOrder, tableSpec, rootTable } from '@/lib/portability/familySpec';

test('the wellsite family: root, order, parents, blobs', () => {
  const fam = getFamily('wellsite');
  expect(fam.roots.ws_well).toBe('ws_wells');
  expect(rootTable('ws_well')).toEqual({ family: 'wellsite', table: 'ws_wells' });
  const order = importOrder();
  expect(order.indexOf('geo_wells')).toBeLessThan(order.indexOf('ws_wells'));
  expect(order.indexOf('ws_samples')).toBeLessThan(order.indexOf('ws_sample_stages'));
  expect(order.indexOf('ws_reports')).toBeLessThan(order.indexOf('ws_signoffs'));
  expect(tableSpec('ws_photos').blob.prefixOf({ storage_prefix: 'org/well/photos/p1/' })).toBe('org/well/photos/p1');
  expect(tableSpec('ws_photos').blob.newPrefix('u', { organization_id: 'o', well_id: 'w', id: 'p' })).toBe('o/w/photos/p');
  expect(tableSpec('ws_wells').softRefs).toEqual([{ path: 'geo_well_id', table: 'geo_wells', optional: false }]);
  for (const t of fam.order.slice(1)) expect(tableSpec(t).parent).toEqual({ table: 'ws_wells', column: 'well_id' });
});
