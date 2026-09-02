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

async function afterRoots(source, col, { includeInterpretations, collectRow }) {
  await wellsOfStateRoots(col, collectRow);
  if (includeInterpretations) await interpretationsForWells(source, col);
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
