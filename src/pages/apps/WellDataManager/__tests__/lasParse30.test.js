// LAS 3.0 reader rules beyond the goldens (2026-09-03, tester files):
// delimiter handling, skipped text columns, ignored data blocks, the
// 2.0 path untouched, and the domain errors a 3.0 file can raise.
import fs from 'fs';
import path from 'path';

import { parseLas, splitDelimited, parseHeaderLine3 } from '@/pages/apps/WellDataManager/engine/lasParse';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'wells', 'las');
const load = (name) => fs.readFileSync(path.join(DATA_DIR, `${name}.las`), 'utf8');

test('comma fixture: text columns skipped and named, other data blocks ignored and named, array channels kept', () => {
  const p = parseLas(load('las3_comma_30'));
  expect(p.version).toBe(3);
  expect(p.delimiter).toBe('comma');
  expect(p.curves.map((c) => c.mnemonic)).toEqual(['DEPT', 'GR', 'A34H', 'P40H', 'RHOB[1]', 'RHOB[2]']);
  expect(p.curves.map((c) => c.format)).toEqual(['F', 'F', 'F', 'E', 'F', 'F']);
  expect(p.skippedCurves.map((c) => `${c.mnemonic}:${c.format}`)).toEqual(['LITH:S', 'TIME:DT']);
  expect(p.ignoredSections).toEqual(['Core', 'Tops']);
  // header tails stripped: no "{F}" or "| Log_Data" left in descriptions
  expect(p.curves.find((c) => c.mnemonic === 'GR').descr).toBe('GAMMA RAY');
  expect(p.curves.find((c) => c.mnemonic === 'GR').apiValue).toBe('45 310 01');
  // ~Parameter and ~Log_Parameter both land in params
  expect(Object.keys(p.params).sort()).toEqual(['BS', 'MATR', 'RUN']);
  expect(p.params.BS.value).toBe(8.5);
  // empty field is a null; the -999.25 token is a null
  const a34 = p.curves.find((c) => c.mnemonic === 'A34H');
  expect(Number.isNaN(a34.data[9])).toBe(true);
  expect(a34.nullCount).toBe(1);
  expect(Number.isNaN(p.curves[1].data[3])).toBe(true);
  // the well header survives the {DT} tail and the time colons
  expect(p.well.DATE.value).toBe('2026-09-03 12:30:00');
  expect(p.well.UWI.value).toBe('0123456789');
  expect(p.curves[0].nSamples).toBe(20);
});

test('space fixture: ragged spacing, association on the data title, all numeric', () => {
  const p = parseLas(load('las3_space_30'));
  expect(p.delimiter).toBe('space');
  expect(p.curves.map((c) => c.mnemonic)).toEqual(['DEPT', 'GR', 'RHOB', 'NPHI', 'DT']);
  expect(p.skippedCurves).toEqual([]);
  expect(p.ignoredSections).toEqual([]);
  expect(p.curves[0].nSamples).toBe(20);
});

test('the 1.2/2.0 path reports no 3.0 fields', () => {
  const p = parseLas(load('basic_20'));
  expect(p.delimiter).toBeUndefined();
  expect(p.skippedCurves).toBeUndefined();
  expect(p.curves[0].format).toBeUndefined();
});

test('splitDelimited: quotes protect the delimiter, empty fields survive for comma/tab, whitespace collapses for space', () => {
  expect(splitDelimited('1,"a,b",,3', 'comma')).toEqual(['1', 'a,b', '', '3']);
  expect(splitDelimited('1\t\t3', 'tab')).toEqual(['1', '', '3']);
  expect(splitDelimited('  1   "x y"  3 ', 'space')).toEqual(['1', 'x y', '3']);
  expect(splitDelimited('1,2,', 'comma')).toEqual(['1', '2', '']);
});

test('parseHeaderLine3 peels {FORMAT} and | association', () => {
  expect(parseHeaderLine3(' GR.GAPI 45 310 01 : GAMMA RAY {F} | Log_Data')).toMatchObject({
    name: 'GR', unit: 'GAPI', value: '45 310 01', descr: 'GAMMA RAY', format: 'F', association: 'Log_Data',
  });
  expect(parseHeaderLine3(' DATE. 2026-09-03 12:30:00 : LOG DATE {DT}')).toMatchObject({
    value: '2026-09-03 12:30:00', descr: 'LOG DATE', format: 'DT',
  });
});

const base = (dlm, data, defs = ' DEPT.M : DEPTH {F}\n GR.GAPI : GAMMA RAY {F}\n', wrap = 'NO') => `~Version
 VERS. 3.0 : V
 WRAP. ${wrap} : W
 DLM. ${dlm} : D
~Well
 STRT.M 1.0 : S
 STOP.M 2.0 : S
 STEP.M 1.0 : S
 NULL. -999.25 : N
~Log_Definition
${defs}~Log_Data
${data}`;

test('domain errors: ragged row, wrapped 3.0, unknown DLM, text depth, non-number in a declared numeric column', () => {
  expect(() => parseLas(base('COMMA', '1.0,50\n2.0\n'))).toThrow(/1 value but 2 curves are defined/);
  expect(() => parseLas(base('COMMA', '1.0,50\n', undefined, 'YES'))).toThrow(/must be unwrapped/);
  expect(() => parseLas(base('PIPE', '1.0,50\n'))).toThrow(/DLM "PIPE"/);
  expect(() => parseLas(base('COMMA', 'a,50\n', ' DEPT. : DEPTH {S}\n GR.GAPI : GAMMA RAY {F}\n'))).toThrow(/first column must be numeric depth/);
  expect(() => parseLas(base('COMMA', '1.0,abc\n'))).toThrow(/"abc" in column GR is not a number/);
});

test('an undeclared column with text values is skipped rather than fatal; LAS 4 is refused', () => {
  const p = parseLas(base('COMMA', '1.0,50,SAND\n2.0,60,SHALE\n', ' DEPT.M : DEPTH\n GR.GAPI : GAMMA RAY\n LITH. : LITHOLOGY\n'));
  expect(p.curves.map((c) => c.mnemonic)).toEqual(['DEPT', 'GR']);
  expect(p.skippedCurves[0]).toMatchObject({ mnemonic: 'LITH', reason: 'non-numeric values' });
  expect(() => parseLas(base('COMMA', '1.0,50\n').replace('VERS. 3.0', 'VERS. 4.0'))).toThrow(/LAS 4 is not supported/);
});
