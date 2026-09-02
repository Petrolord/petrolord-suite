// Build a Geoscience .pld from a root set (Project Portability PP1).
//
//   collectGeoscience  -> rows, blobs, curves, grids, notes
//   detectDanglingRefs -> refuse to write a package with a dangling id
//   PackageWriter      -> data/*.jsonl, blobs/**, open/** sidecars, README,
//                         manifest.json last (with every file's sha256)
//
// Returns { writer, manifest, collection, refs } so a caller can save the
// archive (savePackage) or, in tests, read it back with jszip.

import { collectGeoscience, collectionTables } from './collect';
import { detectDanglingRefs } from './danglingRefs';
import { isOptionalRefPath, GEOSCIENCE_SPEC } from './geoscienceSpec';
import { buildManifest, validateManifest, MANIFEST_FILE } from './manifest';
import { PackageWriter } from './zipWriter';
import { wellLasText, topsCsv, zonesCsv, surfaceZmapText, readmeText, uniquePath } from './sidecars';
import { readStateVersion } from '@/lib/stateVersion';
import { PLATFORM_BUILD } from '@/lib/platformBuild';

export class PackageIntegrityError extends Error {
  constructor(message, dangling) {
    super(message);
    this.name = 'PackageIntegrityError';
    this.dangling = dangling;
  }
}

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

/**
 * @param {object} source          see collect.js
 * @param {Array<{kind, id, name?}>} roots
 * @param {{ name?: string, includeInterpretations?: boolean, includeSidecars?: boolean,
 *           onProgress?: (msg: string) => void, allowDangling?: boolean }} opts
 */
export async function buildGeosciencePackage(source, roots, {
  name = null, includeInterpretations = true, includeSidecars = true, onProgress = () => {}, allowDangling = false,
} = {}) {
  const who = await source.currentUser();
  const user = { user_id: who.id, organization_id: who.organization_id ?? null, organization_name: who.organization_name ?? null };
  const col = await collectGeoscience(source, roots, { includeInterpretations, onProgress });
  const tables = collectionTables(col);

  // integrity gate: every id inside the dump must resolve inside the package,
  // be a scope id, or sit at a path the spec declares optional
  onProgress('Checking references');
  const refs = detectDanglingRefs(tables, {
    pkColumn: (t) => GEOSCIENCE_SPEC.tables[t]?.pk || 'id',
    scopeIds: [user.user_id, user.organization_id].filter(Boolean),
    external: isOptionalRefPath,
  });
  if (refs.dangling.length && !allowDangling) {
    const first = refs.dangling[0];
    throw new PackageIntegrityError(
      `The package would carry ${refs.dangling.length} reference${refs.dangling.length === 1 ? '' : 's'} to data it does not contain (first: ${first.table}.${first.path} -> ${first.id}). Nothing was written.`,
      refs.dangling,
    );
  }

  const writer = new PackageWriter();
  const notes = [...col.notes];
  const open = [];
  const blobs = [];
  const tableInfo = {};

  onProgress('Writing rows');
  for (const [table, rows] of Object.entries(tables)) {
    await writer.addText(`data/${table}.jsonl`, jsonl(rows));
    tableInfo[table] = { rows: rows.length, schemaVersions: rows.map(readStateVersion), pk: GEOSCIENCE_SPEC.tables[table]?.pk || 'id' };
  }

  onProgress('Writing binary data');
  for (const b of col.blobs) {
    const file = `blobs/${b.bucket}/${b.path}`;
    if (file in writer.files) continue;
    const entry = await writer.addBytes(file, b.bytes);
    blobs.push({ bucket: b.bucket, path: b.path, file, bytes: entry.bytes, table: b.table, row_id: b.rowId, content_type: b.contentType });
  }

  if (includeSidecars) {
    onProgress('Writing open-format sidecars');
    const used = new Set();
    for (const well of col.tables.geo_wells.values()) {
      const logs = Array.from(col.tables.geo_wells_logs.values()).filter((l) => l.well_id === well.id);
      const tops = Array.from(col.tables.geo_wells_tops.values()).filter((t) => t.well_id === well.id);
      const zones = Array.from(col.tables.geo_wells_zones.values()).filter((z) => z.well_id === well.id);
      const wellName = well.name || well.uwi || well.id;
      let las = null;
      try { las = wellLasText(well, logs, col.curves[well.id] || {}); } catch (e) { notes.push(`LAS sidecar for "${wellName}" was not written: ${e?.message || e}`); }
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
      const grid = col.grids[s.id];
      if (!grid) continue;
      try {
        const { text, note } = surfaceZmapText(s, grid);
        const file = uniquePath('open/surfaces', s.name, '.zmap', used, 'surface');
        await writer.addText(file, text);
        open.push({ kind: 'zmap', file, table: 'geo_surfaces', row_id: s.id, name: s.name || null });
        if (note) notes.push(note);
      } catch (e) {
        notes.push(`ZMAP sidecar for surface "${s.name}" was not written: ${e?.message || e}`);
      }
    }
  }

  // manifest (README needs the summary, so build it in two passes)
  const draft = buildManifest({ name, source: user, roots: col.roots, tables: tableInfo, blobs, open, files: {}, notes });
  const readme = readmeText({ manifestSummary: draft, platform: PLATFORM_BUILD, roots: col.roots, notes });
  await writer.addText('README.txt', readme);
  open.push({ kind: 'readme', file: 'README.txt' });

  const manifest = buildManifest({
    name, packageId: draft.package_id, createdAt: draft.created_at, source: user, roots: col.roots,
    tables: tableInfo, blobs, open, files: writer.files, notes,
  });
  const check = validateManifest(manifest);
  if (!check.ok) throw new Error(`Internal error: the manifest failed validation (${check.errors[0]}).`);
  writer.addManifest(manifest);
  onProgress('Package assembled');
  return { writer, manifest, collection: col, refs, manifestFile: MANIFEST_FILE };
}
