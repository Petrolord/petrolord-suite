// Import a Geoscience .pld (Project Portability PP2, PLAN §4.5).
//
// Three phases, each of which can fail without touching the caller's data:
//
//   readPackage(bytes)          unzip, parse + validate manifest, the Petrel
//                               rule (package_version and per-table
//                               schema_version against what this build reads),
//                               size + sha256 of every file
//   planImport(pkg, target)     new uuid for every row, every reference
//                               rewritten through the spec (required refs must
//                               map, optional ones are dropped when unmapped),
//                               rows rescoped to the importer, blob paths
//                               rewritten to the importer's own storage prefix,
//                               provenance.imported_from stamped
//   executeImport(plan, sink)   job row (best effort), custom CRS merge, blobs
//                               FIRST to the importer's own paths, then rows
//                               in dependency order, items ledger as it goes;
//                               resumable by job id
//
// Nothing existing is ever updated or deleted: importing is copying.

import JSZip from 'jszip';
import { customCrsId } from './geoscienceSpec';
import { tableSpec, importOrder } from './familySpec';
import './familiesCore';
import './familiesWellPlanning';
import './familiesSeismic';
import { validateManifest, packageVersionCheck, UUID_RE, newPackageId } from './manifest';
import { sha256Hex } from './zipWriter';
import { walkUuids } from './danglingRefs';
import { verifyManifestSignature } from './signing';
import { getStateKind, openStateRow, stampState, readStateVersion, newerStateMessage } from '@/lib/stateVersion';
import { PLATFORM_BUILD } from '@/lib/platformBuild';

export class PackageReadError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'PackageReadError'; this.code = code; Object.assign(this, details); }
}
export class PackagePlanError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'PackagePlanError'; Object.assign(this, details); }
}

const REGISTRY_READS_UP_TO = 1;
const STRIP_ON_INSERT = new Set(['created_at', 'updated_at']);
const REGISTRY_STRIP = new Set(['schema_version', 'app_build', 'engine_version']);

/** State kind that reads a table (familySpec `kind`), or null for "version 1 in this build". */
export const tableKind = (table) => tableSpec(table)?.kind || null;

/** Insertion order across families: parents before children (synthetic tables excluded). */
export const IMPORT_ORDER_OF = () => importOrder().filter((t) => !tableSpec(t)?.synthetic);
/** PP2 name; evaluated at call sites through IMPORT_ORDER_OF(). */
export const IMPORT_ORDER = new Proxy([], {
  get(_, prop) { const arr = IMPORT_ORDER_OF(); const v = arr[prop]; return typeof v === 'function' ? v.bind(arr) : v; },
});

export function readsUpTo(table) {
  const kind = tableKind(table);
  if (!kind) return REGISTRY_READS_UP_TO;
  return getStateKind(kind)?.current ?? 1;
}

const decoder = () => (typeof globalThis.TextDecoder === 'function' ? new globalThis.TextDecoder() : null);
async function utf8(bytes) {
  const d = decoder();
  if (d) return d.decode(bytes);
  const util = await import('node:util');
  return new util.TextDecoder().decode(bytes);
}

// ---- phase 1: read ---------------------------------------------------------

/**
 * @param {Uint8Array|ArrayBuffer|Blob} data
 * @returns {Promise<{ manifest, tables: Record<string, object[]>, blobs: Array<{...manifestBlob, bytes: Uint8Array}>, open: object[], readme: string|null, integrity: {checked:number} }>}
 */
export async function readPackage(data, opts = {}) {
  const inputs = Array.isArray(data) ? data : [data];
  if (!inputs.length) throw new PackageReadError('no-file', 'Choose a package file.');
  const zips = [];
  for (const d of inputs) {
    try { zips.push({ zip: await JSZip.loadAsync(d), bytes: d }); } catch (e) {
      throw new PackageReadError('not-zip', 'This file is not a Petrolord Project Package (it could not be opened as a zip archive).');
    }
  }
  const first = zips.find((z) => z.zip.file('manifest.json'));
  if (!first) throw new PackageReadError('no-manifest', inputs.length > 1 ? 'None of the chosen files is part 1 of a package (no manifest.json at the root).' : 'This file is not a Petrolord Project Package (no manifest.json at the root).');
  const mf = first.zip.file('manifest.json');
  // a merged view over the parts: part 1 first, then the other archives (PP4)
  const others = zips.filter((z) => z !== first);
  const zip = {
    file(name) { for (const z of [first, ...others]) { const f = z.zip.file(name); if (f) return f; } return null; },
    get files() { const out = {}; for (const z of [first, ...others]) for (const [n, f] of Object.entries(z.zip.files)) if (!(n in out)) out[n] = f; return out; },
  };
  let manifest;
  try { manifest = JSON.parse(await mf.async('string')); } catch (e) {
    throw new PackageReadError('bad-manifest', 'The package manifest is not valid JSON.');
  }
  const pv = packageVersionCheck(manifest);
  if (!pv.ok) throw new PackageReadError('newer-package', pv.message, { found: manifest?.package_version });
  const v = validateManifest(manifest);
  if (!v.ok) throw new PackageReadError('invalid-manifest', `The package manifest does not match the package format (${v.errors[0]}).`, { errors: v.errors });

  // per-table Petrel rule
  for (const [table, info] of Object.entries(manifest.tables)) {
    const max = info.schema_version?.max ?? 1;
    const reads = readsUpTo(table);
    if (max > reads) {
      const label = tableKind(table) ? getStateKind(tableKind(table))?.label || table : table;
      throw new PackageReadError('newer-state', newerStateMessage(`package (${label} rows)`, max, reads), { table, found: max, reads });
    }
  }

  // multi-part: every later part present and matching its recorded hash
  if (Array.isArray(manifest.parts)) {
    const expectedOthers = manifest.parts.length - 1;
    if (others.length < expectedOthers) throw new PackageReadError('missing-part', `This package has ${manifest.parts.length} parts and ${others.length + 1} ${others.length === 0 ? 'was' : 'were'} chosen. Choose all ${manifest.parts.length} part files together.`, { expected: manifest.parts.length, got: others.length + 1 });
    const hashes = new Map();
    for (const z of others) {
      const u8 = z.bytes instanceof Uint8Array ? z.bytes : new Uint8Array(z.bytes instanceof ArrayBuffer ? z.bytes : await z.bytes.arrayBuffer());
      hashes.set(await sha256Hex(u8), u8.byteLength);
    }
    for (const p of manifest.parts.slice(1)) {
      if (!hashes.has(p.sha256)) throw new PackageReadError('tampered', `Part ${p.index}${p.file ? ` (${p.file})` : ''} is missing or does not match its checksum in the manifest.`, { part: p.index });
    }
  } else if (others.length) {
    throw new PackageReadError('unexpected-part', 'This package is a single file, but more than one file was chosen.');
  }

  // integrity: every listed file present, right size, right hash; no unlisted data files
  const listed = new Set(Object.keys(manifest.files));
  const present = Object.keys(zip.files).filter((n) => !zip.files[n].dir && n !== 'manifest.json');
  const unlisted = present.filter((n) => !listed.has(n));
  if (unlisted.length) throw new PackageReadError('unlisted-file', `The package contains ${unlisted.length} file${unlisted.length === 1 ? '' : 's'} the manifest does not list (first: ${unlisted[0]}). It may have been edited after export.`, { unlisted });
  const bytesOf = {};
  for (const [file, info] of Object.entries(manifest.files)) {
    const entry = zip.file(file);
    if (!entry) throw new PackageReadError('missing-file', `The package is missing ${file}, which the manifest lists. It may be incomplete.`, { file });
    const bytes = await entry.async('uint8array');
    if (bytes.byteLength !== info.bytes) throw new PackageReadError('tampered', `${file} is ${bytes.byteLength} bytes but the manifest says ${info.bytes}. The package was changed after export.`, { file });
    const hash = await sha256Hex(bytes);
    if (hash !== info.sha256) throw new PackageReadError('tampered', `${file} does not match its checksum in the manifest (sha256 ${hash.slice(0, 12)}..., expected ${info.sha256.slice(0, 12)}...). The package was changed after export.`, { file, hash, expected: info.sha256 });
    bytesOf[file] = bytes;
  }

  // origin: a Petrolord signature that no longer matches means the manifest itself
  // was edited after export (file hashes alone cannot show that); refused unless asked
  const signature = await verifyManifestSignature(manifest);
  if (signature.status === 'invalid' && !opts.allowInvalidSignature) {
    throw new PackageReadError('bad-signature', 'This package carries a Petrolord signature that does not match its manifest. The manifest was changed after the package was signed.', { key_id: signature.key_id });
  }

  const tables = {};
  for (const [table, info] of Object.entries(manifest.tables)) {
    const text = await utf8(bytesOf[info.file]);
    const rows = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    if (rows.length !== info.rows) throw new PackageReadError('row-count', `${info.file} holds ${rows.length} rows but the manifest says ${info.rows}.`, { table });
    tables[table] = rows;
  }
  const blobs = manifest.blobs.map((b) => ({ ...b, bytes: bytesOf[b.file] }));
  const readmeEntry = manifest.open.find((o) => o.kind === 'readme');
  const readme = readmeEntry ? await utf8(bytesOf[readmeEntry.file]) : null;
  return { manifest, tables, blobs, open: manifest.open, readme, integrity: { checked: Object.keys(manifest.files).length }, signature };
}

// ---- phase 2: plan ---------------------------------------------------------

const getPath = (obj, parts) => parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setPath = (obj, parts, value) => {
  let o = obj;
  for (let i = 0; i < parts.length - 1; i += 1) { if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
};

/** Rewrite one soft reference in place on a cloned row. Returns a list of problems for required refs that did not map. */
function rewriteSoftRef(row, ref, idMap, table) {
  const problems = [];
  const form = ref.form || (ref.path.endsWith('[]') ? 'array' : ref.path.endsWith('{keys}') ? 'keys' : ref.path.endsWith('.*') ? 'any' : 'scalar');
  const basePath = ref.path.replace(/\[\]$|\{keys\}$|\.\*$/, '').split('.');
  const value = getPath(row, basePath);
  if (value == null) return problems;
  const map = (id) => idMap.get(String(id).toLowerCase()) || null;

  if (form === 'custom-crs') {
    return problems; // CRS ids are preserved: definitions merge under the same id
  }
  if (form === 'scalar') {
    if (typeof value !== 'string') return problems;
    const to = map(value);
    if (to) setPath(row, basePath, to);
    else if (ref.optional) setPath(row, basePath, null);
    else problems.push({ table, path: ref.path, id: value });
    return problems;
  }
  if (form === 'array') {
    if (!Array.isArray(value)) return problems;
    const out = [];
    for (const id of value) {
      const to = typeof id === 'string' ? map(id) : null;
      if (to) out.push(to);
      else if (!ref.optional) problems.push({ table, path: ref.path, id });
    }
    setPath(row, basePath, out);
    return problems;
  }
  if (form === 'keys') {
    if (typeof value !== 'object' || Array.isArray(value)) return problems;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const to = UUID_RE.test(k) ? map(k) : null;
      if (to) out[to] = v;
      else if (!UUID_RE.test(k)) out[k] = v; // not an id key: keep
      else if (!ref.optional) problems.push({ table, path: ref.path, id: k });
    }
    setPath(row, basePath, out);
    return problems;
  }
  // 'any': rewrite every known uuid under the path, including uuids embedded inside
  // longer strings ('wp:<uuid>', 'geo:<uuid>'); unknown ones stay as they are
  const UUID_IN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const rewriteAny = (v) => {
    if (typeof v === 'string') { const to = map(v); return to || v.replace(UUID_IN, (m) => map(m) || m); }
    if (Array.isArray(v)) return v.map(rewriteAny);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [map(k) || k, rewriteAny(x)]));
    return v;
  };
  setPath(row, basePath, rewriteAny(value));
  return problems;
}

/** New storage path under the importer's prefix, from the table spec. */
export function newStoragePath(table, userId, row) {
  const b = tableSpec(table)?.blob;
  return b?.newPath ? b.newPath(userId, row) : null;
}

/**
 * @param {ReturnType<typeof readPackage> extends Promise<infer T> ? T : never} pkg
 * @param {{ userId: string, organizationId: string|null, shareWithOrg?: boolean, existing?: { wells?: Array<{name, uwi}> } }} target
 */
export function planImport(pkg, target) {
  const { manifest, tables, blobs } = pkg;
  if (!target?.userId || !UUID_RE.test(target.userId)) throw new PackagePlanError('Sign in to import a package.');
  const orgId = target.shareWithOrg ? target.organizationId || null : null;
  if (target.shareWithOrg && !target.organizationId) throw new PackagePlanError('You are not a member of an organization, so the package can only be imported as private.');

  // new id for every row of every table (custom CRS keeps its id)
  const idMap = new Map();
  for (const [table, rows] of Object.entries(tables)) {
    const spec = tableSpec(table);
    if (!spec) throw new PackagePlanError(`The package carries a table this build does not know how to import (${table}).`, { table });
    if (spec.synthetic) continue;
    for (const row of rows) {
      const old = String(row[spec.pk]).toLowerCase();
      if (!UUID_RE.test(old)) throw new PackagePlanError(`A ${table} row has no valid id.`, { table });
      idMap.set(old, newPackageId());
    }
  }

  const importedFrom = {
    package_id: manifest.package_id,
    package_name: manifest.name ?? null,
    source_user_id: manifest.source.user_id,
    source_organization_id: manifest.source.organization_id ?? null,
    source_organization_name: manifest.source.organization_name ?? null,
    exported_at: manifest.created_at,
    exported_with: manifest.platform?.sha ?? null,
    imported_at: new Date().toISOString(),
    imported_with: PLATFORM_BUILD.sha,
  };

  const problems = [];
  const planned = {}; // table -> rows to insert (new ids)
  const items = [];   // { table, oldId, newId }
  const notes = [...(manifest.notes || [])];

  for (const table of IMPORT_ORDER_OF()) {
    const rows = tables[table];
    if (!rows || !rows.length) continue;
    const spec = tableSpec(table);
    const kind = spec.kind || null;
    planned[table] = rows.map((original) => {
      // migrate older shapes up first (the Petrel rule already refused newer ones);
      // a kind this page never registered (its app is not loaded) opens as stored
      const registered = kind && getStateKind(kind);
      const opened = registered ? openStateRow(kind, original) : original;
      const row = JSON.parse(JSON.stringify(opened));
      const oldId = String(original[spec.pk]).toLowerCase();
      row[spec.pk] = idMap.get(oldId);
      items.push({ table, oldId, newId: row[spec.pk] });
      // parent FK
      if (spec.parent) {
        const to = idMap.get(String(row[spec.parent.column]).toLowerCase());
        if (!to) problems.push({ table, path: spec.parent.column, id: row[spec.parent.column] });
        else row[spec.parent.column] = to;
      }
      // soft refs through the spec
      for (const ref of spec.softRefs || []) problems.push(...rewriteSoftRef(row, ref, idMap, table));
      // rescope
      if ('user_id' in row || (spec.scope && spec.scope.includes('user_id'))) row.user_id = target.userId;
      if ('organization_id' in row || (spec.scope && spec.scope.includes('organization_id'))) row.organization_id = orgId;
      for (const c of STRIP_ON_INSERT) delete row[c];
      // blob location under the importer's prefix
      if (spec.blob?.pathColumn) {
        row.__oldStoragePath = original[spec.blob.pathColumn] || null;
        row[spec.blob.pathColumn] = newStoragePath(table, target.userId, row);
      } else if (spec.blob?.prefixOf) {
        row.__oldPrefix = spec.blob.prefixOf(original);
        row.__newPrefix = spec.blob.newPrefix(target.userId, row);
        if (spec.blob.prefixColumn) row[spec.blob.prefixColumn] = row.__newPrefix;
        for (const c of spec.blob.pathColumns || []) {
          if (typeof row[c] === 'string' && row.__oldPrefix && row[c].startsWith(row.__oldPrefix)) row[c] = row.__newPrefix + row[c].slice(row.__oldPrefix.length);
        }
      }
      // provenance stamp where the table has one
      if ('provenance' in row || spec.blob) {
        row.provenance = { ...(row.provenance && typeof row.provenance === 'object' ? row.provenance : {}), imported_from: { ...importedFrom, original_id: oldId } };
      }
      // version stamp (every stamped table has the PP0 columns; kinds without a
      // registered reader travel at the version the package recorded)
      if (spec.stamped && registered) Object.assign(row, stampState(kind, {}));
      else if (spec.stamped) Object.assign(row, { schema_version: readStateVersion(original), app_build: PLATFORM_BUILD.sha });
      else for (const c of REGISTRY_STRIP) delete row[c];
      return row;
    });
  }
  if (problems.length) {
    const p = problems[0];
    throw new PackagePlanError(`The package refers to data it does not contain (${p.table}.${p.path} -> ${p.id}), so it cannot be imported. Export it again from the source.`, { problems });
  }

  // blobs follow their rows: single objects by exact old path, prefix objects by old prefix
  const rowsByOldPath = new Map();
  const prefixRows = [];
  for (const [table, rows] of Object.entries(planned)) {
    const spec = tableSpec(table);
    for (const r of rows) {
      if (r.__oldStoragePath) rowsByOldPath.set(`${spec.blob.bucket}/${r.__oldStoragePath}`, { table, row: r, spec });
      if (r.__oldPrefix) prefixRows.push({ table, row: r, spec, key: `${spec.blob.bucket}/${r.__oldPrefix}` });
    }
  }
  // companion objects (derived from a row's main path) map through the same derivation on the new path
  const companionsByOldPath = new Map();
  for (const [table, rows] of Object.entries(planned)) {
    const spec = tableSpec(table);
    if (!spec.blob?.pathColumn || !spec.blob.companions) continue;
    for (const r of rows) {
      if (!r.__oldStoragePath) continue;
      for (const fn of spec.blob.companions) {
        const oldAlt = fn(r.__oldStoragePath);
        const newAlt = fn(r[spec.blob.pathColumn]);
        if (oldAlt && newAlt) companionsByOldPath.set(`${spec.blob.bucket}/${oldAlt}`, { table, row: r, spec, newPath: newAlt });
      }
    }
  }
  const blobPlan = [];
  for (const b of blobs) {
    const key = `${b.bucket}/${b.path}`;
    const hit = rowsByOldPath.get(key);
    if (hit) {
      blobPlan.push({ bucket: b.bucket, path: hit.row[hit.spec.blob.pathColumn], bytes: b.bytes, contentType: b.content_type || hit.spec.blob.contentType, table: hit.table, rowId: hit.row[hit.spec.pk] });
      continue;
    }
    const comp = companionsByOldPath.get(key);
    if (comp) {
      blobPlan.push({ bucket: b.bucket, path: comp.newPath, bytes: b.bytes, contentType: b.content_type || comp.spec.blob.contentType, table: comp.table, rowId: comp.row[comp.spec.pk], companion: true });
      continue;
    }
    const pre = prefixRows.find((p) => key.startsWith(p.key));
    if (pre) {
      const rest = b.path.slice(pre.row.__oldPrefix.length);
      blobPlan.push({ bucket: b.bucket, path: `${pre.row.__newPrefix}${rest}`, bytes: b.bytes, contentType: b.content_type || pre.spec.blob.contentType, table: pre.table, rowId: pre.row[pre.spec.pk] });
      continue;
    }
    notes.push(`Binary file ${b.file} belongs to no row in the package and was not imported.`);
  }
  for (const rows of Object.values(planned)) for (const r of rows) { delete r.__oldStoragePath; delete r.__oldPrefix; delete r.__newPrefix; }
  // rows with a blob column but no blob in the package: keep the row, note it
  for (const [table, rows] of Object.entries(planned)) {
    const spec = tableSpec(table);
    if (!spec.blob?.pathColumn) continue;
    for (const r of rows) if (!blobPlan.some((b) => b.rowId === r[spec.pk] && !b.companion)) { r[spec.blob.pathColumn] = null; notes.push(`${table} row "${r.mnemonic || r.name || r[spec.pk]}" arrived without its binary data; the row is imported with no file.`); }
  }

  // custom CRS definitions to merge (ids preserved)
  const customCrs = (tables.geoscience_custom_crs || []).map((d) => ({ ...d, id: String(d.id).toLowerCase() }));
  const referencedCrs = new Set();
  for (const rows of Object.values(planned)) for (const r of rows) { const id = customCrsId(r.crs); if (id) referencedCrs.add(id); }
  for (const id of referencedCrs) if (!customCrs.some((d) => d.id === id)) notes.push(`Custom CRS ${id} is referenced but its definition is not in the package; rows keep the CUSTOM: tag.`);

  // duplicate warnings (v1: by uwi / name only)
  const warnings = [];
  const existingWells = target.existing?.wells || [];
  for (const w of planned.geo_wells || []) {
    const dup = existingWells.find((e) => (w.uwi && e.uwi && e.uwi === w.uwi) || (e.name && e.name === w.name));
    if (dup) warnings.push(`You already have a well named "${dup.name}"${dup.uwi ? ` (UWI ${dup.uwi})` : ''}. The import creates a second, independent copy.`);
  }

  const rowsPlanned = Object.values(planned).reduce((n, r) => n + r.length, 0);
  return {
    manifest, target: { userId: target.userId, organizationId: orgId, shareWithOrg: !!target.shareWithOrg },
    idMap, planned, items, blobs: blobPlan, customCrs, notes, warnings,
    counts: { rows: rowsPlanned, blobs: blobPlan.length, tables: Object.fromEntries(Object.entries(planned).map(([t, r]) => [t, r.length])) },
    importedFrom,
  };
}

// ---- phase 3: execute ------------------------------------------------------

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
export const INSERT_BATCH = 200;

/**
 * `sink` (all async):
 *   createJob(job) -> jobId | null      (null when the jobs table is absent)
 *   updateJob(jobId, patch)
 *   listItems(jobId) -> [{ table_name, old_id, new_id }]   (resume)
 *   recordItems(jobId, items[])
 *   mergeCustomCrs(defs[])
 *   uploadBlob(bucket, path, bytes, contentType)
 *   insertRows(table, rows[])
 *   removeBlob(bucket, path)            (best effort cleanup on failure)
 */
export async function executeImport(plan, sink, { resumeJobId = null, onProgress = () => {} } = {}) {
  const summary = { jobId: null, rowsWritten: 0, blobsWritten: 0, skipped: 0, notes: [...plan.notes], warnings: [...plan.warnings], resumed: false };
  let jobId = resumeJobId;
  let done = new Set();
  if (jobId) {
    const prior = await sink.listItems(jobId);
    done = new Set(prior.map((i) => `${i.table_name}:${i.old_id}`));
    summary.resumed = true;
    await sink.updateJob(jobId, { status: 'running', error: null });
  } else {
    jobId = await sink.createJob({
      user_id: plan.target.userId, organization_id: plan.target.organizationId, package_id: plan.manifest.package_id, package_name: plan.manifest.name ?? null,
      package_version: plan.manifest.package_version, platform_sha: plan.manifest.platform?.sha ?? null,
      source_user_id: plan.manifest.source.user_id, source_organization_id: plan.manifest.source.organization_id ?? null, source_organization_name: plan.manifest.source.organization_name ?? null,
      manifest: plan.manifest, rows_planned: plan.counts.rows, blobs_planned: plan.counts.blobs, notes: plan.notes, app_build: PLATFORM_BUILD.sha,
    });
    if (!jobId) summary.notes.push('Import history is not available on this build of the database yet, so this import cannot be resumed if it stops part way.');
  }
  summary.jobId = jobId;
  const uploaded = [];
  try {
    if (plan.customCrs.length) { onProgress('Merging coordinate systems'); await sink.mergeCustomCrs(plan.customCrs); }

    onProgress(`Uploading ${plan.blobs.length} binary file${plan.blobs.length === 1 ? '' : 's'}`);
    for (const b of plan.blobs) {
      const oldId = plan.items.find((i) => i.newId === b.rowId)?.oldId;
      if (oldId && done.has(`${b.table}:${oldId}`)) { summary.skipped += 1; continue; }
      await sink.uploadBlob(b.bucket, b.path, b.bytes, b.contentType);
      uploaded.push(b);
      summary.blobsWritten += 1;
      if (jobId) await sink.updateJob(jobId, { blobs_written: summary.blobsWritten });
    }

    for (const table of IMPORT_ORDER_OF()) {
      const rows = plan.planned[table];
      if (!rows || !rows.length) continue;
      const pending = rows.filter((r) => { const it = plan.items.find((i) => i.newId === r.id); return !(it && done.has(`${table}:${it.oldId}`)); });
      summary.skipped += rows.length - pending.length;
      onProgress(`Writing ${table} (${pending.length})`);
      for (const batch of chunk(pending, INSERT_BATCH)) {
        await sink.insertRows(table, batch);
        summary.rowsWritten += batch.length;
        if (jobId) {
          await sink.recordItems(jobId, batch.map((r) => { const it = plan.items.find((i) => i.newId === r.id); return { job_id: jobId, table_name: table, old_id: it.oldId, new_id: r.id }; }));
          await sink.updateJob(jobId, { rows_written: summary.rowsWritten });
        }
      }
    }
    if (jobId) await sink.updateJob(jobId, { status: 'done', finished_at: new Date().toISOString(), notes: summary.notes });
    onProgress('Import complete');
    return summary;
  } catch (e) {
    if (jobId) { try { await sink.updateJob(jobId, { status: 'failed', error: String(e?.message || e) }); } catch (e2) { /* keep the original error */ } }
    // blobs uploaded in this run whose rows never landed are orphans: best-effort cleanup
    for (const b of uploaded) {
      const landed = summary.rowsWritten > 0 && plan.planned[b.table]?.some((r) => r.id === b.rowId && plan.items.find((i) => i.newId === r.id));
      if (!landed) { try { await sink.removeBlob(b.bucket, b.path); } catch (e3) { /* ignore */ } }
    }
    const err = new Error(`Import stopped: ${e?.message || e}${jobId ? ` You can resume it from Import history (job ${jobId.slice(0, 8)}).` : ''}`);
    err.cause = e;
    err.jobId = jobId;
    throw err;
  }
}

/** Convenience: read + plan + execute in one call. */
export async function importPackage(data, sink, { shareWithOrg = false, onProgress = () => {}, resumeJobId = null } = {}) {
  onProgress('Reading package');
  const pkg = await readPackage(data);
  const who = await sink.currentUser();
  const existing = { wells: await sink.listMyWells() };
  const plan = planImport(pkg, { userId: who.id, organizationId: who.organization_id ?? null, shareWithOrg, existing });
  const summary = await executeImport(plan, sink, { onProgress, resumeJobId });
  return { pkg, plan, summary };
}

/** Preflight for the UI: read and plan without writing. */
export async function preflightPackage(data, sink, { shareWithOrg = false } = {}) {
  const pkg = await readPackage(data);
  const who = await sink.currentUser();
  const existing = { wells: await sink.listMyWells() };
  const plan = planImport(pkg, { userId: who.id, organizationId: who.organization_id ?? null, shareWithOrg, existing });
  return { pkg, plan };
}

export { readStateVersion };
