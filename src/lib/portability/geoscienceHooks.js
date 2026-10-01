// Geoscience family hooks (Project Portability PP1 rules, attached to the
// family registry in PP3). Importing this module registers them.
//
//   afterRoots  the caller's own interpretations that refer ONLY to packaged
//               wells come along; one that also refers to a well outside the
//               selection is left out and named. Custom CRS definitions
//               referenced through 'CUSTOM:<uuid>' are lifted into the
//               synthetic table geoscience_custom_crs.
//   sidecars    LAS 2.0 per well, tops/zones CSV, ZMAP+ per surface.

import { getFamily } from './familySpec';
import { WELL_STATE_TABLES, customCrsId } from './geoscienceSpec';
import { wellLasText, topsCsv, zonesCsv, surfaceZmapText, uniquePath } from './sidecars';

const f32 = (bytes) => new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);

async function liftCustomCrs(source, col) {
  const tables = ['geo_wells', 'geo_surfaces', 'geo_culture'];
  for (const t of tables) {
    for (const row of col.tables[t].values()) {
      const id = customCrsId(row.crs);
      if (!id || col.tables.geoscience_custom_crs.has(id)) continue;
      const def = await source.getCustomCrs(id);
      if (def) col.tables.geoscience_custom_crs.set(id, { id, ...def });
      else col.notes.push(`Custom CRS ${id} is referenced but its definition was not found in your settings; rows keep the CUSTOM: tag.`);
    }
  }
}

/** Interpretation roots (petro/pp/rp/sections) pull all of their wells in fully. */
async function wellsOfStateRoots(col, collectRow) {
  for (const table of WELL_STATE_TABLES) {
    for (const row of Array.from(col.tables[table].values())) {
      const wellIds = Array.isArray(row.well_ids) ? row.well_ids : [];
      for (const w of wellIds) await collectRow('geo_wells', w, { reason: `listed by ${table} "${row.name || row.id}"` });
    }
  }
}

async function interpretationsForWells(source, col) {
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

/** Typed tops (Stratigraphy ST0) name units of the stratigraphic column;
 *  the named units come along, and so do their ancestors, so a top's
 *  lineage reads the same after import. */
async function unitsOfTops(col, collectRow) {
  if (!col.tables.geo_strat_units || !col.tables.geo_wells_tops) return;
  const wanted = new Set();
  for (const t of col.tables.geo_wells_tops.values()) if (t.unit_id) wanted.add(t.unit_id);
  const seen = new Set();
  while (wanted.size) {
    const id = wanted.values().next().value;
    wanted.delete(id);
    if (seen.has(id)) continue;
    seen.add(id);
    await collectRow('geo_strat_units', id, { reason: 'named by a typed top' });
    const row = col.tables.geo_strat_units.get(id);
    if (row?.parent_id && !seen.has(row.parent_id)) wanted.add(row.parent_id);
  }
}

/** STRAT-U2-008: a stratigraphy project travels with the organisation's zone schemes it dates from. */
async function zoneSchemesOfProjects(source, col) {
  if (!col.tables.strat_zone_schemes || !col.tables.strat_projects?.size || typeof source.listOrgZoneSchemes !== 'function') return;
  for (const row of await source.listOrgZoneSchemes()) if (!col.tables.strat_zone_schemes.has(row.id)) col.tables.strat_zone_schemes.set(row.id, row);
}

const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The registry rows an Earth Modeling definition names (EM-U1-013). */
export function emModelRefs(definition) {
  const d = definition || {};
  const surfaces = new Set();
  const culture = new Set();
  const addId = (set, v) => { const m = typeof v === 'string' ? v.match(UUID_ONLY) : null; if (m) set.add(m[0].toLowerCase()); };
  for (const id of d.surfaceIds || []) addId(surfaces, id);
  for (const x of d.derived || []) { addId(surfaces, x?.sourceId); addId(surfaces, x?.isochoreId); addId(surfaces, x?.baseId); }
  for (const p of d.faultPolygons || []) addId(culture, p?.cultureId);
  addId(culture, d.frame?.boundaryId);
  return { surfaces: [...surfaces], culture: [...culture] };
}

/** An Earth Modeling model travels with the surfaces and polygons it names. */
async function rowsOfModels(col, collectRow) {
  if (!col.tables.em_models?.size) return;
  for (const row of Array.from(col.tables.em_models.values())) {
    const refs = emModelRefs(row.definition);
    const why = { reason: `named by earth model "${row.name || row.id}"` };
    for (const id of refs.surfaces) await collectRow('geo_surfaces', id, why);
    for (const id of refs.culture) await collectRow('geo_culture', id, why);
  }
}

/** BF-U1-021: a basin model travels with the registry well it is tied to. */
async function wellsOfBasinModels(col, collectRow) {
  if (!col.tables.bf_wells?.size) return;
  for (const row of Array.from(col.tables.bf_wells.values())) {
    const id = row.settings?.registryWellId;
    if (typeof id === 'string' && id) await collectRow('geo_wells', id, { reason: `tied to basin model "${row.name || row.id}"` });
  }
}

async function afterRoots(source, col, { includeInterpretations, collectRow }) {
  await wellsOfStateRoots(col, collectRow);
  await rowsOfModels(col, collectRow);
  await wellsOfBasinModels(col, collectRow);
  await zoneSchemesOfProjects(source, col);
  if (includeInterpretations) await interpretationsForWells(source, col);
  await unitsOfTops(col, collectRow);
  await liftCustomCrs(source, col);
}

async function sidecars({ col, writer, notes, open, used }) {
  for (const well of col.tables.geo_wells.values()) {
    const logs = Array.from(col.tables.geo_wells_logs.values()).filter((l) => l.well_id === well.id);
    const tops = Array.from(col.tables.geo_wells_tops.values()).filter((t) => t.well_id === well.id);
    const zones = Array.from(col.tables.geo_wells_zones.values()).filter((z) => z.well_id === well.id);
    const wellName = well.name || well.uwi || well.id;
    const curves = {};
    for (const l of logs) {
      const b = col.blobBytes.geo_wells_logs?.[l.id]?.[0]?.bytes;
      if (b && b.byteLength % 4 === 0) curves[l.id] = f32(b);
    }
    let las = null;
    try { las = wellLasText(well, logs, curves); } catch (e) { notes.push(`LAS sidecar for "${wellName}" was not written: ${e?.message || e}`); }
    if (las) {
      const file = uniquePath('open/wells', wellName, '.las', used, 'well');
      await writer.addText(file, las);
      open.push({ kind: 'las', file, table: 'geo_wells', row_id: well.id, name: wellName });
    } else if (!logs.length) {
      notes.push(`Well "${wellName}" has no logs, so no LAS sidecar was written.`);
    } else if (las === null) {
      notes.push(`Well "${wellName}" has no depth log (DEPT, DEPTH or MD), so no LAS sidecar was written; its curves are in blobs/wells as float32.`);
    }
    if (tops.length) {
      const file = uniquePath('open/wells', `${wellName}-tops`, '.csv', used, 'well-tops');
      await writer.addText(file, topsCsv(tops));
      open.push({ kind: 'tops_csv', file, table: 'geo_wells', row_id: well.id, name: wellName });
    }
    if (zones.length) {
      const file = uniquePath('open/wells', `${wellName}-zones`, '.csv', used, 'well-zones');
      await writer.addText(file, zonesCsv(zones));
      open.push({ kind: 'zones_csv', file, table: 'geo_wells', row_id: well.id, name: wellName });
    }
  }
  for (const s of col.tables.geo_surfaces.values()) {
    const b = col.blobBytes.geo_surfaces?.[s.id]?.[0]?.bytes;
    if (!b || b.byteLength % 4 !== 0) continue;
    try {
      const { text, note } = surfaceZmapText(s, f32(b));
      const file = uniquePath('open/surfaces', s.name, '.zmap', used, 'surface');
      await writer.addText(file, text);
      open.push({ kind: 'zmap', file, table: 'geo_surfaces', row_id: s.id, name: s.name || null });
      if (note) notes.push(note);
    } catch (e) {
      notes.push(`ZMAP sidecar for surface "${s.name}" was not written: ${e?.message || e}`);
    }
  }
}

const family = getFamily('geoscience');
if (family) family.hooks = { afterRoots, sidecars };

export const GEOSCIENCE_HOOKS = { afterRoots, sidecars };
