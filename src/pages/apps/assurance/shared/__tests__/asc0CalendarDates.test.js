/**
 * ASC-0: a date meaning is never taken from an instant's UTC date.
 *
 * `new Date().toISOString().slice(0, 10)` and `<stamp>.slice(0, 10)` both
 * print the UTC date, which in Lagos is the day before anything done
 * between midnight and one in the morning (RC-5, RC-8). The helper below
 * prints the local calendar date, and the guard keeps the pattern out of
 * the files ASC-0 repaired.
 */
import fs from 'fs';
import path from 'path';
import { localDateOfInstant } from '../instantDates';
import { toDateOnlyString } from '@/lib/peerReview';

describe('localDateOfInstant', () => {
  it('prints the local calendar date an instant fell on', () => {
    const instant = new Date(Date.UTC(2026, 8, 17, 23, 30));
    expect(localDateOfInstant(instant.toISOString())).toBe(toDateOnlyString(instant));
    expect(localDateOfInstant(instant)).toBe(toDateOnlyString(instant));
  });

  it('returns a bare calendar date as it is, in every zone', () => {
    expect(localDateOfInstant('2026-09-18')).toBe('2026-09-18');
  });

  it('is empty for nothing or an unreadable value', () => {
    expect(localDateOfInstant(null)).toBe('');
    expect(localDateOfInstant('')).toBe('');
    expect(localDateOfInstant('not a date')).toBe('');
  });
});

const ROOT = path.resolve(__dirname, '../../../../../..');
const GUARDED = [
  'src/pages/apps/assurance/moc',
  'src/pages/dashboard/AssuranceHub.jsx',
];
// A UTC date taken from an instant: toISOString() cut to ten characters,
// or a *_at / decision_date stamp cut the same way.
const UTC_DATE = /toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)|(_at|decision_date)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)/;
const DATE_COLUMN_AS_INSTANT = /(_date|_on)\s*=\s*new Date\(\)\.toISOString\(\)/;

const sources = (p) => {
  const abs = path.join(ROOT, p);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__' || e.name === 'node_modules') return [];
    const child = path.join(p, e.name);
    if (e.isDirectory()) return sources(child);
    return /\.(js|jsx)$/.test(e.name) ? [path.join(ROOT, child)] : [];
  });
};

describe('no UTC date where a calendar date is meant', () => {
  const files = GUARDED.flatMap(sources);

  it('finds the files it guards', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(GUARDED)('%s cuts no instant to its UTC date', (p) => {
    const hits = sources(p).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')
      .map((line, i) => ({ line, at: `${path.relative(ROOT, f)}:${i + 1}` }))
      .filter(({ line }) => UTC_DATE.test(line) || DATE_COLUMN_AS_INSTANT.test(line))
      .map(({ at, line }) => `${at}: ${line.trim()}`));
    expect(hits).toEqual([]);
  });
});
