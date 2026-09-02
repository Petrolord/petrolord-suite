// PS2: deliverable assembly on the analytic type well — the curves
// CSV, the zone CSV against zoneSummary, and the LAS export
// round-tripped through the validated parser (the writer's contract).

import fs from 'fs';
import path from 'path';
import { curvesCsv, zonesCsv, buildLas, exportBaseName, exportColumns } from '../services/petroExport';
import { methodLines } from '../services/petroReport';
import { computeWell, zoneSummary, DEFAULT_PARAMS } from '../engine/pipeline';
import { parseLas } from '../../WellDataManager/engine/lasParse';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));

const curves = {
  DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'),
  NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT'),
};
const inventory = Object.keys(curves).map((key) => ({
  key,
  log: { id: `log-${key}`, mnemonic: key, unit: key === 'DEPT' ? 'M' : '', description: '' },
}));
const wellData = { wellId: 'w1', curves, inventory };
const { outputs } = computeWell(curves, DEFAULT_PARAMS);

test('curves CSV: header, row count, nulls as empty cells', () => {
  const csv = curvesCsv(wellData, outputs);
  const lines = csv.trim().split('\n');
  expect(lines[0]).toContain('DEPT (M)');
  expect(lines[0]).toContain('VSH (V/V)');
  expect(lines[0]).toContain('PAY (FLAG)');
  expect(lines).toHaveLength(curves.DEPT.length + 1);
  // the type well has deliberate nulls -> some row carries an empty cell
  expect(lines.slice(1).some((l) => l.includes(',,') || l.endsWith(','))).toBe(true);
  // every data row has the full column count
  const nCols = lines[0].split(',').length;
  for (const l of lines.slice(1)) expect(l.split(',')).toHaveLength(nCols);
});

test('zone CSV matches zoneSummary numbers', () => {
  const zone = { id: 'z1', name: 'SAND A', top_md_m: 2010, base_md_m: 2040 };
  const s = zoneSummary(curves, outputs, DEFAULT_PARAMS, zone);
  const csv = zonesCsv([zone], { z1: s });
  const lines = csv.trim().split('\n');
  expect(lines).toHaveLength(2);
  const cells = lines[1].split(',');
  expect(cells[0]).toBe('"SAND A"');
  expect(Number(cells[4])).toBeCloseTo(s.net_m, 6);
  expect(Number(cells[6])).toBeCloseTo(s.phi_avg, 6);
});

test('LAS export round-trips through parseLas with parameters preserved', () => {
  const text = buildLas(wellData, outputs, DEFAULT_PARAMS, { wellName: 'KETA TYPE-1', projectId: 'proj-1' });
  const parsed = parseLas(text);
  expect(parsed.version).toBe(2);
  expect(parsed.well.WELL.value).toBe('KETA TYPE-1');
  const mnems = parsed.curves.map((c) => c.mnemonic);
  expect(mnems[0]).toBe('DEPT');
  for (const key of ['GR', 'RHOB', 'NPHI', 'DT', 'RT', 'VSH', 'PHIE', 'SW', 'PAY']) {
    expect(mnems).toContain(key);
  }
  // provenance parameters in ~P
  expect(parsed.params.GRCLEAN.value).toBe(DEFAULT_PARAMS.grClean);
  expect(parsed.params.RW.value).toBe(DEFAULT_PARAMS.rw);
  expect(parsed.params.ENGINE.value).toBe('petrophysics-studio');
  expect(parsed.params.PROJECT.value).toBe('proj-1');
  // samples reproduce the computed outputs bit-for-bit after f32 cast
  const sw = parsed.curves[mnems.indexOf('SW')].data;
  for (let i = 0; i < sw.length; i++) {
    const want = Math.fround(outputs.SW[i]);
    if (Number.isNaN(want)) expect(Number.isNaN(sw[i])).toBe(true);
    else expect(sw[i]).toBe(want);
  }
});

test('export columns skip unmapped inputs; base name is filesystem-safe', () => {
  const partial = {
    wellId: 'w2',
    curves: { DEPT: curves.DEPT, GR: curves.GR },
    inventory: [
      { key: 'DEPT', log: { id: 'a', unit: 'M' } },
      { key: 'GR', log: { id: 'b', unit: 'API' } },
      { key: 'RT', log: null },
    ],
  };
  const cols = exportColumns(partial, {});
  expect(cols.map((c) => c.key)).toEqual(['DEPT', 'GR']);
  expect(exportBaseName('KETA TYPE-1 / A')).toBe('KETA_TYPE-1_A');
});

test('method lines cite the applied models', () => {
  const lines = methodLines(DEFAULT_PARAMS).join(' ');
  expect(lines).toContain('Larionov (1969)');
  expect(lines).toContain('Archie (1942)');
  const sonic = methodLines({ ...DEFAULT_PARAMS, phiSource: 'sonic', sonicMethod: 'rhg' }).join(' ');
  expect(sonic).toContain('Raymer, Hunt & Gardner');
});
