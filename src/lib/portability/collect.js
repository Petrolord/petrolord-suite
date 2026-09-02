// Closure collector for a Geoscience .pld (Project Portability PP1, PLAN §4.2).
//
// Given a set of roots and a `source` (the registry, or an in-memory stand-in
// in tests), gather every row and blob the package must carry:
//
//   well root      -> the well, its logs (+ f32 curves), tops, zones, and the
//                     caller's own interpretations that refer ONLY to wells in
//                     the selection (petro/pp/rp projects, correlation sections)
//   surface root   -> the surface row + grid
//   culture root   -> the culture row + features JSON
//   project root   -> the project + every well it lists (fully)
//   section root   -> the section + every well it lists (fully)
//
// Rules the caller can rely on:
//   - rows are dumped as returned by the source (all columns, ids untouched)
//   - a project that also references a well outside the selection is NOT
//     pulled in silently; it is skipped and named in `notes`
//   - custom CRS definitions referenced through 'CUSTOM:<uuid>' are lifted
//     into the synthetic table geoscience_custom_crs
//   - nothing is fetched twice; nothing is written here (see exportPackage)
//
// The `source` interface (all async):
//   currentUser()                      -> { id, organization_id, organization_name }
//   getWell(id)                        -> geo_wells row | null
//   listLogs(wellId), listTops(wellId), listZones(wellId)
//   downloadCurve(log)                 -> ArrayLike<number> (Float32Array in production)
//   getSurface(id), downloadSurfaceGrid(surface) -> Float32Array
//   getCulture(id), downloadCultureFeatures(row)  -> Array (features)
//   getStateRow(table, id)             -> row | null       (petro/pp/rp/sections)
//   listStateRowsForWells(table, wellIds) -> rows whose well_ids intersect
//   getCustomCrs(id)                   -> definition object | null

import { GEOSCIENCE_SPEC, WELL_STATE_TABLES, customCrsId } from './geoscienceSpec';

const ROOT_TABLE = {
  well: 'geo_wells',
  surface: 'geo_surfaces',
  culture: 'geo_culture',
  petro_project: 'petro_projects',
  pp_project: 'pp_projects',
  rp_project: 'rp_projects',
  correlation_section: 'geo_correlation_sections',
};

export function newCollection() {
  return {
    /** table -> Map<id, row> */
    tables: Object.fromEntries(Object.keys(GEOSCIENCE_SPEC.tables).map((t) => [t, new Map()])),
    /** [{ table, rowId, bucket, path, contentType, bytes: Uint8Array }] */
    blobs: [],
    /** wellId -> { logId -> ArrayLike samples } (kept for the LAS sidecar) */
    curves: {},
    /** surfaceId -> Float32Array */
    grids: {},
    notes: [],
    roots: [],
  };
}

const f32Bytes = (arr) => {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
};

async function addCustomCrs(source, col, crs) {
  const id = customCrsId(crs);
  if (!id || col.tables.geoscience_custom_crs.has(id)) return;
  const def = await source.getCustomCrs(id);
  if (def) col.tables.geoscience_custom_crs.set(id, { id, ...def });
  else col.notes.push(`Custom CRS ${id} is referenced but its definition was not found in your settings; rows keep the CUSTOM: tag.`);
}

async function collectWell(source, col, wellId, { reason } = {}) {
  if (col.tables.geo_wells.has(wellId)) return true;
  const well = await source.getWell(wellId);
  if (!well) {
    col.notes.push(`Well ${wellId}${reason ? ` (${reason})` : ''} could not be read and was skipped.`);
    return false;
  }
  col.tables.geo_wells.set(well.id, well);
  await addCustomCrs(source, col, well.crs);

  const [logs, tops, zones] = await Promise.all([source.listLogs(well.id), source.listTops(well.id), source.listZones(well.id)]);
  col.curves[well.id] = {};
  for (const log of logs) {
    col.tables.geo_wells_logs.set(log.id, log);
    try {
      const samples = await source.downloadCurve(log);
      col.curves[well.id][log.id] = samples;
      if (log.storage_path) {
        col.blobs.push({ table: 'geo_wells_logs', rowId: log.id, bucket: 'wells', path: log.storage_path, contentType: 'application/octet-stream', bytes: f32Bytes(samples) });
      }
    } catch (e) {
      col.notes.push(`Curve ${log.mnemonic} of well "${well.name}" could not be downloaded (${e?.message || e}); its row is included without samples.`);
    }
  }
  for (const t of tops) col.tables.geo_wells_tops.set(t.id, t);
  for (const z of zones) col.tables.geo_wells_zones.set(z.id, z);
  return true;
}

async function collectSurface(source, col, id) {
  if (col.tables.geo_surfaces.has(id)) return;
  const s = await source.getSurface(id);
  if (!s) { col.notes.push(`Surface ${id} could not be read and was skipped.`); return; }
  col.tables.geo_surfaces.set(s.id, s);
  await addCustomCrs(source, col, s.crs);
  try {
    const grid = await source.downloadSurfaceGrid(s);
    col.grids[s.id] = grid;
    if (s.storage_path) col.blobs.push({ table: 'geo_surfaces', rowId: s.id, bucket: 'surfaces', path: s.storage_path, contentType: 'application/octet-stream', bytes: f32Bytes(grid) });
  } catch (e) {
    col.notes.push(`Grid of surface "${s.name}" could not be downloaded (${e?.message || e}); its row is included without the grid.`);
  }
}

async function collectCulture(source, col, id) {
  if (col.tables.geo_culture.has(id)) return;
  const c = await source.getCulture(id);
  if (!c) { col.notes.push(`Culture set ${id} could not be read and was skipped.`); return; }
  col.tables.geo_culture.set(c.id, c);
  await addCustomCrs(source, col, c.crs);
  try {
    const features = await source.downloadCultureFeatures(c);
    const json = JSON.stringify({ v: 1, features });
    if (c.storage_path) col.blobs.push({ table: 'geo_culture', rowId: c.id, bucket: 'culture', path: c.storage_path, contentType: 'application/json', bytes: new TextEncoder().encode(json) });
  } catch (e) {
    col.notes.push(`Features of culture set "${c.name}" could not be downloaded (${e?.message || e}); its row is included without features.`);
  }
}

/** A project/section root: the row plus all of its wells. */
async function collectStateRoot(source, col, table, id) {
  if (col.tables[table].has(id)) return;
  const row = await source.getStateRow(table, id);
  if (!row) { col.notes.push(`${table} ${id} could not be read and was skipped.`); return; }
  col.tables[table].set(row.id, row);
  const wellIds = Array.isArray(row.well_ids) ? row.well_ids : [];
  for (const w of wellIds) await collectWell(source, col, w, { reason: `listed by ${table} "${row.name || row.id}"` });
}

/**
 * After all wells are in: pull the caller's own interpretations that refer
 * only to packaged wells. Others are named in notes and left out.
 */
async function collectStateForWells(source, col) {
  const wellIds = Array.from(col.tables.geo_wells.keys());
  if (!wellIds.length) return;
  const have = new Set(wellIds);
  for (const table of WELL_STATE_TABLES) {
    const rows = await source.listStateRowsForWells(table, wellIds);
    for (const row of rows) {
      if (col.tables[table].has(row.id)) continue;
      const refs = Array.isArray(row.well_ids) ? row.well_ids : [];
      const outside = refs.filter((w) => !have.has(w));
      if (outside.length) {
        col.notes.push(`${table} "${row.name || row.id}" also refers to ${outside.length} well${outside.length === 1 ? '' : 's'} outside this selection and was left out. Select those wells too, or export the project itself, to include it.`);
        continue;
      }
      col.tables[table].set(row.id, row);
    }
  }
}

/**
 * @param {object} source  see header
 * @param {Array<{kind: string, id: string, name?: string}>} roots
 * @param {{ includeInterpretations?: boolean, onProgress?: (msg: string) => void }} opts
 */
export async function collectGeoscience(source, roots, { includeInterpretations = true, onProgress = () => {} } = {}) {
  const col = newCollection();
  for (const r of roots) {
    if (!ROOT_TABLE[r.kind]) throw new Error(`collectGeoscience: unknown root kind "${r.kind}"`);
  }
  for (const r of roots) {
    onProgress(`Reading ${r.kind} ${r.name || r.id}`);
    if (r.kind === 'well') await collectWell(source, col, r.id);
    else if (r.kind === 'surface') await collectSurface(source, col, r.id);
    else if (r.kind === 'culture') await collectCulture(source, col, r.id);
    else await collectStateRoot(source, col, ROOT_TABLE[r.kind], r.id);
  }
  if (includeInterpretations) {
    onProgress('Reading interpretations');
    await collectStateForWells(source, col);
  }
  // root names for the manifest
  col.roots = roots.map((r) => {
    const row = col.tables[ROOT_TABLE[r.kind]].get(r.id);
    return { kind: r.kind, id: r.id, name: r.name ?? row?.name ?? null };
  });
  return col;
}

/** Plain-object view of the collection's tables (for the detector and dumps). */
export function collectionTables(col) {
  const out = {};
  for (const [t, map] of Object.entries(col.tables)) if (map.size) out[t] = Array.from(map.values());
  return out;
}
