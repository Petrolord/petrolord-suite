// W10: a missing value in a table cell, card or stat tile shows EMPTY_VALUE
// ('n/a', from src/lib/emptyValue.js). This guard scans src (tests and
// src/supabase excluded; that covers every file reachable from main.jsx) for
// a string literal or JSX text that is a lone em dash, the old placeholder.
// ALLOW lists the few dashes that carry another meaning, each with a count,
// so a new placeholder in an allowed file still fails.
// Negative control: the last test feeds the scanner known placeholders.
import fs from 'fs';
import path from 'path';
import { EMPTY_VALUE, orEmpty } from '@/lib/emptyValue';

const SRC = path.join(__dirname, '..');

const ALLOW = {
  // Separator between the report date and its status in the saved-report list.
  'pages/apps/well-planning/tabs/ReportsTab.jsx': 1,
  // Unit column of the drive-index rows: the indices are dimensionless.
  // Input placeholder that marks a required PVT cell ('optional' otherwise).
  // Latin-1 map key for the PDF: an em dash in user text prints as '-'.
  'pages/apps/PetrophysicsStudio/services/petroReport.js': 1,
};

// A quoted lone dash ('—', "—", `—`, '—'), JSX text that is only a dash
// (>—< or }—{ with any whitespace).
const LONE_DASH = /(['"`])[ \t]*(?:—|\\u2014)[ \t]*\1|>\s*—\s*<|\}\s*—\s*\{/g;

const countLoneDashes = (text) => (text.match(LONE_DASH) || []).length;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name === '__mocks__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\.[jt]sx?$/.test(e.name)) out.push(p);
  }
  return out;
};

test('EMPTY_VALUE is n/a and orEmpty falls back to it', () => {
  expect(EMPTY_VALUE).toBe('n/a');
  expect(orEmpty(null)).toBe(EMPTY_VALUE);
  expect(orEmpty(undefined)).toBe(EMPTY_VALUE);
  expect(orEmpty('')).toBe(EMPTY_VALUE);
  expect(orEmpty(NaN)).toBe(EMPTY_VALUE);
  expect(orEmpty(0)).toBe(0);
  expect(orEmpty('psi')).toBe('psi');
});

test('no src file renders a lone em dash as the empty-value placeholder', () => {
  const hits = [];
  const seen = {};
  for (const f of walk(SRC)) {
    const rel = path.relative(SRC, f).split(path.sep).join('/');
    if (rel.startsWith('supabase/')) continue;
    const n = countLoneDashes(fs.readFileSync(f, 'utf8'));
    if (!n) continue;
    seen[rel] = n;
    if (ALLOW[rel] !== n) hits.push(`${rel}: ${n} lone dash(es), allowed ${ALLOW[rel] || 0}`);
  }
  expect(hits).toEqual([]);
  // every allow-list entry is still needed
  expect(Object.keys(ALLOW).filter((k) => seen[k] !== ALLOW[k])).toEqual([]);
});

test('negative control: the scanner finds the old placeholders', () => {
  expect(countLoneDashes("const f = (v) => (v == null ? '—' : v.toFixed(2));")).toBe(1);
  expect(countLoneDashes('<td>{row.unit ?? "—"}</td>')).toBe(1);
  expect(countLoneDashes('<span className="text-pl-muted">\n  —\n</span>')).toBe(1);
  expect(countLoneDashes("return '\\u2014';")).toBe(1);
  expect(countLoneDashes("const s = 'P10 — P90';")).toBe(0);
  expect(countLoneDashes('<td>{row.unit ?? EMPTY_VALUE}</td>')).toBe(0);
});
