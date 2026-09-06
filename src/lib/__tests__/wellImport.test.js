// Well import parsing at the door (PT1, 2026-09-03): checkshot conventions
// guessed from headers, inputs parsed without assuming TVDSS/TWT, MD in
// feet converted for deviation and tops, legacy wrapper unchanged.
import {
  parseDelimited, guessMapping, guessCheckshotConvention, buildCheckshotInputs,
  buildCheckshots, buildDeviation, buildTops, buildIntervals,
} from '@/lib/wellImport';
import { makeDepthFrame, toStoredCheckshots } from '@/pages/apps/WellDataManager/engine/checkshots';

test('an OWT header selects one-way time and MD; the values double at the door', () => {
  const { header, rows } = parseDelimited('MD_ft,OWT_ms\n1000,100\n2000,180');
  expect(guessMapping(header, ['depth', 'time'])).toEqual({ depth: 0, time: 1 });
  expect(guessCheckshotConvention(header)).toEqual({ depthRef: 'md', time: 'owt', depthUnit: 'ft' });
  const inputs = buildCheckshotInputs(rows, { depth: 0, time: 1 });
  const { rows: stored } = toStoredCheckshots(inputs, { depthRef: 'md', time: 'owt', depthUnit: 'ft' }, makeDepthFrame({ kbM: 30 }));
  expect(stored[0].twt_ms).toBe(200);
  expect(stored[0].md_m).toBeCloseTo(304.8, 9);
  expect(stored[0].tvdss_m).toBeCloseTo(274.8, 9);
});

test('TVDSS / TWT headers keep the stored convention; an unlabelled header guesses nothing', () => {
  expect(guessCheckshotConvention(['TVDSS (m)', 'TWT'])).toEqual({ depthRef: 'tvdss', time: 'twt', depthUnit: 'm' });
  expect(guessCheckshotConvention(['a', 'b'])).toEqual({});
  expect(guessCheckshotConvention(['Depth', 'Two-way time'])).toEqual({ time: 'twt' });
});

test('legacy buildCheckshots keeps the TVDSS/TWT metres behaviour and its error text', () => {
  expect(buildCheckshots([['100', '200'], ['150', '260']], { tvdss: 0, twt: 1 })).toEqual([{ tvdss_m: 100, twt_ms: 200 }, { tvdss_m: 150, twt_ms: 260 }]);
  expect(() => buildCheckshots([['0', '0'], ['50', '55'], ['40', '60']], { tvdss: 0, twt: 1 })).toThrow(/checkshots must strictly increase/);
});

test('deviation and tops MD in feet are stored in metres', () => {
  const dev = buildDeviation([['0', '0', '0'], ['1000', '10', '90']], { md: 0, inc: 1, azi: 2 }, { mdUnit: 'ft' });
  expect(dev[1].md).toBeCloseTo(304.8, 9);
  const tops = buildTops([['Top A', '5000']], { name: 0, md: 1 }, { mdUnit: 'ft' });
  expect(tops[0].md).toBeCloseTo(1524, 9);
  expect(buildTops([['Top A', '1500']], { name: 0, md: 1 })[0].md).toBe(1500);
});

test('checkshot inputs need two rows and numbers', () => {
  expect(() => buildCheckshotInputs([['1', '2']], { depth: 0, time: 1 })).toThrow(/at least 2 rows/);
  expect(() => buildCheckshotInputs([['1', 'x'], ['2', '3']], { depth: 0, time: 1 })).toThrow(/Row 1: time "x" is not a number/);
});

// Stratigraphy ST1: interval rows from a pasted table
test('buildIntervals maps top, base and code, converts feet, refuses an inverted row and a missing code', () => {
  const { header, rows } = parseDelimited('top,base,code,description\n1000,1100,SST,clean sand\n1100,1200,SH,');
  const map = guessMapping(header, ['top', 'base', 'code', 'label', 'description']);
  expect(map.top).toBe(0); expect(map.base).toBe(1); expect(map.code).toBe(2); expect(map.description).toBe(3);
  const out = buildIntervals(rows, map, { mdUnit: 'ft' });
  expect(out[0].top_md_m).toBeCloseTo(304.8, 6);
  expect(out[0].base_md_m).toBeCloseTo(335.28, 6);
  expect(out[0]).toMatchObject({ code: 'SST', label: null, properties: { description: 'clean sand' } });
  expect(out[1].properties).toEqual({});
  expect(() => buildIntervals([['1200', '1100', 'SST']], { top: 0, base: 1, code: 2, label: -1, description: -1 })).toThrow(/not below the top/);
  expect(() => buildIntervals([['1000', '1100', '']], { top: 0, base: 1, code: 2, label: -1, description: -1 })).toThrow(/has no code/);
  expect(() => buildIntervals([], { top: -1, base: 1, code: 2 })).toThrow(/Map the top, base and code/);
});
