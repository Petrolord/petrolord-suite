// The petro-project saved-state kind (PP0 state versioning) and its
// migrations, in one module both backends share so the registry path and
// the /dev harness open a row through exactly the same steps.
//
// Version 1: the PS3 shape (params, zone_params, facies, layouts,
// crossplots). The layouts sub-document keeps its own LAYOUTS_VERSION
// inside layoutSchema (migrateLayouts runs in the workstation on open).
//
// Version 2 (PT10a, owner decision 2, 2026-09-09): a row saved before
// PT9a may store `none` for a model whose code default has since moved
// (permMethod: none -> timur on 2026-09-07). The workstation merges the
// stored parameter set over the defaults on open, so the stale `none`
// silently won and the testers' shared interpretation computed no
// permeability. migrations[1] applies the current default ONCE to every
// model key that stores `none`, unless the row carries the explicit
// `params.deliberateNone[key]` flag (written by applyDeliberateNone when
// a user sets a model to none on purpose). Each change is recorded in the
// interpretation's provenance list (facies._provenance, a sibling of
// _rules and _scenarios; no DDL) with the date, the old and the new
// value, and the migrated row carries a transient `_migration` note the
// workstation shows once on the status line. The step is written against
// DEFAULT_PARAMS, so a future default change (temperature, say) migrates
// through the same code with no new step.

import { DEFAULT_PARAMS } from '../engine/pipeline';

export const PETRO_PROJECT_KIND = 'petro-project';
export const PETRO_PROJECT_VERSION = 2;

/** Model keys a saved `none` may hold, with the words the status line uses. */
export const MODEL_KEYS = {
  permMethod: { label: 'Permeability', section: 'Permeability', rule: 'owner rule: permeability is never off by default' },
  tempMode: { label: 'Temperature', section: 'Temperature', rule: null },
};

const VALUE_NAMES = { timur: 'Timur', tixier: 'Tixier', coates: 'Coates', 'wyllie-rose': 'Wyllie-Rose', linear: 'linear', none: 'none' };
export const valueName = (v) => VALUE_NAMES[v] || String(v);

/** Provenance entries stored on the interpretation (newest last). */
export const provenanceOf = (project) => {
  const list = project?.facies?._provenance;
  return Array.isArray(list) ? list : [];
};

/**
 * The v1 -> v2 step. `defaults` is injectable so the temperature path can
 * be proven in a test while the code default is still `none`; `now` is
 * the entry date.
 */
export function makeMigrateV1({ defaults = DEFAULT_PARAMS, now = () => new Date() } = {}) {
  return function migrateV1toV2(row) {
    const params = row?.params && typeof row.params === 'object' ? row.params : null;
    if (!params) return row;
    const flags = params.deliberateNone && typeof params.deliberateNone === 'object' ? params.deliberateNone : {};
    const changes = [];
    const next = { ...params };
    for (const key of Object.keys(MODEL_KEYS)) {
      const stored = params[key];
      const target = defaults[key];
      if (stored !== 'none' || target === 'none' || target == null || flags[key]) continue;
      next[key] = target;
      changes.push({ key, from: stored, to: target });
    }
    if (!changes.length) return row;
    const at = now().toISOString();
    const entries = changes.map((c) => ({
      at,
      kind: 'model-default-migration',
      key: c.key,
      from: c.from,
      to: c.to,
      note: `${MODEL_KEYS[c.key].label} model was ${valueName(c.from)} in this saved interpretation (pre-PT9a); ${valueName(c.to)} applied by the state-version 2 migration.`,
    }));
    const facies = row.facies && typeof row.facies === 'object' ? row.facies : {};
    return {
      ...row,
      params: next,
      facies: { ...facies, _provenance: [...provenanceOf(row), ...entries] },
      _migration: { changes },
    };
  };
}

/**
 * The one-time status line for a row the migration just changed
 * (null when nothing changed). Names every model that moved and how to
 * put it back.
 */
export function migrationStatusLine(row) {
  const changes = row?._migration?.changes || [];
  if (!changes.length) return null;
  const parts = changes.map((c) => {
    const m = MODEL_KEYS[c.key];
    const rule = m.rule ? ` (${m.rule})` : '';
    return `${m.label} model was off in this saved interpretation; ${valueName(c.to)} applied${rule}.`;
  });
  const sections = changes.map((c) => MODEL_KEYS[c.key].section);
  const where = sections.length === 1 ? `Parameters, ${sections[0]}` : `Parameters (${sections.join(', ')})`;
  return `${parts.join(' ')} Set it back to none in ${where} if that was deliberate.`;
}

/**
 * Stamp the explicit-choice flag on a parameter set a user is applying.
 * A model the user has just MOVED to `none` (it was something else in
 * `prev`) is recorded as deliberate; a model set to anything else clears
 * its flag; a model that was already `none` keeps whatever flag it had,
 * so a default `none` (temperature today) is never mistaken for a
 * choice just because other parameters were applied. Returns a new
 * object; `deliberateNone` is omitted when empty so untouched rows stay
 * byte-identical.
 */
export function applyDeliberateNone(params, prev = null) {
  if (!params || typeof params !== 'object') return params;
  const flags = { ...(params.deliberateNone || {}) };
  for (const key of Object.keys(MODEL_KEYS)) {
    if (params[key] !== 'none') delete flags[key];
    else if (!prev || prev[key] !== 'none') flags[key] = true;
  }
  const { deliberateNone: _old, ...rest } = params;
  return Object.keys(flags).length ? { ...rest, deliberateNone: flags } : rest;
}

/** Drop the transient open-time note before a row is stored or re-saved. */
export function stripTransient(row) {
  if (!row || typeof row !== 'object' || !('_migration' in row)) return row;
  const { _migration: _m, ...rest } = row;
  return rest;
}

export const petroProjectKindSpec = {
  current: PETRO_PROJECT_VERSION,
  label: 'interpretation',
  migrations: { 1: makeMigrateV1() },
};
