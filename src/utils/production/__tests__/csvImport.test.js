// Gates for the P1 production spine importers: alias claim-once, unit
// auto-scaling, date handling (incl. monthly first-of-month expansion),
// hours-on clamping, and honest reporting — nothing silent.
import {
  parseDailyProductionCSV,
  parseWellTestCSV,
  claimColumns,
  detectScale,
  DAILY_ALIASES,
  WELL_TEST_ALIASES,
  dailyProductionTemplateCSV,
  wellTestTemplateCSV,
} from '../csvImport';

describe('claimColumns', () => {
  it('claims injection columns before their production twins (daily aliases)', () => {
    const map = claimColumns(DAILY_ALIASES, ['Date', 'Well', 'Water_Inj (bbl)', 'Water (bbl)', 'Gas_Inj (Mscf)', 'Gas (Mscf)', 'Oil (stb)']);
    expect(map.winj_stb).toBe('Water_Inj (bbl)');
    expect(map.water_stb).toBe('Water (bbl)');
    expect(map.ginj_mscf).toBe('Gas_Inj (Mscf)');
    expect(map.gas_mscf).toBe('Gas (Mscf)');
    expect(map.oil_stb).toBe('Oil (stb)');
  });

  it('claims hours_on before volumes so "Hours" never lands on a rate', () => {
    const map = claimColumns(DAILY_ALIASES, ['date', 'well', 'oil_bbl', 'Hours On']);
    expect(map.hours_on).toBe('Hours On');
    expect(map.oil_stb).toBe('oil_bbl');
  });

  it('claims THP and choke before rates (test aliases)', () => {
    const map = claimColumns(WELL_TEST_ALIASES, ['Test Date', 'Well', 'THP (psia)', 'Choke (/64)', 'Oil Rate (stb/d)', 'Gas Rate (Mscf/d)']);
    expect(map.thp_psia).toBe('THP (psia)');
    expect(map.choke_64ths).toBe('Choke (/64)');
    expect(map.oil_rate_stbd).toBe('Oil Rate (stb/d)');
    expect(map.gas_rate_mscfd).toBe('Gas Rate (Mscf/d)');
  });
});

describe('detectScale', () => {
  it('scales gas headers to Mscf', () => {
    expect(detectScale('Gas (Mscf)', 'gas')).toBe(1);
    expect(detectScale('Gas (MMscf)', 'gas')).toBe(1000);
    expect(detectScale('Gas (Bscf)', 'gas')).toBe(1e6);
    expect(detectScale('gas_scf', 'gas')).toBe(0.001);
  });

  it('scales liquid headers to bbl', () => {
    expect(detectScale('Oil (stb)', 'liquid')).toBe(1);
    expect(detectScale('Oil (Mstb)', 'liquid')).toBe(1000);
    expect(detectScale('Oil (MMstb)', 'liquid')).toBe(1e6);
  });
});

describe('parseDailyProductionCSV', () => {
  it('parses a real-world-shaped file with aliases, units and hours', () => {
    const csv = [
      'Date,Well Name,Oil (stb),Water (bbl),Gas (MMscf),Water_Inj (Mbbl),Hours On',
      '2025-01-01,P-1,1000,200,1.5,0,24',
      '2025-01-01,I-1,0,0,0,10,12',
    ].join('\n');
    const { rows, report } = parseDailyProductionCSV(csv);
    expect(report.imported).toBe(2);
    expect(rows[0]).toEqual({
      date: '2025-01-01', well: 'P-1',
      oil_stb: 1000, water_stb: 200, gas_mscf: 1500, winj_stb: 0, ginj_mscf: 0,
      hours_on: 24,
    });
    expect(rows[1].winj_stb).toBe(10000);
    expect(rows[1].hours_on).toBe(12);
    expect(report.warnings.some((w) => /x1000/.test(w))).toBe(true);
  });

  it('expands monthly dates to the first of the month with a warning', () => {
    const csv = [
      'month,well,oil_stb',
      '2025-01,P-1,30000',
      '2025-02,P-1,28000',
    ].join('\n');
    const { rows, report } = parseDailyProductionCSV(csv);
    expect(rows.map((r) => r.date)).toEqual(['2025-01-01', '2025-02-01']);
    expect(report.warnings.some((w) => /first of the month/.test(w))).toBe(true);
  });

  it('clamps hours above 24 and zeroes negatives, all reported', () => {
    const csv = [
      'date,well,oil_stb,hours_on',
      '2025-01-01,P-1,-50,30',
      '2025-01-02,P-1,100,-4',
    ].join('\n');
    const { rows, report } = parseDailyProductionCSV(csv);
    expect(rows[0].oil_stb).toBe(0);
    expect(rows[0].hours_on).toBe(24);
    expect(rows[1].hours_on).toBe(null);
    expect(report.negativesZeroed).toBe(1);
    expect(report.hoursClamped).toBe(1);
    expect(report.warnings.some((w) => /clamped/.test(w))).toBe(true);
    expect(report.warnings.some((w) => /zeroed/.test(w))).toBe(true);
  });

  it('accounts for every dropped row - nothing silent', () => {
    const csv = [
      'date,well,oil_stb',
      'not-a-date,P-1,100',
      '2025-01-01,,100',
      '2025-01-01,P-1,100',
    ].join('\n');
    const { rows, report } = parseDailyProductionCSV(csv);
    expect(rows).toHaveLength(1);
    expect(report.totalRows).toBe(3);
    expect(report.skipped).toHaveLength(2);
    expect(report.skipped[0].reason).toMatch(/Unparseable date/);
    expect(report.skipped[1].reason).toMatch(/Blank well/);
  });

  it('refuses files with no date or no volume columns, with guidance', () => {
    expect(parseDailyProductionCSV('well,oil_stb\nP-1,100').report.warnings[0]).toMatch(/date column/);
    expect(parseDailyProductionCSV('date,well\n2025-01-01,P-1').report.warnings[0]).toMatch(/volume columns/);
  });

  it('round-trips its own template', () => {
    const { rows, report } = parseDailyProductionCSV(dailyProductionTemplateCSV());
    expect(report.skipped).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(rows).toHaveLength(6);
    expect(rows[4]).toEqual({
      date: '2025-01-02', well: 'P-2',
      oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: 0,
      hours_on: 0,
    });
  });
});

describe('parseWellTestCSV', () => {
  it('parses tests with aliases and unit scaling', () => {
    const csv = [
      'Test Date,Well,Duration (hrs),BOPD,BWPD,Gas Rate (MMscfd),THP,Choke',
      '15/01/2025,P-1,6,1250,310,0.94,320,32',
    ].join('\n');
    const { tests, report } = parseWellTestCSV(csv);
    expect(report.imported).toBe(1);
    expect(tests[0]).toEqual({
      date: '2025-01-15', well: 'P-1', duration_hours: 6,
      oil_rate_stbd: 1250, water_rate_stbd: 310, gas_rate_mscfd: 940,
      thp_psia: 320, choke_64ths: 32,
    });
  });

  it('skips rows with no usable rate and zeroes negatives, reported', () => {
    const csv = [
      'test_date,well,oil_rate,gas_rate',
      '2025-01-01,P-1,,',
      '2025-01-02,P-2,-100,500',
    ].join('\n');
    const { tests, report } = parseWellTestCSV(csv);
    expect(tests).toHaveLength(1);
    expect(tests[0].oil_rate_stbd).toBe(0);
    expect(tests[0].gas_rate_mscfd).toBe(500);
    expect(report.skipped[0].reason).toMatch(/No usable rate/);
    expect(report.negativesZeroed).toBe(1);
  });

  it('requires date, well and at least one rate column', () => {
    expect(parseWellTestCSV('date,oil_rate\n2025-01-01,100').report.warnings[0]).toMatch(/well column/);
    expect(parseWellTestCSV('date,well,thp\n2025-01-01,P-1,300').report.warnings[0]).toMatch(/rate columns/);
  });

  it('round-trips its own template', () => {
    const { tests, report } = parseWellTestCSV(wellTestTemplateCSV());
    expect(report.skipped).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(tests).toHaveLength(3);
    expect(tests[2].well).toBe('P-2');
    expect(tests[2].choke_64ths).toBe(24);
  });
});
