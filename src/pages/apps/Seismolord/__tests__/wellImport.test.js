/**
 * Well import parsing: delimiter/header detection, mapping guesses,
 * and the domain-rule validation (monotonic MD, 0–180° inclination,
 * STRICTLY monotonic checkshots — rejected, never sorted). The golden
 * wells' station tables round-trip through the parser exactly.
 */
import fs from 'fs';
import path from 'path';

import {
  parseDelimited, guessMapping, buildDeviation, buildTops, buildCheckshots,
} from '@/pages/apps/Seismolord/engine/wellImport';

const GOLDEN = JSON.parse(fs.readFileSync(path.join(
  __dirname, '..', '..', '..', '..', '..',
  'test-data', 'seismolord', 'wells', 'wells.json',
), 'utf8'));

describe('parseDelimited', () => {
  test('detects comma / tab / whitespace and header rows', () => {
    const csv = parseDelimited('MD,INC,AZI\n0,0,0\n30,1.5,90\n');
    expect(csv.delimiter).toBe(',');
    expect(csv.header).toEqual(['MD', 'INC', 'AZI']);
    expect(csv.rows).toEqual([['0', '0', '0'], ['30', '1.5', '90']]);

    const tsv = parseDelimited('0\t0\t0\n30\t1.5\t90');
    expect(tsv.delimiter).toBe('\t');
    expect(tsv.header).toBeNull();                 // all-numeric first row

    const ws = parseDelimited('# a comment\n0  0   0\n30 1.5 90\n\n');
    expect(ws.delimiter).toBe('whitespace');
    expect(ws.rows).toHaveLength(2);
  });

  test('empty input yields no rows', () => {
    expect(parseDelimited('').rows).toEqual([]);
    expect(parseDelimited('# only comments\n').rows).toEqual([]);
  });
});

describe('guessMapping', () => {
  test('matches common column names without reusing a column', () => {
    expect(guessMapping(['MD (m)', 'Incl', 'Azim'], ['md', 'inc', 'azi']))
      .toEqual({ md: 0, inc: 1, azi: 2 });
    expect(guessMapping(['Formation', 'Depth'], ['name', 'md']))
      .toEqual({ name: 0, md: 1 });
    expect(guessMapping(['TVDSS', 'TWT_ms'], ['tvdss', 'twt']))
      .toEqual({ tvdss: 0, twt: 1 });
    expect(guessMapping(['a', 'b'], ['md', 'inc'])).toEqual({ md: -1, inc: -1 });
  });
});

describe('buildDeviation', () => {
  const map = { md: 0, inc: 1, azi: 2 };

  test.each(GOLDEN.wells.map((w) => [w.name, w]))(
    '%s: golden stations round-trip through a rendered CSV',
    (_name, w) => {
      const csv = `MD,INC,AZI\n${w.stations
        .map((s) => `${s.md},${s.inc},${s.azi}`).join('\n')}`;
      const { header, rows } = parseDelimited(csv);
      const m = guessMapping(header, ['md', 'inc', 'azi']);
      const stations = buildDeviation(rows, m);
      expect(stations).toEqual(w.stations);
    },
  );

  test('non-increasing MD and out-of-range inclination are rejected with row numbers', () => {
    expect(() => buildDeviation([['0', '0', '0'], ['0', '5', '0']], map))
      .toThrow(/Row 2: MD 0 does not increase/);
    expect(() => buildDeviation([['0', '0', '0'], ['30', '190', '0']], map))
      .toThrow(/Row 2: inclination 190/);
    expect(() => buildDeviation([['0', '0', '0'], ['30', 'x', '0']], map))
      .toThrow(/Row 2: inclination "x" is not a number/);
    expect(() => buildDeviation([['0', '0', '0']], map)).toThrow(/at least 2/);
    expect(() => buildDeviation([], { md: -1, inc: 1, azi: 2 })).toThrow(/Map the MD/);
  });
});

describe('buildTops', () => {
  test('parses names + MD; blank names rejected', () => {
    expect(buildTops([['Dome', '116.1'], ['Base', '300']], { name: 0, md: 1 }))
      .toEqual([{ name: 'Dome', md: 116.1 }, { name: 'Base', md: 300 }]);
    expect(() => buildTops([['', '5']], { name: 0, md: 1 })).toThrow(/Row 1: the top has no name/);
  });
});

describe('buildCheckshots', () => {
  const map = { tvdss: 0, twt: 1 };

  test('golden checkshots round-trip and stay monotonic', () => {
    const w = GOLDEN.wells[0];
    const rows = w.checkshots.map((c) => [String(c.tvdss_m), String(c.twt_ms)]);
    expect(buildCheckshots(rows, map)).toEqual(w.checkshots);
  });

  test('non-monotonic tables are rejected, not sorted', () => {
    expect(() => buildCheckshots([['0', '0'], ['50', '55'], ['40', '60']], map))
      .toThrow(/Row 3: checkshots must strictly increase/);
    expect(() => buildCheckshots([['0', '0'], ['50', '0']], map))
      .toThrow(/Row 2: checkshots must strictly increase/);
    expect(() => buildCheckshots([['0', '0']], map)).toThrow(/at least 2/);
  });
});
