/**
 * AppUpgrade WDM-U1-005 and WDM-U1-013 (shared wells import layer, used by
 * Well Data Manager, Seismolord's well import and every PasteReplacePanel):
 * the hostile tops / survey / checkshot files from e2e/fixtures/wdm/hostile/.
 */
import fs from 'fs';
import path from 'path';
import {
  parseDelimited, guessMapping, guessMdUnit, guessDepthUnit, buildTops, buildDeviation, buildCheckshotInputs,
} from '@/lib/wellImport';

const HOSTILE = path.join(__dirname, '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');
const text = (f) => fs.readFileSync(path.join(HOSTILE, f), 'utf8');

test('header cells state their depth unit', () => {
  expect(guessDepthUnit('MD (ft)')).toBe('ft');
  expect(guessDepthUnit('MD[ft]')).toBe('ft');
  expect(guessDepthUnit('MD_FT')).toBe('ft');
  expect(guessDepthUnit('Depth (metres)')).toBe('m');
  expect(guessDepthUnit('MD')).toBeNull();
  expect(guessDepthUnit('Formation')).toBeNull();
});

test('a Petrel well tops export: Surface + "MD (ft)" maps and reads as feet', () => {
  const p = parseDelimited(text('tops_petrel_export_ft.txt'));
  const map = guessMapping(p.header, ['name', 'md']);
  expect(p.header[map.name]).toBe('Surface');
  expect(p.header[map.md]).toBe('MD (ft)');
  const unit = guessMdUnit(p.header, ['name', 'md']);
  expect(unit).toBe('ft');
  const tops = buildTops(p.rows, map, { mdUnit: unit });
  expect(tops[0]).toEqual({ name: 'Top Agbada', md: expect.closeTo(6565.6 * 0.3048, 9) });
  // negative control: the metres default stores the feet number as metres
  expect(buildTops(p.rows, map).map((t) => t.md)[0]).toBe(6565.6);
});

test('a survey with units in the header and an extra TVD column', () => {
  const p = parseDelimited(text('deviation_units_header.csv'));
  const map = guessMapping(p.header, ['md', 'inc', 'azi']);
  expect(map).toEqual({ md: 0, inc: 1, azi: 2 });
  expect(guessMdUnit(p.header, ['md', 'inc', 'azi'])).toBe('ft');
  const st = buildDeviation(p.rows, map, { mdUnit: 'ft' });
  expect(st[st.length - 1].md).toBeCloseTo(914.4, 9);
});

test('negative-Z checkshots (Petrel elevation) get a message that says what they are', () => {
  const p = parseDelimited(text('checkshots_petrel_negative_z.txt'));
  const map = guessMapping(p.header, ['depth', 'time']);
  expect(() => buildCheckshotInputs(p.rows, map)).toThrow(/reads as an elevation \(Petrel Z, negative down\)/);
  // positive depths are untouched
  expect(buildCheckshotInputs([['276.8', '480'], ['581.6', '880']], { depth: 0, time: 1 })).toHaveLength(2);
});
