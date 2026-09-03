// PS2: deliverable assembly on the analytic type well — the curves
// CSV, the zone CSV against zoneSummary, and the LAS export
// round-tripped through the validated parser (the writer's contract).

import fs from 'fs';
import path from 'path';
import { curvesCsv, zonesCsv, buildLas, exportBaseName, exportColumns, depthColumns } from '../services/petroExport';
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

// ---- PT2: depth unit and MD / TVD / TVDSS columns ----------------------------
const bhWell = {
  kb_m: 30,
  td_md_m: 2100,
  deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1500, inc: 0, azi: 90 }, { md: 1800, inc: 30, azi: 90 }, { md: 2100, inc: 30, azi: 90 }],
};

test('defaults reproduce the legacy metres output byte for byte', () => {
  expect(curvesCsv(wellData, outputs, null)).toBe(curvesCsv(wellData, outputs));
  expect(buildLas(wellData, outputs, DEFAULT_PARAMS, { wellName: 'W', projectId: 'p' }))
    .toBe(buildLas(wellData, outputs, DEFAULT_PARAMS, { wellName: 'W', projectId: 'p', well: null }));
});

test('curves CSV in feet carries DEPT, TVD and TVDSS in F, scaled by 1/0.3048', () => {
  const text = curvesCsv(wellData, outputs, { well: bhWell, depthUnit: 'ft', columns: ['md', 'tvd', 'tvdss'], primary: 'md' });
  const lines = text.trim().split('\n');
  expect(lines[0].split(',').slice(0, 3)).toEqual(['DEPT (F)', 'TVD (F)', 'TVDSS (F)']);
  const first = lines[1].split(',').map(Number);
  expect(first[0]).toBeCloseTo(curves.DEPT[0] / 0.3048, 3);
  // 2000 m MD is 200 m into the 30 deg hold: TVD = 1500 + R sin30 + 200 cos30, TVDSS = TVD - 30
  const R = 300 / (Math.PI / 6);
  const tvd2000 = 1500 + R * 0.5 + 200 * Math.cos(Math.PI / 6);
  expect(first[1]).toBeCloseTo(tvd2000 / 0.3048, 2);
  expect(first[2]).toBeCloseTo((tvd2000 - 30) / 0.3048, 2);
});

test('TVD below the kick-off follows the survey; a vertical well notes the assumption', () => {
  const { ordered, notes } = depthColumns(Float64Array.from([1000, 2100]), { well: bhWell, depthUnit: 'm', columns: ['md', 'tvd'], primary: 'md' });
  expect(ordered.map((c) => c.key)).toEqual(['DEPT', 'TVD']);
  expect(ordered[1].data[0]).toBeCloseTo(1000, 9);
  // 300 m build to 30 deg then 300 m hold: TVD(2100) = 1500 + R sin30 + 300 cos30, R = 300 / (pi/6)
  const R = 300 / (Math.PI / 6);
  expect(ordered[1].data[1]).toBeCloseTo(1500 + R * 0.5 + 300 * Math.cos(Math.PI / 6), 6);
  expect(notes.join(' ')).not.toMatch(/vertical/);
  const v = depthColumns(Float64Array.from([1000]), { well: { kb_m: 0, deviation: [] }, columns: ['md', 'tvd'] });
  expect(v.notes.join(' ')).toMatch(/vertical/);
});

test('LAS in feet round-trips: unit F, DEPT = fround(md / 0.3048), TVDSS present, EKB and DEPTREF in ~P', () => {
  const text = buildLas(wellData, outputs, DEFAULT_PARAMS, { wellName: 'W', projectId: 'p', well: bhWell, depthUnit: 'ft', columns: ['md', 'tvdss'], primary: 'md' });
  const parsed = parseLas(text);
  const mnems = parsed.curves.map((c) => c.mnemonic);
  expect(mnems.slice(0, 2)).toEqual(['DEPT', 'TVDSS']);
  expect(parsed.depthUnit).toBe('F');
  expect(parsed.curves[0].data[0]).toBe(Math.fround(curves.DEPT[0] / 0.3048));
  expect(parsed.params.DEPTREF.value).toBe('MD');
  expect(parsed.params.EKB.value).toBeCloseTo(30 / 0.3048, 3);
  expect(parsed.params.DEPTHSRC.value).toMatch(/deviation survey/);
});

test('LAS with TVD primary writes DEPT = TVD and MD as a curve', () => {
  const text = buildLas(wellData, outputs, DEFAULT_PARAMS, { wellName: 'W', projectId: 'p', well: bhWell, depthUnit: 'm', columns: ['md', 'tvd'], primary: 'tvd' });
  const parsed = parseLas(text);
  const mnems = parsed.curves.map((c) => c.mnemonic);
  expect(mnems.slice(0, 2)).toEqual(['DEPT', 'MD']);
  expect(parsed.params.DEPTREF.value).toBe('TVD');
  expect(parsed.curves[1].data[0]).toBe(Math.fround(curves.DEPT[0]));
});

test('zone CSV with TVD/TVDSS columns matches the depth frame and converts thicknesses', () => {
  const zones = [{ id: 'z1', name: 'Deep', top_md_m: 1900, base_md_m: 2000 }];
  const summaries = { z1: zoneSummary(curves, outputs, 1900, 2000, DEFAULT_PARAMS) };
  const text = zonesCsv(zones, summaries, { well: bhWell, depthUnit: 'ft', columns: ['md', 'tvdss'] });
  const [header, row] = text.trim().split('\n');
  expect(header).toBe('zone,top_md_ft,base_md_ft,top_tvdss_ft,base_tvdss_ft,gross_ft,net_ft,ntg,phi_avg,vsh_avg,sw_avg');
  const cells = row.split(',').map((c, i) => (i ? Number(c) : c));
  expect(cells[1]).toBeCloseTo(1900 / 0.3048, 3);
  const R = 300 / (Math.PI / 6);
  const tvd1900 = 1500 + R * 0.5 + 100 * Math.cos(Math.PI / 6); // 100 m into the 30 deg hold
  expect(cells[3]).toBeCloseTo((tvd1900 - 30) / 0.3048, 2); // CSV keeps 7 significant digits
  expect(cells[5]).toBeCloseTo(summaries.z1.gross_m / 0.3048, 2);
});
