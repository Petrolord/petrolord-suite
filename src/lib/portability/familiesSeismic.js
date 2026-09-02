// PP3c family: Seismolord. Importing this module registers it. Facts from
// the migrations, the Seismolord services and the PP3 survey (STATUS).
//
// Bucket `seismic` layout:
//   volume   prefix {uid}/{volumeId}: manifest.json, bricks/{i}-{j}-{k}.f32 (many),
//            and horizons/{horizonId}.f32 (+ {horizonId}.conf.f32) which belong to
//            horizon rows and are EXCLUDED from the volume prefix so they travel
//            with their rows (a member's horizon may even sit under a non-owner
//            prefix; the row's storage_path is exact either way)
//   horizon  object storage_path (+ companion .conf.f32 derived from it)
//   line     prefix {uid}/{lineId}: manifest.json, nav.bin, strips, and
//            picks/{pickId}.f32 which belong to pick rows (excluded likewise)
//   pick     object storage_path
//   exported surface  object {uid}/exports/{id}.xyz
//   faults   no objects (sticks jsonb)
//
// Roots: seismic_project (volumes + lines under it), seismic_volume, seismic_line.
// Sessions and bookmarks come along through a hook when their payload's
// volume is packaged (payload.volume_id is required; visibleIds ->
// horizons, visibleFaultIds -> faults, visibleSurfaceIds -> geo_surfaces are
// optional and dropped when unmapped).
//
// Stamped (PP0 columns): seismic_projects, seismic_sessions. The registry
// tables (volumes, horizons, faults, lines, picks, exported surfaces) are not
// stamped until 20260902120500 is applied.
//
// Size note: volumes are many bricks and can reach gigabytes. The PackageWriter
// is in-memory jszip; that is the seam to swap for a streaming writer when
// real volumes go through this path.

import { registerFamily, getFamily } from './familySpec';

const dirOf = (p) => (typeof p === 'string' && p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : null);
const confPath = (p) => (typeof p === 'string' && /\.f32$/.test(p) ? p.replace(/\.f32$/, '.conf.f32') : null);

registerFamily('seismic', {
  tables: {
    seismic_projects: {
      pk: 'id', kind: 'seismic-project', stamped: true, scope: ['user_id'],
      children: [{ table: 'seismic_volumes', column: 'project_id' }, { table: 'seismic_lines', column: 'project_id' }],
      softRefs: [],
    },
    seismic_volumes: {
      pk: 'id', scope: ['user_id', 'organization_id'],
      children: [
        { table: 'seismic_horizons', column: 'volume_id' },
        { table: 'seismic_faults', column: 'volume_id' },
        { table: 'seismic_exported_surfaces', column: 'volume_id' },
      ],
      blob: {
        bucket: 'seismic', contentType: 'application/octet-stream',
        prefixOf: (row) => `${row.storage_path}`.replace(/\/$/, ''),
        prefixExclude: (rel) => rel.startsWith('horizons/'),
        newPrefix: (userId, row) => `${userId}/${row.id}`,
        prefixColumn: 'storage_path',
      },
      softRefs: [
        { path: 'project_id', table: 'seismic_projects', optional: true },
        { path: 'parent_volume_id', table: 'seismic_volumes', optional: true },
      ],
    },
    seismic_horizons: {
      pk: 'id', scope: ['user_id'], parent: { table: 'seismic_volumes', column: 'volume_id' },
      blob: {
        bucket: 'seismic', pathColumn: 'storage_path', contentType: 'application/octet-stream',
        newPath: (userId, row) => `${userId}/${row.volume_id}/horizons/${row.id}.f32`,
        companions: [confPath],
      },
      softRefs: [{ path: 'parent_version_id', table: 'seismic_horizons', optional: true }],
    },
    seismic_faults: {
      pk: 'id', scope: ['user_id'], parent: { table: 'seismic_volumes', column: 'volume_id' },
      softRefs: [{ path: 'parent_version_id', table: 'seismic_faults', optional: true }],
    },
    seismic_exported_surfaces: {
      pk: 'id', scope: ['user_id'], parent: { table: 'seismic_volumes', column: 'volume_id' },
      blob: {
        bucket: 'seismic', pathColumn: 'storage_path', contentType: 'text/plain',
        newPath: (userId, row) => `${userId}/exports/${row.id}.xyz`,
      },
      softRefs: [
        { path: 'horizon_id', table: 'seismic_horizons', optional: true },
        { path: 'provenance.volume.id', table: 'seismic_volumes', optional: true },
        { path: 'provenance.horizon.id', table: 'seismic_horizons', optional: true },
      ],
    },
    seismic_lines: {
      pk: 'id', scope: ['user_id', 'organization_id'],
      children: [{ table: 'seismic_line_picks', column: 'line_id' }],
      blob: {
        bucket: 'seismic', contentType: 'application/octet-stream',
        prefixOf: (row) => `${row.storage_path}`.replace(/\/$/, ''),
        prefixExclude: (rel) => rel.startsWith('picks/'),
        newPrefix: (userId, row) => `${userId}/${row.id}`,
        prefixColumn: 'storage_path',
      },
      softRefs: [{ path: 'project_id', table: 'seismic_projects', optional: true }],
    },
    seismic_line_picks: {
      pk: 'id', scope: ['user_id'], parent: { table: 'seismic_lines', column: 'line_id' },
      blob: {
        bucket: 'seismic', pathColumn: 'storage_path', contentType: 'application/octet-stream',
        newPath: (userId, row) => `${userId}/${row.line_id}/picks/${row.id}.f32`,
      },
      softRefs: [],
    },
    seismic_sessions: {
      pk: 'id', kind: 'seismic-session', stamped: true, scope: ['user_id'],
      softRefs: [
        { path: 'payload.volume_id', table: 'seismic_volumes', optional: false },
        { path: 'payload.visibleIds[]', table: 'seismic_horizons', optional: true },
        { path: 'payload.visibleFaultIds[]', table: 'seismic_faults', optional: true },
        { path: 'payload.visibleSurfaceIds[]', table: 'geo_surfaces', optional: true },
      ],
    },
  },
  roots: { seismic_project: 'seismic_projects', seismic_volume: 'seismic_volumes', seismic_line: 'seismic_lines' },
  order: ['seismic_projects', 'seismic_volumes', 'seismic_horizons', 'seismic_faults', 'seismic_exported_surfaces', 'seismic_lines', 'seismic_line_picks', 'seismic_sessions'],
  hooks: {
    /** Own sessions and bookmarks whose volume is in the package come along. */
    async afterRoots(source, col) {
      const volumeIds = Array.from(col.tables.seismic_volumes.keys());
      if (!volumeIds.length || typeof source.listSessionsForVolumes !== 'function') return;
      const rows = await source.listSessionsForVolumes(volumeIds);
      for (const row of rows) {
        if (col.tables.seismic_sessions.has(row.id)) continue;
        if (!volumeIds.includes(row?.payload?.volume_id)) continue;
        col.tables.seismic_sessions.set(row.id, row);
      }
    },
  },
});

export const SEISMIC_FAMILY = getFamily('seismic');
export { dirOf as seismicDirOf, confPath as horizonConfidencePath };
