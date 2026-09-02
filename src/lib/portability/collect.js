// Closure collector for .pld packages (Project Portability PP1, generalised
// over the family registry in PP3).
//
// Given roots and a `source`, gather every row and blob the package must
// carry, driven entirely by the table specs (familySpec.js):
//
//   root          -> its row, then children by parent FK, recursively
//   blob          -> one object per row (pathColumn) or every object under a
//                    prefix (prefixOf), downloaded once
//   family hooks  -> afterRoots(source, col, opts) for rules a spec cannot
//                    express (Geoscience: interpretations that refer only to
//                    packaged wells; custom CRS definitions)
//
// Rules the caller can rely on:
//   - rows are dumped as returned by the source (all columns, ids untouched)
//   - nothing is fetched twice; nothing is written here (see exportPackage)
//   - a row or blob that cannot be read is skipped and named in `notes`
//
// The generic `source` interface (all async):
//   currentUser()                        -> { id, organization_id, organization_name }
//   getRow(table, id)                    -> row | null
//   listChildren(table, column, parentId)-> rows
//   downloadBlob(bucket, path)           -> Uint8Array
//   listBlobs(bucket, prefix)            -> [{ path, size }]   (prefix blobs)
// plus whatever a family's hooks ask for (Geoscience: listStateRowsForWells,
// getCustomCrs).

import { tableSpec, rootTable, listFamilies, getFamily } from './familySpec';

export function newCollection() {
  const tables = {};
  for (const f of listFamilies()) for (const t of Object.keys(f.tables)) tables[t] = new Map();
  return {
    /** table -> Map<id, row> */
    tables,
    /** [{ table, rowId, bucket, path, contentType, bytes: Uint8Array }] */
    blobs: [],
    /** table -> rowId -> [bytes] for hooks that need the data again (LAS sidecar) */
    blobBytes: {},
    notes: [],
    roots: [],
    families: new Set(),
  };
}

function rememberBlob(col, table, rowId, bucket, path, contentType, bytes) {
  col.blobs.push({ table, rowId, bucket, path, contentType, bytes });
  col.blobBytes[table] = col.blobBytes[table] || {};
  col.blobBytes[table][rowId] = col.blobBytes[table][rowId] || [];
  col.blobBytes[table][rowId].push({ path, bytes });
}

async function collectBlobsFor(source, col, table, spec, row) {
  const b = spec.blob;
  if (!b) return;
  const label = row.name || row.mnemonic || row[spec.pk];
  try {
    if (b.pathColumn) {
      const path = row[b.pathColumn];
      if (!path) return;
      const bytes = await source.downloadBlob(b.bucket, path);
      rememberBlob(col, table, row[spec.pk], b.bucket, path, b.contentType, bytes);
      // companion objects derived from the main path (e.g. a horizon's .conf.f32); missing ones are fine
      for (const fn of b.companions || []) {
        const alt = fn(path);
        if (!alt || alt === path) continue;
        try {
          const more = await source.downloadBlob(b.bucket, alt);
          rememberBlob(col, table, row[spec.pk], b.bucket, alt, b.contentType, more);
        } catch (e) { /* no companion stored */ }
      }
    } else if (b.prefixOf) {
      const prefix = b.prefixOf(row);
      const all = await source.listBlobs(b.bucket, prefix);
      // objects that belong to child rows (a volume's horizons/, a line's picks/) travel with those rows
      const objects = b.prefixExclude ? all.filter((o) => !b.prefixExclude(o.path.slice(prefix.length).replace(/^\//, ''))) : all;
      for (const o of objects) {
        const bytes = await source.downloadBlob(b.bucket, o.path);
        rememberBlob(col, table, row[spec.pk], b.bucket, o.path, b.contentType, bytes);
      }
      if (!objects.length) col.notes.push(`${table} "${label}" has no stored objects under ${prefix}; its row is included without data.`);
    }
  } catch (e) {
    col.notes.push(`Binary data of ${table} "${label}" could not be downloaded (${e?.message || e}); its row is included without it.`);
  }
}

/** Add one row (and everything below it). Returns true when added or already present. */
export async function collectRow(source, col, table, id, { reason } = {}) {
  const spec = tableSpec(table);
  if (!spec) throw new Error(`collect: unknown table "${table}"`);
  if (col.tables[table].has(id)) return true;
  const row = await source.getRow(table, id);
  if (!row) {
    col.notes.push(`${table} ${id}${reason ? ` (${reason})` : ''} could not be read and was skipped.`);
    return false;
  }
  await addRow(source, col, table, spec, row);
  return true;
}

async function addRow(source, col, table, spec, row) {
  const id = row[spec.pk];
  if (col.tables[table].has(id)) return;
  col.tables[table].set(id, row);
  col.families.add(spec.family);
  await collectBlobsFor(source, col, table, spec, row);
  for (const child of spec.children || []) {
    const childSpec = tableSpec(child.table);
    const rows = await source.listChildren(child.table, child.column, id);
    for (const r of rows) await addRow(source, col, child.table, childSpec, r);
  }
}

/**
 * @param {object} source  see header
 * @param {Array<{kind: string, id: string, name?: string}>} roots
 * @param {{ includeInterpretations?: boolean, onProgress?: (msg: string) => void }} opts
 */
/** The table a root names: the family's fixed table, or the root's own `table` for wildcard kinds. */
export function resolveRootTable(root) {
  const rt = rootTable(root.kind);
  if (!rt) throw new Error(`collectPackage: unknown root kind "${root.kind}"`);
  if (rt.table !== '*') return rt;
  const fam = getFamily(rt.family);
  if (!root.table || !fam.tables[root.table]) throw new Error(`collectPackage: root kind "${root.kind}" needs a table from the ${rt.family} family (got "${root.table}")`);
  return { family: rt.family, table: root.table };
}

export async function collectPackage(source, roots, { includeInterpretations = true, onProgress = () => {} } = {}) {
  const col = newCollection();
  const resolved = roots.map((r) => ({ root: r, ...resolveRootTable(r) }));
  for (const { root, table } of resolved) {
    onProgress(`Reading ${root.kind} ${root.name || root.id}`);
    await collectRow(source, col, table, root.id);
  }
  for (const f of listFamilies()) {
    if (!col.families.has(f.name) && !resolved.some((r) => r.family === f.name)) continue;
    if (f.hooks?.afterRoots) {
      onProgress(`Reading ${f.name} references`);
      await f.hooks.afterRoots(source, col, { includeInterpretations, collectRow: (t, id, o) => collectRow(source, col, t, id, o) });
    }
  }
  col.roots = resolved.map(({ root, table }) => {
    const row = col.tables[table].get(root.id);
    const nameCol = tableSpec(table)?.nameColumn;
    const name = root.name ?? (nameCol ? row?.[nameCol] : null) ?? row?.name ?? row?.project_name ?? null;
    const rt = rootTable(root.kind);
    return { kind: root.kind, id: root.id, name, ...(rt.table === '*' ? { table } : {}) };
  });
  return col;
}

/** Backwards-compatible name from PP1. */
export const collectGeoscience = collectPackage;

/** Plain-object view of the collection's tables (for the detector and dumps). */
export function collectionTables(col) {
  const out = {};
  for (const [t, map] of Object.entries(col.tables)) if (map.size) out[t] = Array.from(map.values());
  return out;
}

export { getFamily };
