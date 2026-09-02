// .pld manifest: build and validate (Project Portability PP1, PLAN §4.1).
//
// The schema of record is test-data/portability/manifest.schema.json (JSON
// Schema draft-07). The SPA has no schema library and node_modules is
// tracked, so validateManifest() is a small hand-written validator that
// enforces exactly what that schema says for package_version 1: required
// keys, types, enums, patterns and additionalProperties. The jest gate
// keeps the two in step by running both the validator and a structural
// read of the schema file over the same fixtures.

import { PLATFORM_BUILD } from '@/lib/platformBuild';
import { allRootKinds } from './familySpec';
import './familiesCore';

export const PACKAGE_FORMAT = 'pld';
export const PACKAGE_VERSION = 1;
export const MANIFEST_FILE = 'manifest.json';

/** Root kinds come from the family registry; evaluated when read so late-registered families count. */
export const ROOT_KINDS = new Proxy([], {
  get(_, prop) { const arr = allRootKinds(); const v = arr[prop]; return typeof v === 'function' ? v.bind(arr) : v; },
});
export const OPEN_KINDS = ['las', 'tops_csv', 'zones_csv', 'zmap', 'csv', 'readme'];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TABLE_FILE_RE = /^data\/[a-z0-9_]+\.jsonl$/;

export function newPackageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // RFC 4122 v4 from Math.random (test environments without WebCrypto)
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[(Math.random() * 4) | 8];
    else s += h[(Math.random() * 16) | 0];
  }
  return s;
}

/**
 * Assemble a manifest. `tables` is { table: { rows, schemaVersions: number[], pk } },
 * `blobs`, `open` and `files` are the arrays/maps the writer accumulated.
 */
export function buildManifest({
  name = null, packageId = newPackageId(), createdAt = new Date().toISOString(),
  source, roots, tables, blobs = [], open = [], files = {}, notes = [], platform = PLATFORM_BUILD,
}) {
  const tableEntries = {};
  for (const [table, info] of Object.entries(tables || {})) {
    const versions = (info.schemaVersions && info.schemaVersions.length) ? info.schemaVersions : [1];
    tableEntries[table] = {
      rows: info.rows,
      file: `data/${table}.jsonl`,
      schema_version: { min: Math.min(...versions), max: Math.max(...versions) },
      ...(info.pk ? { pk: info.pk } : {}),
    };
  }
  const manifest = {
    format: PACKAGE_FORMAT,
    package_version: PACKAGE_VERSION,
    package_id: packageId,
    ...(name ? { name } : {}),
    created_at: createdAt,
    platform: { version: platform.version, sha: platform.sha, builtAt: platform.builtAt ?? null, source: platform.source },
    source: { user_id: source.user_id, organization_id: source.organization_id ?? null, organization_name: source.organization_name ?? null },
    scope: { roots: roots.map((r) => ({ kind: r.kind, id: r.id, name: r.name ?? null, ...(r.table ? { table: r.table } : {}) })) },
    tables: tableEntries,
    blobs,
    open,
    files,
    signature: null,
    notes,
  };
  return manifest;
}

// ---- validator -------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min = -Infinity) => Number.isInteger(v) && v >= min;
const isStr = (v) => typeof v === 'string';

function checkKeys(obj, allowed, required, path, errors) {
  for (const k of required) if (!(k in obj)) errors.push(`${path}: missing required "${k}"`);
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${path}: unexpected property "${k}"`);
}

/**
 * Validate a parsed manifest against package_version 1. Returns
 * { ok, errors: string[] }. Never throws on bad input.
 */
export function validateManifest(m) {
  const errors = [];
  if (!isObj(m)) return { ok: false, errors: ['manifest: not an object'] };

  checkKeys(m,
    ['format', 'package_version', 'package_id', 'name', 'created_at', 'platform', 'source', 'scope', 'tables', 'blobs', 'open', 'files', 'signature', 'notes'],
    ['format', 'package_version', 'package_id', 'created_at', 'platform', 'source', 'scope', 'tables', 'blobs', 'open', 'files'],
    'manifest', errors);

  if (m.format !== PACKAGE_FORMAT) errors.push(`format: expected "${PACKAGE_FORMAT}"`);
  if (!isInt(m.package_version, 1)) errors.push('package_version: integer >= 1 required');
  if (!isStr(m.package_id) || !UUID_RE.test(m.package_id)) errors.push('package_id: uuid required');
  if ('name' in m && (!isStr(m.name) || m.name.length > 200)) errors.push('name: string up to 200 chars');
  if (!isStr(m.created_at) || Number.isNaN(Date.parse(m.created_at))) errors.push('created_at: date-time string required');

  if (isObj(m.platform)) {
    checkKeys(m.platform, ['version', 'sha', 'builtAt', 'source'], ['version', 'sha'], 'platform', errors);
    if (!isStr(m.platform.version)) errors.push('platform.version: string required');
    if (!isStr(m.platform.sha)) errors.push('platform.sha: string required');
    if ('builtAt' in m.platform && m.platform.builtAt !== null && !isStr(m.platform.builtAt)) errors.push('platform.builtAt: string or null');
  } else errors.push('platform: object required');

  if (isObj(m.source)) {
    checkKeys(m.source, ['user_id', 'organization_id', 'organization_name'], ['user_id'], 'source', errors);
    if (!isStr(m.source.user_id) || !UUID_RE.test(m.source.user_id)) errors.push('source.user_id: uuid required');
    if ('organization_id' in m.source && m.source.organization_id !== null && !(isStr(m.source.organization_id) && UUID_RE.test(m.source.organization_id))) errors.push('source.organization_id: uuid or null');
  } else errors.push('source: object required');

  if (isObj(m.scope) && Array.isArray(m.scope.roots)) {
    checkKeys(m.scope, ['roots'], ['roots'], 'scope', errors);
    m.scope.roots.forEach((r, i) => {
      if (!isObj(r)) { errors.push(`scope.roots[${i}]: object required`); return; }
      checkKeys(r, ['kind', 'id', 'name', 'table'], ['kind', 'id'], `scope.roots[${i}]`, errors);
      if (!ROOT_KINDS.includes(r.kind)) errors.push(`scope.roots[${i}].kind: one of ${ROOT_KINDS.join(', ')}`);
      if ('table' in r && !(isStr(r.table) && /^[a-z0-9_]+$/.test(r.table))) errors.push(`scope.roots[${i}].table: table name`);
      if (!isStr(r.id) || !UUID_RE.test(r.id)) errors.push(`scope.roots[${i}].id: uuid required`);
    });
  } else errors.push('scope.roots: array required');

  if (isObj(m.tables)) {
    for (const [t, info] of Object.entries(m.tables)) {
      if (!isObj(info)) { errors.push(`tables.${t}: object required`); continue; }
      checkKeys(info, ['rows', 'file', 'schema_version', 'pk'], ['rows', 'file', 'schema_version'], `tables.${t}`, errors);
      if (!isInt(info.rows, 0)) errors.push(`tables.${t}.rows: integer >= 0`);
      if (!isStr(info.file) || !TABLE_FILE_RE.test(info.file)) errors.push(`tables.${t}.file: data/<table>.jsonl`);
      if (isObj(info.schema_version)) {
        checkKeys(info.schema_version, ['min', 'max'], ['min', 'max'], `tables.${t}.schema_version`, errors);
        if (!isInt(info.schema_version.min, 1) || !isInt(info.schema_version.max, 1)) errors.push(`tables.${t}.schema_version: integers >= 1`);
        else if (info.schema_version.min > info.schema_version.max) errors.push(`tables.${t}.schema_version: min > max`);
      } else errors.push(`tables.${t}.schema_version: object required`);
    }
  } else errors.push('tables: object required');

  if (Array.isArray(m.blobs)) {
    m.blobs.forEach((b, i) => {
      if (!isObj(b)) { errors.push(`blobs[${i}]: object required`); return; }
      checkKeys(b, ['bucket', 'path', 'file', 'bytes', 'table', 'row_id', 'content_type'], ['bucket', 'path', 'file', 'bytes'], `blobs[${i}]`, errors);
      if (!isStr(b.file) || !b.file.startsWith('blobs/')) errors.push(`blobs[${i}].file: must start with blobs/`);
      if (!isInt(b.bytes, 0)) errors.push(`blobs[${i}].bytes: integer >= 0`);
    });
  } else errors.push('blobs: array required');

  if (Array.isArray(m.open)) {
    m.open.forEach((o, i) => {
      if (!isObj(o)) { errors.push(`open[${i}]: object required`); return; }
      checkKeys(o, ['kind', 'file', 'table', 'row_id', 'name'], ['kind', 'file'], `open[${i}]`, errors);
      if (!OPEN_KINDS.includes(o.kind)) errors.push(`open[${i}].kind: one of ${OPEN_KINDS.join(', ')}`);
      if (!isStr(o.file) || !/^(open\/|README)/.test(o.file)) errors.push(`open[${i}].file: must start with open/ or README`);
    });
  } else errors.push('open: array required');

  if (isObj(m.files)) {
    for (const [f, info] of Object.entries(m.files)) {
      if (!isObj(info)) { errors.push(`files.${f}: object required`); continue; }
      checkKeys(info, ['bytes', 'sha256'], ['bytes', 'sha256'], `files.${f}`, errors);
      if (!isInt(info.bytes, 0)) errors.push(`files.${f}.bytes: integer >= 0`);
      if (!isStr(info.sha256) || !SHA256_RE.test(info.sha256)) errors.push(`files.${f}.sha256: 64 hex chars`);
    }
    // every declared table/blob/open file must be present in files
    if (isObj(m.tables)) for (const info of Object.values(m.tables)) if (isObj(info) && isStr(info.file) && !(info.file in m.files)) errors.push(`files: missing entry for ${info.file}`);
    if (Array.isArray(m.blobs)) for (const b of m.blobs) if (isObj(b) && isStr(b.file) && !(b.file in m.files)) errors.push(`files: missing entry for ${b.file}`);
    if (Array.isArray(m.open)) for (const o of m.open) if (isObj(o) && isStr(o.file) && !(o.file in m.files)) errors.push(`files: missing entry for ${o.file}`);
  } else errors.push('files: object required');

  if ('signature' in m && m.signature !== null) {
    if (!isObj(m.signature)) errors.push('signature: object or null');
    else checkKeys(m.signature, ['alg', 'key_id', 'value'], [], 'signature', errors);
  }
  if ('notes' in m && !(Array.isArray(m.notes) && m.notes.every(isStr))) errors.push('notes: array of strings');

  return { ok: errors.length === 0, errors };
}

/** The Petrel rule at the package level: refuse a package written by a newer format. */
export function packageVersionCheck(m, reads = PACKAGE_VERSION) {
  const v = m?.package_version;
  if (!isInt(v, 1)) return { ok: false, message: 'This file does not carry a valid package version.' };
  if (v > reads) {
    return {
      ok: false,
      message: `This package was written by a newer version of Petrolord (package version ${v}; this build reads up to version ${reads}). Reload the page to get the latest build, then open it again.`,
    };
  }
  return { ok: true, message: null };
}
