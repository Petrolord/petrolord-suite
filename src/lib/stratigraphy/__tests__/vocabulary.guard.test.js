// Vocabulary guards (Stratigraphy Studio ST0, plan section 8).
//
// 1. The migration's surface_type check constraint and the engine's
//    SURFACE_CODES are the same list, so the database and the vocabulary
//    cannot drift apart.
// 2. Scheme drift: no Suite source outside the vendored engine (and its
//    shim) carries an Exxon label. If a component ever stores or compares
//    an Exxon name the display option becomes a data option.
// 3. The shims re-export the engine, so the Suite sees one vocabulary.

import fs from 'fs';
import path from 'path';
import { SURFACE_CODES, SURFACE_TYPES, displayLabel, DEFAULT_SURFACE_TYPE } from '../vocabulary';
import { TIMESCALE_VERSION } from '../timescale';
import { RANKS } from '../column';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '20260906180000_st0_stratigraphic_framework.sql');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, out); }
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('surface_type check constraint matches SURFACE_CODES', () => {
  test('the migration lists exactly the engine codes, in order', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const m = sql.match(/check \(surface_type in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const codes = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(codes).toEqual([...SURFACE_CODES]);
    expect(sql).toMatch(new RegExp(`surface_type text not null default '${DEFAULT_SURFACE_TYPE}'`));
  });

  test('the confidence constraint matches the plan', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(/confidence is null or confidence in \('high', 'medium', 'low'\)/);
  });
});

describe('scheme drift', () => {
  test('no Suite source outside the engine carries an Exxon label', () => {
    const exxonLabels = SURFACE_TYPES.map((s) => s.exxon?.label).filter(Boolean)
      .filter((l) => !/^(Formation top|Unconformity, unclassified|Biostratigraphic datum|Maximum flooding surface \(MFS\))$/.test(l));
    expect(exxonLabels.length).toBeGreaterThan(3);
    const files = walk(path.join(ROOT, 'src'));
    const offenders = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const l of exxonLabels) if (text.includes(l)) offenders.push(`${path.relative(ROOT, f)}: ${l}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('shims', () => {
  test('re-export the vendored engine', () => {
    expect(displayLabel('MFS', 'exxon').label).toBe('Maximum flooding surface (MFS)');
    expect(TIMESCALE_VERSION).toBe('ICS 2023/09');
    expect(RANKS).toEqual(['group', 'formation', 'member', 'bed']);
  });
});
