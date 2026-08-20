// End-to-end CRS hint path: a genuine EBCDIC textual header (cp037
// bytes) decoded by readTextualHeader, scanned by crsHintsFromText.
// Proves the two engines compose across the decode boundary.

import { readTextualHeader } from '@/pages/apps/Seismolord/engine/segyScan';
import { crsHintsFromText } from '@/pages/apps/Seismolord/engine/crsHint';
import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';

// ASCII -> EBCDIC (cp037) for the characters the header uses.
const A2E = (() => {
  const pairs = {
    ' ': 0x40, '.': 0x4b, ':': 0x7a, '(': 0x4d, ')': 0x5d, '-': 0x60, '/': 0x61, ',': 0x6b,
  };
  const put = (chars, base) => {
    for (let i = 0; i < chars.length; i += 1) pairs[chars[i]] = base + i;
  };
  put('ABCDEFGHI', 0xc1);
  put('JKLMNOPQR', 0xd1);
  put('STUVWXYZ', 0xe2);
  put('0123456789', 0xf0);
  return pairs;
})();

function ebcdicHeader(lines) {
  const buf = new Uint8Array(3600).fill(0x40);
  lines.forEach((line, i) => {
    for (let c = 0; c < Math.min(line.length, 80); c += 1) {
      buf[i * 80 + c] = A2E[line[c]] ?? 0x40;
    }
  });
  return bufferReader(buf.buffer);
}

test('EBCDIC header with UTM zone and datum yields the composed EPSG suggestion', async () => {
  const reader = ebcdicHeader([
    'C 1 CLIENT: PETROLORD AREA: NORTH SEA',
    'C 2 PROJECTION: UTM ZONE 31 N DATUM: ED-50 SPHEROID: INTERNATIONAL',
    'C 3 COORDINATES IN METERS',
  ]);
  const lines = await readTextualHeader(reader);
  expect(lines[1]).toContain('UTM ZONE 31 N');
  const { suggestions, unitHints } = crsHintsFromText(lines);
  expect(suggestions[0]).toMatchObject({ code: 'EPSG:23031', kind: 'utm-datum' });
  expect(suggestions[0].line).toContain('DATUM: ED-50');
  expect(unitHints[0].unit).toBe('m');
});

test('EBCDIC header with an explicit EPSG code resolves to the catalog name', async () => {
  const reader = ebcdicHeader(['C 1 CRS: EPSG:32631 (WGS 84 UTM 31N)']);
  const lines = await readTextualHeader(reader);
  const { suggestions } = crsHintsFromText(lines);
  expect(suggestions[0]).toMatchObject({
    code: 'EPSG:32631', name: 'WGS 84 / UTM zone 31N', confidence: 0.9,
  });
});
