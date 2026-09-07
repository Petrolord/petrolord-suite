// Wellsite Studio in .pld packages (WS9): the live-well record as its own
// family, rooted at ws_wells (anchored to a registry well through a soft
// reference), children in dependency order, the photo variants as a
// prefix of objects in the wellsite bucket. Append-only tables carry the
// PP0 stamps and their client-minted ids travel unchanged.

import { registerFamily } from './familySpec';

const child = (extra = {}) => ({ pk: 'id', stamped: true, parent: { table: 'ws_wells', column: 'well_id' }, softRefs: [], ...extra });

export const WELLSITE_TABLES = {
  ws_wells: {
    pk: 'id',
    kind: 'ws-well',
    stamped: true,
    scope: ['organization_id'],
    softRefs: [{ path: 'geo_well_id', table: 'geo_wells', optional: false }],
    children: [
      { table: 'ws_well_members', column: 'well_id' },
      { table: 'ws_prognosis', column: 'well_id' },
      { table: 'ws_records', column: 'well_id' },
      { table: 'ws_samples', column: 'well_id' },
      { table: 'ws_sample_stages', column: 'well_id' },
      { table: 'ws_tops', column: 'well_id' },
      { table: 'ws_photos', column: 'well_id' },
      { table: 'ws_reports', column: 'well_id' },
      { table: 'ws_signoffs', column: 'well_id' },
      { table: 'ws_publications', column: 'well_id' },
    ],
  },
  ws_well_members: { pk: 'id', stamped: false, parent: { table: 'ws_wells', column: 'well_id' }, softRefs: [] },
  ws_prognosis: child(),
  ws_records: child({ softRefs: [
    { path: 'previous_version_id', table: 'ws_records', optional: true },
    { path: 'supersedes_id', table: 'ws_records', optional: true },
    { path: 'sample_id', table: 'ws_samples', optional: true },
    { path: 'photo_id', table: 'ws_photos', optional: true },
  ] }),
  ws_samples: child(),
  ws_sample_stages: child({ softRefs: [{ path: 'sample_id', table: 'ws_samples', optional: false }] }),
  ws_tops: child({ softRefs: [{ path: 'previous_version_id', table: 'ws_tops', optional: true }] }),
  ws_photos: child({
    softRefs: [{ path: 'sample_id', table: 'ws_samples', optional: true }, { path: 'record_id', table: 'ws_records', optional: true }],
    blob: { bucket: 'wellsite', prefixOf: (row) => `${row.storage_prefix}`.replace(/\/$/, ''), newPrefix: (userId, row) => `${row.organization_id || userId}/${row.well_id}/photos/${row.id}` },
  }),
  ws_reports: child({ softRefs: [{ path: 'previous_version_id', table: 'ws_reports', optional: true }] }),
  ws_signoffs: child({ softRefs: [{ path: 'report_id', table: 'ws_reports', optional: false }] }),
  ws_publications: child(),
};

registerFamily('wellsite', {
  tables: WELLSITE_TABLES,
  roots: { ws_well: 'ws_wells' },
  order: ['ws_wells', 'ws_well_members', 'ws_prognosis', 'ws_samples', 'ws_records', 'ws_sample_stages', 'ws_tops', 'ws_photos', 'ws_reports', 'ws_signoffs', 'ws_publications'],
});
