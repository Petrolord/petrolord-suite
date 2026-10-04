// Gates for the VRR per-well CSV importer (V2, moved onto the shared typed
// reader in VRR-U1): units from headers, honest reporting, and the template
// -> engine-fixture round trip. Column placement, dates, decimals and the
// hostile file set are in vrrImportDoor.test.js.
import { parseVrrWellCSV, vrrTemplateCSV } from '../csvImport';
import { buildFieldPeriods, analyzeLedger } from '@/utils/vrrCalculations';
import fixture from '../../../../packages/engines/test-data/waterflood/vrr-ledger-fixture.json';

describe('parseVrrWellCSV', () => {
  it('parses a real-world-shaped file with aliases and units', () => {
    const csv = [
      'Date,Well Name,Oil (stb),Water (bbl),Gas (MMscf),Water_Inj (Mbbl)',
      '2025-01-01,P-1,1000,200,1.5,2',
      '2025-01-01,I-1,0,0,0,10',
    ].join('\n');
    const { rows, report } = parseVrrWellCSV(csv);
    expect(report.imported).toBe(2);
    expect(rows.find((r) => r.well === 'P-1')).toEqual({ date: '2025-01-01', well: 'P-1', oil_stb: 1000, water_stb: 200, gas_mscf: 1500, winj_stb: 2000, ginj_mscf: 0 });
    expect(rows.find((r) => r.well === 'I-1').winj_stb).toBe(10000);
    expect(report.warnings.some((w) => /converted to Mscf/.test(w))).toBe(true);
  });

  it('accounts for every dropped or adjusted row - nothing silent', () => {
    const csv = [
      'date,well,oil_stb',
      'not-a-date,P-1,100',
      '2025-01-01,,100',
      '2025-01-01,P-1,-50',
      '2025-01-01,P-2,80',
    ].join('\n');
    const { rows, report } = parseVrrWellCSV(csv);
    expect(report.totalRows).toBe(4);
    expect(report.imported).toBe(2);
    expect(report.skipped).toHaveLength(2);
    expect(report.skipped[0].reason).toMatch(/date/i);
    expect(report.skipped[1].reason).toMatch(/well/i);
    expect(report.negativesZeroed).toBe(1);
    expect(rows.find((r) => r.well === 'P-1').oil_stb).toBe(0);
  });

  it('imports well-less files as one FIELD well with a warning', () => {
    const csv = ['month,np,wp,wi', '2025-01,1000,100,1200'].join('\n');
    const { rows, report } = parseVrrWellCSV(csv);
    expect(rows[0].well).toBe('FIELD');
    expect(rows[0].date).toBe('2025-01');
    expect(rows[0].winj_stb).toBe(1200);
    expect(report.warnings.some((w) => /FIELD/.test(w))).toBe(true);
  });

  it('refuses files with no recognizable date or volume columns, with reasons', () => {
    expect(parseVrrWellCSV('a,b\n1,2').report.warnings[0]).toMatch(/date column/i);
    expect(parseVrrWellCSV('date,comment\n2025-01-01,hello').report.warnings[0]).toMatch(/volume columns/i);
  });

  it('template round trip reproduces the engine fixture oracle exactly', () => {
    const { rows, report } = parseVrrWellCSV(vrrTemplateCSV());
    expect(report.imported).toBe(12);
    expect(report.skipped).toHaveLength(0);
    expect(buildFieldPeriods(rows)).toEqual(fixture.oracle.periods);
    const r = analyzeLedger(rows, fixture.fvf, {});
    expect(r.series[2].cumulativeVRR).toBeCloseTo(fixture.oracle.cumulativeVRR_last, 9);
    expect(r.injectors.sort()).toEqual(fixture.oracle.injectors);
  });
});
