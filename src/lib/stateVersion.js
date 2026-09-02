// State versioning for saved app state (Project Portability PP0, PLAN §4.3).
//
// The Petrel rule applied to rows: a row saved by an older build opens on
// a newer one by migrating step-wise; a row saved by a NEWER build than
// the one reading it is refused with a message that names both versions.
// Nothing is opened without going through openState(), and nothing is
// written without stampState(), so every row says what wrote it.
//
// A "kind" is one app's saved-state shape (e.g. 'saved-project:saved_dca_projects',
// 'petro-project'). Each kind registers its current version and its
// migrators: migrations[n] takes a row at version n and returns the row at
// version n + 1. Rows with no schema_version column (written before the
// PP0 migration, or from a table that never got one) are version 1 by
// definition: each app's version-1 reader is the tolerant reader it had
// before PP0, so upgrade day changes nothing for existing rows.
//
// Column names (20260902120000_pp0_state_versions.sql): schema_version
// integer, app_build text. A write that carries them against a table where
// the migration has not been applied yet fails with PostgREST 42703 /
// PGRST204 (unknown column); writeStamped() retries once without the
// stamp so code can land ahead of the migration on any environment.

import { PLATFORM_BUILD } from '@/lib/platformBuild';

export const SCHEMA_VERSION_COLUMN = 'schema_version';
export const APP_BUILD_COLUMN = 'app_build';

const kinds = new Map();

export class StateVersionError extends Error {
  /**
   * @param {'newer'|'unregistered'|'missing-migrator'|'bad-migrator'} code
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StateVersionError';
    this.code = code;
    Object.assign(this, details);
  }
}

export const isNewerStateError = (e) => e instanceof StateVersionError && e.code === 'newer';

/** User-facing copy for a refused row (no em dashes: owner rule). */
export function newerStateMessage(label, found, current) {
  return `This ${label} was saved by a newer version of Petrolord (state version ${found}; `
    + `this build reads up to version ${current}). Reload the page to get the latest build, then open it again.`;
}

/**
 * Register a kind. Idempotent for identical registrations; re-registering
 * with a different current version replaces the entry (tests, HMR).
 *
 * @param {string} kind
 * @param {{ current?: number, migrations?: Record<number, (row: any) => any>, label?: string }} spec
 */
export function registerStateKind(kind, { current = 1, migrations = {}, label } = {}) {
  if (!kind || typeof kind !== 'string') throw new TypeError('registerStateKind: kind must be a string');
  if (!Number.isInteger(current) || current < 1) throw new TypeError(`registerStateKind(${kind}): current must be a positive integer`);
  for (let v = 1; v < current; v += 1) {
    if (typeof migrations[v] !== 'function') {
      throw new StateVersionError('missing-migrator',
        `registerStateKind(${kind}): current is ${current} but no migrator from version ${v} to ${v + 1} was given`,
        { kind, from: v });
    }
  }
  const entry = { kind, current, migrations: { ...migrations }, label: label || kind };
  kinds.set(kind, entry);
  return entry;
}

export function getStateKind(kind) {
  return kinds.get(kind) || null;
}

/** Version stamped on a row; absent, null or invalid means 1. */
export function readStateVersion(row) {
  const v = row?.[SCHEMA_VERSION_COLUMN];
  return Number.isInteger(v) && v >= 1 ? v : 1;
}

/**
 * Open a stored row as the current version of its kind.
 * Returns { row, from, to, migrated }. Throws StateVersionError('newer')
 * when the row is stamped above what this build reads.
 */
export function openState(kind, row) {
  const entry = kinds.get(kind);
  if (!entry) throw new StateVersionError('unregistered', `openState: state kind "${kind}" is not registered`, { kind });
  if (row == null) return { row, from: null, to: entry.current, migrated: false };

  const from = readStateVersion(row);
  if (from > entry.current) {
    throw new StateVersionError('newer', newerStateMessage(entry.label, from, entry.current),
      { kind, found: from, current: entry.current, label: entry.label });
  }
  let out = row;
  for (let v = from; v < entry.current; v += 1) {
    const step = entry.migrations[v];
    if (typeof step !== 'function') {
      throw new StateVersionError('missing-migrator', `openState(${kind}): no migrator from version ${v} to ${v + 1}`, { kind, from: v });
    }
    out = step(out);
    if (out == null || typeof out !== 'object') {
      throw new StateVersionError('bad-migrator', `openState(${kind}): migrator ${v} -> ${v + 1} returned ${out}`, { kind, from: v });
    }
  }
  if (from < entry.current) out = { ...out, [SCHEMA_VERSION_COLUMN]: entry.current };
  return { row: out, from, to: entry.current, migrated: from < entry.current };
}

/** Convenience: the migrated row only (null in, null out). */
export function openStateRow(kind, row) {
  return openState(kind, row).row;
}

/** Stamp a row about to be written with the kind's current version and this build. */
export function stampState(kind, row) {
  const entry = kinds.get(kind);
  if (!entry) throw new StateVersionError('unregistered', `stampState: state kind "${kind}" is not registered`, { kind });
  return { ...row, [SCHEMA_VERSION_COLUMN]: entry.current, [APP_BUILD_COLUMN]: PLATFORM_BUILD.sha };
}

/** Remove the stamp columns from a payload (retry path when the migration is not applied yet). */
export function withoutStamp(row) {
  if (!row || typeof row !== 'object') return row;
  const { [SCHEMA_VERSION_COLUMN]: _v, [APP_BUILD_COLUMN]: _b, ...rest } = row;
  return rest;
}

/** PostgREST "column does not exist" (42703) or schema-cache miss (PGRST204). */
export function isUnknownColumnError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42703' || code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(msg);
}

let warnedOnce = false;
/**
 * Run a write with the stamp; if the table has not received the PP0
 * columns yet, retry once without them so saves keep working while a
 * migration lags the code. `write(payload)` must return the supabase
 * result shape `{ data, error }`.
 */
export async function writeStamped(kind, payload, write) {
  const stamped = stampState(kind, payload);
  const first = await write(stamped);
  if (!first?.error || !isUnknownColumnError(first.error)) return first;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(`[stateVersion] ${kind}: stamp columns missing (migration 20260902120000 not applied here yet); saving without stamp`);
  }
  return write(withoutStamp(stamped));
}

/** Test hook. */
export function _resetStateKinds() {
  kinds.clear();
  warnedOnce = false;
}
