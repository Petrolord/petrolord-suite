// Gates for the VRR per-well CSV importer (V2): alias claim-once, unit
// auto-scaling, date normalization/inference, honest reporting, and the
// template -> engine-fixture round trip.
import { parseVrrWellCSV, detectColumns, detectUnitScale, inferDateOrder, normalizeDate, vrrTemplateCSV } from '../csvImport';
import { buildFieldPeriods, analyzeLedger } from '@/utils/vrrCalculations';
import fixture from '../../../../packages/engines/test-data/waterflood/vrr-ledger-fixture.json';

describe('detectColumns', () => {
  it('claims injection columns before their production twins', () => {
    const map = detectColumns(['Date', 'Well', 'Water_Inj (bbl)', 'Water (bbl)', 'Gas_Inj (Mscf)', 'Gas (Mscf)', 'Oil (stb)']);
    expect(map.winj_stb).toBe('Water_Inj (bbl)');
    expect(map.water_stb).toBe('Water (bbl)');
    expect(map.ginj_mscf).toBe('Gas_Inj (Mscf)');
    expect(map.gas_mscf).toBe('Gas (Mscf)');
    expect(map.oil_stb).toBe('Oil (stb)');
  });

  it('maps WDS-format headers (inj_bbl alias)', () => {
    const map = detectColumns(['date', 'well', 'oil_bbl', 'water_bbl', 'gas_mcf', 'inj_bbl']);
    expect(map.winj_stb).toBe('inj_bbl');
    expect(map.oil_stb).toBe('oil_bbl');
    expect(map.water_stb).toBe('water_bbl');
    expect(map.gas_mscf).toBe('gas_mcf');
  });
});

describe('detectUnitScale', () => {
  it('scales gas headers to Mscf', () => {
    expect(detectUnitScale('Gas (Mscf)', 'gas_mscf')).toBe(1);
    expect(detectUnitScale('gas_mcf', 'gas_mscf')).toBe(1);
    expect(detectUnitScale('Gas (MMscf)', 'gas_mscf')).toBe(1000);
    expect(detectUnitScale('Gas (Bscf)', 'gas_mscf')).toBe(1e6);
    expect(detectUnitScale('gas_scf', 'gas_mscf')).toBe(0.001);
  });

  it('scales liquid headers to bbl', () => {
    expect(detectUnitScale('Oil (stb)', 'oil_stb')).toBe(1);
    expect(detectUnitScale('Oil (Mstb)', 'oil_stb')).toBe(1000);
    expect(detectUnitScale('water_inj_mbbl', 'winj_stb')).toBe(1000);
    expect(detectUnitScale('Oil (MMstb)', 'oil_stb')).toBe(1e6);
  });
});

describe('date handling', () => {
  it('normalizes ISO, slash and month-only dates', () => {
    expect(normalizeDate('2025-01-31')).toBe('2025-01-31');
    expect(normalizeDate('2025-1-5')).toBe('2025-01-05');
    expect(normalizeDate('2025-01')).toBe('2025-01');
    expect(normalizeDate('2025/01/31')).toBe('2025-01-31');
    expect(normalizeDate('31/01/2025', 'DMY')).toBe('2025-01-31');
    expect(normalizeDate('01/31/2025', 'MDY')).toBe('2025-01-31');
    expect(normalizeDate('garbage')).toBe(null);
    expect(normalizeDate('2025-13-01')).toBe(null);
  });

  it('infers day-first vs month-first from the data', () => {
    expect(inferDateOrder(['15/01/2025', '16/01/2025']).order).toBe('DMY');
    expect(inferDateOrder(['01/15/2025', '01/16/2025']).order).toBe('MDY');
    expect(inferDateOrder(['05/01/2025'])).toEqual({ order: 'DMY', ambiguous: true });
  });
});

describe('parseVrrWellCSV', () => {
  it('parses a real-world-shaped file with aliases and units', () => {
    const csv = [
      'Date,Well Name,Oil (stb),Water (bbl),Gas (MMscf),Water_Inj (Mbbl)',
      '2025-01-01,P-1,1000,200,1.5,2',
      '2025-01-01,I-1,0,0,0,10',
    ].join('\n');
    const { rows, report } = parseVrrWellCSV(csv);
    expect(report.imported).toBe(2);
    expect(rows[0]).toEqual({ date: '2025-01-01', well: 'P-1', oil_stb: 1000, water_stb: 200, gas_mscf: 1500, winj_stb: 2000, ginj_mscf: 0 });
    expect(rows[1].winj_stb).toBe(10000);
    expect(report.warnings.some((w) => /x1000/.test(w))).toBe(true);
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
