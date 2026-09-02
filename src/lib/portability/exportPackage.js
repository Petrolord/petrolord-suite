// Build a .pld from a root set (Project Portability PP1, generic over the
// family registry since PP3).
//
//   collectPackage     -> rows, blobs, notes (spec-driven, family hooks)
//   detectDanglingRefs -> refuse to write a package with a dangling id
//   PackageWriter      -> data/*.jsonl, blobs/**, open/** sidecars (family
//                         hooks), README, manifest.json last (every file's sha256)
//
// Returns { writer, manifest, collection, refs } so a caller can save the
// archive (savePackage) or, in tests, read it back with jszip.

import { collectPackage, collectionTables } from './collect';
import { detectDanglingRefs } from './danglingRefs';
import { tableSpec, listFamilies } from './familySpec';
import './geoscienceHooks';
import './familiesCore';
import './familiesWellPlanning';
import './familiesSeismic';
import { buildManifest, validateManifest, MANIFEST_FILE } from './manifest';
import { PackageWriter } from './zipWriter';
import { readmeText } from './sidecars';
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

/** True when `path` sits under an optional soft ref of `table` (any family). */
export function isOptionalRefPath(table, path) {
  const t = tableSpec(table);
  if (!t) return false;
  return (t.softRefs || []).some((r) => {
    if (!r.optional) return false;
    const base = r.path.replace(/\[\]$|\{keys\}$|\.\*$/, '');
    return path === base || path.startsWith(`${base}.`) || path.startsWith(`${base}[`);
  });
}

/** Storage path columns carry owner prefixes (uids) that the importer rewrites; they are not references. */
export function isBlobPathColumn(table, path) {
  const b = tableSpec(table)?.blob;
  if (!b) return false;
  const cols = [b.pathColumn, b.prefixColumn, ...(b.pathColumns || [])].filter(Boolean);
  return cols.includes(path);
}

/**
 * @param {object} source          see collect.js
 * @param {Array<{kind, id, name?}>} roots
 * @param {{ name?: string, includeInterpretations?: boolean, includeSidecars?: boolean,
 *           onProgress?: (msg: string) => void, allowDangling?: boolean }} opts
 */
export async function buildPackage(source, roots, opts = {}) {
  return buildPackageInto(new PackageWriter(), source, roots, opts);
}

/**
 * Build into a writer-like: a PackageWriter (one archive) or a PackageSet
 * (multi-part, PP4). Both expose addText/addBytes; a set also exposes
 * manifestFiles() and partOf(path).
 */
export async function buildPackageInto(writer, source, roots, {
  name = null, includeInterpretations = true, includeSidecars = true, onProgress = () => {}, allowDangling = false, dedupeRoots = false,
} = {}) {
  const who = await source.currentUser();
  const user = { user_id: who.id, organization_id: who.organization_id ?? null, organization_name: who.organization_name ?? null };
  if (dedupeRoots) {
    const seen = new Set();
    roots = roots.filter((r) => { const k = `${r.kind}:${r.table || ''}:${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const col = await collectPackage(source, roots, { includeInterpretations, onProgress });
  const tables = collectionTables(col);

  onProgress('Checking references');
  const refs = detectDanglingRefs(tables, {
    pkColumn: (t) => tableSpec(t)?.pk || 'id',
    scopeIds: [user.user_id, user.organization_id].filter(Boolean),
    external: (table, path) => isOptionalRefPath(table, path) || isBlobPathColumn(table, path),
  });
  if (refs.dangling.length && !allowDangling) {
    const first = refs.dangling[0];
    throw new PackageIntegrityError(
      `The package would carry ${refs.dangling.length} reference${refs.dangling.length === 1 ? '' : 's'} to data it does not contain (first: ${first.table}.${first.path} -> ${first.id}). Nothing was written.`,
      refs.dangling,
    );
  }

  const notes = [...col.notes];
  const open = [];
  const blobs = [];
  const tableInfo = {};

  onProgress('Writing rows');
  for (const [table, rows] of Object.entries(tables)) {
    await writer.addText(`data/${table}.jsonl`, jsonl(rows));
    tableInfo[table] = { rows: rows.length, schemaVersions: rows.map(readStateVersion), pk: tableSpec(table)?.pk || 'id' };
  }

  onProgress('Writing binary data');
  for (const b of col.blobs) {
    const file = `blobs/${b.bucket}/${b.path}`;
    if (file in writer.files) continue;
    const entry = await writer.addBytes(file, b.bytes);
    const part = writer.partOf ? writer.partOf(file) : null;
    blobs.push({ bucket: b.bucket, path: b.path, file, bytes: entry.bytes, table: b.table, row_id: b.rowId, content_type: b.contentType, ...(part && part > 1 ? { part } : {}) });
  }

  if (includeSidecars) {
    onProgress('Writing open-format sidecars');
    const used = new Set();
    for (const f of listFamilies()) {
      if (!col.families.has(f.name) || !f.hooks?.sidecars) continue;
      await f.hooks.sidecars({ col, writer, notes, open, used });
    }
  }

  const draft = buildManifest({ name, source: user, roots: col.roots, tables: tableInfo, blobs, open, files: {}, notes });
  const readme = readmeText({ manifestSummary: draft, platform: PLATFORM_BUILD, roots: col.roots, notes });
  await writer.addText('README.txt', readme);
  open.push({ kind: 'readme', file: 'README.txt' });

  const manifest = buildManifest({
    name, packageId: draft.package_id, createdAt: draft.created_at, source: user, roots: col.roots,
    tables: tableInfo, blobs, open, files: writer.manifestFiles ? writer.manifestFiles() : writer.files, notes,
  });
  // a multi-part set fills `parts` in finish() once the later archives are hashed;
  // validate the structure now without the part fields, and fully in finish()
  const multi = writer.partCount > 1;
  const toCheck = multi ? { ...manifest, blobs: manifest.blobs.map(({ part, ...b }) => b) } : manifest;
  const check = validateManifest(toCheck);
  if (!check.ok) throw new Error(`Internal error: the manifest failed validation (${check.errors[0]}).`);
  // a single-archive writer takes the manifest now; a set takes it in finish() (parts are hashed first)
  if (writer.addManifest) writer.addManifest(manifest);
  onProgress('Package assembled');
  return { writer, manifest, collection: col, refs, manifestFile: MANIFEST_FILE };
}

/** PP1 name, kept for callers and tests. */
export const buildGeosciencePackage = buildPackage;
