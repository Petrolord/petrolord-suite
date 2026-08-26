import {
  availableFieldVectors, availableWellVectors, wellNames,
  fieldSeries, wellSeries, fmtElapsed,
} from '../resultAdapters';

const SUMMARY = {
  opm_version: 'flow 2026.04',
  start_date: '2015-01-01',
  days: [0, 30, 60],
  field: { FOPR: [100, 90, 80], FGOR: [1.2, 1.3, 1.4] },
  wells: {
    PROD: { WOPR: [100, 90, 80], WBHP: [4000, 3900, 3800] },
    INJ: { WBHP: [4500, 4600, 4700] },
  },
};

test('availableFieldVectors returns only present keys in display order', () => {
  expect(availableFieldVectors(SUMMARY)).toEqual(['FOPR', 'FGOR']);
  expect(availableFieldVectors(null)).toEqual([]);
});

test('availableWellVectors unions bases across wells', () => {
  expect(availableWellVectors(SUMMARY)).toEqual(['WOPR', 'WBHP']);
});

test('wellNames lists wells', () => {
  expect(wellNames(SUMMARY)).toEqual(['PROD', 'INJ']);
});

test('fieldSeries zips days with values', () => {
  expect(fieldSeries(SUMMARY, 'FOPR')).toEqual([
    { day: 0, value: 100 }, { day: 30, value: 90 }, { day: 60, value: 80 },
  ]);
});

test('wellSeries builds one row per day with a column per well', () => {
  const rows = wellSeries(SUMMARY, 'WBHP');
  expect(rows[1]).toEqual({ day: 30, PROD: 3900, INJ: 4600 });
  // WOPR exists only on PROD: INJ column absent, not null-filled.
  expect(wellSeries(SUMMARY, 'WOPR')[0]).toEqual({ day: 0, PROD: 100 });
});

test('fmtElapsed formats seconds and minutes', () => {
  expect(fmtElapsed(42)).toBe('42 s');
  expect(fmtElapsed(150)).toBe('2 min 30 s');
  expect(fmtElapsed(null)).toBe('—');
});
