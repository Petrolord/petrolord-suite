// EOR-U2-006: the range of the field projects of each method, as printed in
// the "Range of Current Projects" column of Taber, Martin and Seright (1997)
// Part 2, Tables 1 to 7 (pp. 200 to 203), read from the page images.
// Context only: the range is never scored.
import { PROJECT_RANGES, EOR_METHODS, screenAllMethods, engineInputOf } from '@/utils/eorScreeningCalculations';
import { projectRangeText } from '../format';
import { buildEorReportModel } from '../reportModel';
import { fieldCase, sampleCase } from './eorTestKit';

// transcribed independently from the page images
const PRINTED = {
  nitrogen: { table: 1, page: 200, gravity: [38, 54], viscosity: [0.07, 0.3], oilSat: [59, 80], depth: [10000, 18500] },
  hydrocarbon: { table: 2, page: 200, gravity: [24, 54], viscosity: [0.04, 2.3], oilSat: [30, 98], depth: [4040, 15900] },
  co2: { table: 3, page: 201, gravity: [27, 44], viscosity: [0.3, 6], oilSat: [15, 70] },
  polymer: { table: 5, page: 202, gravity: [14, 43], viscosity: [1, 80], oilSat: [50, 92], permeability: [10, 15000], depth: [1300, 9600], temperature: [80, 185] },
  combustion: { table: 6, page: 203, gravity: [10, 40], viscosity: [6, 5000], oilSat: [62, 94], permeability: [85, 4000], depth: [400, 11300], temperature: [100, null] },
  steam: { table: 7, page: 203, gravity: [8, 27], viscosity: [10, 137000], oilSat: [35, 90], permeability: [63, 10000], depth: [150, 4500], temperature: [60, 280] },
};

describe('range of current projects (Part 2, Tables 1 to 7)', () => {
  it('holds every printed range, with its table and page', () => {
    for (const [id, p] of Object.entries(PRINTED)) {
      const r = PROJECT_RANGES[id];
      expect(r.source).toBe(`Part 2, Table ${p.table} (p. ${p.page}), Range of Current Projects`);
      for (const [k, v] of Object.entries(p)) {
        if (k === 'table' || k === 'page') continue;
        expect([id, k, r.criteria[k].min, r.criteria[k].max]).toEqual([id, k, v[0], v[1]]);
      }
      expect(Object.keys(r.criteria).sort()).toEqual(Object.keys(p).filter((k) => k !== 'table' && k !== 'page').sort());
    }
  });
  it('records what the paper does not print: no range for the chemical floods or immiscible gas; the combustion temperature cut short', () => {
    expect(PROJECT_RANGES.chemical).toBeUndefined();
    expect(PROJECT_RANGES.immiscible).toBeUndefined();
    expect(PROJECT_RANGES.combustion.criteria.temperature.note).toMatch(/printed "100 to 22"/);
    expect(EOR_METHODS.every((m) => m.id in PROJECT_RANGES || ['chemical', 'immiscible'].includes(m.id))).toBe(true);
  });
  it('says whether this reservoir sits inside the range, in the display units', () => {
    const v = { key: 'depth', kind: 'depth', actual: 5200 };
    expect(projectRangeText('polymer', v, 'oilfield')).toBe('1,300 to 9,600 ft (inside)');
    expect(projectRangeText('nitrogen', v, 'oilfield')).toBe('10,000 to 18,500 ft (outside)');
    expect(projectRangeText('nitrogen', v, 'si')).toBe('3,048 to 5,639 m (outside)');
    expect(projectRangeText('combustion', { key: 'temperature', kind: 'temperature', actual: 150 }, 'oilfield')).toBe('from 100 degF (printed "100 to 22")');
    expect(projectRangeText('co2', { key: 'depth', kind: 'depth', actual: 5200 }, 'oilfield')).toBeNull();
    expect(projectRangeText('co2', { key: 'gravity', kind: 'api', actual: null }, 'oilfield')).toBe('27 to 44 degAPI');
  });
  it('is never scored: the outcomes are the same, and the report prints the range beside the average', () => {
    const inputs = sampleCase();
    const m = buildEorReportModel(inputs);
    expect(m.ranking.rows.map((r) => r[2])).toEqual(screenAllMethods(engineInputOf(inputs.form)).map((r) => ({ qualified: 'Qualified', marginal: 'Marginal', 'screened out': 'Screened out', 'not screened': 'Not screened' }[r.outcome])));
    const co2 = m.methods.find((x) => x.id === 'co2');
    const col = co2.head.indexOf('Range of current projects');
    expect(col).toBeGreaterThan(0);
    expect(co2.rows.find((r) => r[0] === 'Oil gravity')[col]).toBe('27 to 44 degAPI (inside)');
    expect(co2.note).toMatch(/Part 2, Table 3 \(p\. 201\)/);
    const f = buildEorReportModel(fieldCase());
    expect(f.methods.find((x) => x.id === 'chemical').note).toMatch(/prints no range of current projects/);
  });
});
