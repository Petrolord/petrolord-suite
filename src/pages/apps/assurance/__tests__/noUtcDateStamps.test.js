/**
 * AS13 hardening: no Assurance app stamps a calendar date in UTC.
 *
 * `new Date().toISOString().slice(0, 10)` and `.split('T')[0]` give the
 * UTC date, which near midnight is not the user's day: an NCR raised
 * then read an age of -1 and fell out of every age band. Stamp a date
 * with toDateOnlyString(new Date()) from the app's @/lib rule module
 * (or date-fns `format(d, 'yyyy-MM-dd')`), both of which are local.
 *
 * Full timestamps (`new Date().toISOString()`, for timestamptz columns)
 * are correct and are not matched.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../../..');
const TREES = [
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../../risk-register'),
];

const walk = (dir, out = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(full, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  });
  return out;
};

export const UTC_DATE_STAMP = [
  /toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)/,
  /toISOString\(\)\s*\.\s*split\(\s*['"`]T['"`]\s*\)/,
  /\.split\(\s*['"`]T['"`]\s*\)\s*\[\s*0\s*\]/,
  /toJSON\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)/,
];

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no UTC calendar-date stamps in the Assurance apps', () => {
  it('the guard catches every form it is meant to (negative control)', () => {
    [
      "raised_date: new Date().toISOString().slice(0, 10),",
      "const d = new Date().toISOString().split('T')[0];",
      'x.toISOString().substring(0,10)',
      'const d = stamp.split("T")[0];',
    ].forEach((line) => {
      expect(UTC_DATE_STAMP.some((re) => re.test(line))).toBe(true);
    });
    ['updated_at: new Date().toISOString(),', 'toDateOnlyString(new Date())']
      .forEach((line) => expect(UTC_DATE_STAMP.some((re) => re.test(line))).toBe(false));
  });

  it('no app file stamps a date with the UTC day', () => {
    const offenders = [];
    TREES.flatMap((t) => walk(t)).forEach((file) => {
      stripComments(fs.readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        if (UTC_DATE_STAMP.some((re) => re.test(line))) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    });
    expect(offenders).toEqual([]);
  });
});
