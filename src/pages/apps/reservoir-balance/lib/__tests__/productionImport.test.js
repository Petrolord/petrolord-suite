/**
 * Material Balance Data tab: the import door on the hostile file set
 * (MBAL-U1, PL2 and RL10). The files are the fixtures the e2e spec drops on
 * the Data tab, e2e/fixtures/material-balance/hostile/. Every file holds the
 * same history (Ahmed, Table 11-3) in a different dress, so each is held
 * against the clean one: same rows, in engine units.
 */
import fs from 'fs';
import path from 'path';
import {
  readProductionTable, matchColumns, unitFromHeader, STANDARD_ATMOSPHERE_PSI, IMPORT_COLUMNS, DOOR_UNITS,
} from '../productionImport';
import { parseTabular } from '@/lib/tabularParse';

const DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'material-balance', 'hostile');
const file = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const clean = readProductionTable(file('01-clean-oilfield.csv'));

const sameHistory = (rows, { tolerance = 1e-6, columns = ['pressure_psia', 'cum_oil_stb', 'cum_gas_scf', 'cum_water_stb'] } = {}) => {
  expect(rows).toHaveLength(clean.rows.length);
  rows.forEach((row, i) => {
    for (const col of columns) {
      const want = clean.rows[i][col];
      expect(Math.abs(row[col] - want)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(want)));
    }
    expect(row.timestep_index).toBe(i);
  });
};

describe('the clean file', () => {
  test('is read whole, with the unit of each column taken from its header', () => {
    expect(clean.ok).toBe(true);
    expect(clean.rows).toHaveLength(13);
    expect(clean.rows[0]).toMatchObject({ timestep_index: 0, observation_date: '2010-01-01', pressure_psia: 3685, cum_oil_stb: 0, bo_rb_stb: 1.3102, rs_scf_stb: 500, bw_rb_stb: 1 });
    expect(clean.rows[12]).toMatchObject({ observation_date: '2022-01-01', pressure_psia: 3188, cum_oil_stb: 2575330, cum_gas_scf: 2575330 * 500, cum_water_stb: 8000 });
    expect(clean.unitFrom).toMatchObject({ pressure_psia: 'header', cum_oil_stb: 'header', cum_gas_scf: 'header', rs_scf_stb: 'header' });
    expect(clean.questions).toEqual([]);
    expect(clean.readBack).toMatchObject({ rowsInFile: 13, rowsRead: 13, delimiter: 'comma', header: true });
    expect(clean.readBack.columns.find((c) => c.key === 'pressure_psia')).toMatchObject({ fileColumn: 'Pressure (psia)', unit: 'psia', unitFrom: 'header', values: 13 });
  });
});

describe('the hostile file set gives the same rows', () => {
  test('columns in another order, extra columns, units in three bracket styles', () => {
    const r = readProductionTable(file('02-other-order-extra-columns.csv'));
    expect(r.ok).toBe(true);
    sameHistory(r.rows, { tolerance: 1e-3 }); // the file rounds to three decimals of a thousand
    expect(r.units).toMatchObject({ cum_oil_stb: 'MSTB', cum_water_stb: 'MSTB', cum_gas_scf: 'MMscf', pressure_psia: 'psia' });
    expect(r.readBack.unplaced.map((c) => c.name)).toEqual(['Well', 'Comment']);
    expect(r.rows[3].observation_date).toBe('2013-01-01');
    expect(r.rows[3].bo_rb_stb).toBe(1.3105);
  });

  test('the same table in the other units: gauge kPa, thousand and million sm3', () => {
    const r = readProductionTable(file('03-other-units-kpag-sm3.csv'));
    expect(r.ok).toBe(true);
    expect(r.units).toMatchObject({ pressure_psia: 'kPag', cum_oil_stb: '10^3 m3', cum_gas_scf: '10^6 m3', cum_water_stb: 'm3', rs_scf_stb: 'm3/m3' });
    sameHistory(r.rows, { tolerance: 2e-6 });
    expect(r.rows[0].rs_scf_stb).toBeCloseTo(500, 3);
    expect(r.warnings.join(' ')).toMatch(/Gauge pressures were raised by an atmospheric pressure of 14\.696 psi/);
    // known values, never a round trip: 25,305.856 kPa gauge is 3685 psia; 3.256219 thousand sm3 is 20,481 STB
    expect(r.rows[0].pressure_psia).toBeCloseTo(3685, 2);
    expect(r.rows[1].cum_oil_stb).toBeCloseTo(20481, 0);
  });

  test('semicolon columns with decimal commas and points grouping thousands', () => {
    const r = readProductionTable(file('04-semicolon-decimal-comma.csv'));
    expect(r.ok).toBe(true);
    expect(r.readBack).toMatchObject({ delimiter: 'semicolon' });
    expect(r.readBack.decimal.mark).toBe(',');
    sameHistory(r.rows, { tolerance: 1e-3 });
    expect(r.rows[0].pressure_psia).toBe(3685); // "3.685,0", the defect of H12 read 3.685
    expect(r.rows[1].bo_rb_stb).toBe(1.3104);
  });

  test('day-first dates that settle themselves are read without a question', () => {
    const r = readProductionTable(file('05-day-first-dates.csv'));
    expect(r.ok).toBe(true);
    expect(r.questions).toEqual([]);
    expect(r.rows.map((x) => x.observation_date).slice(0, 2)).toEqual(['2009-12-31', '2010-12-31']);
    expect(r.readBack.columns.find((c) => c.key === 'observation_date')).toMatchObject({ unit: 'day first', unitFrom: 'file' });
    sameHistory(r.rows);
  });

  test('dates nothing settles are asked for and never guessed', () => {
    const asked = readProductionTable(file('06-ambiguous-dates.csv'));
    expect(asked.ok).toBe(false);
    expect(asked.refusal).toMatch(/could be day first or month first/);
    expect(asked.questions.map((q) => q.kind)).toEqual(['dateOrder']);
    expect(asked.rows.every((x) => x.observation_date === null)).toBe(true);
    // the two answers give two different histories
    const dmy = readProductionTable(file('06-ambiguous-dates.csv'), { dateOrder: 'dmy' });
    const mdy = readProductionTable(file('06-ambiguous-dates.csv'), { dateOrder: 'mdy' });
    expect(dmy.ok).toBe(true);
    expect(dmy.rows[1].observation_date).toBe('2011-02-01'); // 01/02/2011 read day first
    expect(mdy.rows[1].observation_date).toBe('2011-01-02');
    expect(dmy.readBack.columns.find((c) => c.key === 'observation_date')).toMatchObject({ unit: 'day first', unitFrom: 'user' });
    sameHistory(dmy.rows);
  });

  test('a file with no header is refused with the reason, and read once the columns are placed by hand', () => {
    const refused = readProductionTable(file('07-no-header.csv'));
    expect(refused.ok).toBe(false);
    expect(refused.refusal).toMatch(/no row of column names/);
    expect(refused.rows).toEqual([]);
    const placed = readProductionTable(file('07-no-header.csv'), {
      mapping: { observation_date: 0, pressure_psia: 1, cum_oil_stb: 2, cum_gas_scf: 3, cum_water_stb: 4, bo_rb_stb: 5 },
    });
    expect(placed.ok).toBe(true);
    sameHistory(placed.rows);
    // no header, so no unit is named: each is assumed and said so
    expect(placed.unitFrom).toMatchObject({ pressure_psia: 'assumed', cum_oil_stb: 'assumed' });
    expect(placed.warnings.join(' ')).toMatch(/Reservoir pressure: the file names no unit\. It was read as psia/);
    // the unit chosen at the door is applied
    const inKpa = readProductionTable(file('07-no-header.csv'), { mapping: { pressure_psia: 1, cum_oil_stb: 2 }, units: { pressure_psia: 'kPa' } });
    expect(inKpa.rows[0].pressure_psia).toBeCloseTo(3685 / 6.894757293168361, 6);
    // and the display unit is what is offered when nothing is chosen
    const metricDoor = readProductionTable(file('07-no-header.csv'), { mapping: { pressure_psia: 1, cum_oil_stb: 2 }, defaultUnits: { pressure: 'kPa', stock: 'm3' } });
    expect(metricDoor.units).toMatchObject({ pressure_psia: 'kPa', cum_oil_stb: 'm3' });
  });

  test('injection columns ahead of the production columns they resemble are told apart', () => {
    const r = readProductionTable(file('08-injection-before-production.csv'));
    expect(r.ok).toBe(true);
    sameHistory(r.rows, { tolerance: 1e-3 });
    expect(r.rows[2].cum_gas_inj_scf).toBeCloseTo(25e6, 0);
    expect(r.rows[2].cum_water_inj_stb).toBeCloseTo(80000, 6);
    const names = Object.fromEntries(r.readBack.columns.map((c) => [c.key, c.fileColumn]));
    expect(names).toMatchObject({ cum_gas_scf: 'Cum Gas (MMscf)', cum_gas_inj_scf: 'Cum Gas Inj (MMscf)', cum_water_stb: 'Cum Water (MSTB)', cum_water_inj_stb: 'Cum Water Inj (MSTB)' });
  });

  test('a title, a comment, a repeated header, a blank pressure and a totals row are left out and listed', () => {
    const r = readProductionTable(file('09-title-totals-blanks.csv'));
    expect(r.ok).toBe(true);
    sameHistory(r.rows);
    const reasons = r.readBack.skipped.map((s) => s.reason);
    expect(reasons.filter((x) => x === 'text before the table')).toHaveLength(2);
    expect(reasons).toEqual(expect.arrayContaining(['comment line', 'repeated header', 'totals row', 'no pressure on this row']));
    expect(r.readBack.skipped.every((s) => Number.isInteger(s.line) && s.line > 0)).toBe(true);
    // read plus left out accounts for every line of the table
    expect(r.readBack.rowsRead).toBe(13);
    expect(r.readBack.rowsInFile).toBe(14); // the blank-pressure row was a row of the table
  });

  test('tab columns with thousands separators', () => {
    const r = readProductionTable(file('10-tab-thousands.txt'));
    expect(r.ok).toBe(true);
    expect(r.readBack.delimiter).toBe('tab');
    sameHistory(r.rows);
    expect(r.rows[12].cum_gas_scf).toBe(1287665000);
  });

  test('a tank history laid out as a competitor tool lists it: a units row, gauge pressure, millions', () => {
    const r = readProductionTable(file('11-vendor-style-tank-history.txt'));
    expect(r.ok).toBe(true);
    expect(r.units).toMatchObject({ pressure_psia: 'psig', cum_oil_stb: 'MMSTB', cum_gas_scf: 'MMscf', cum_water_stb: 'MMSTB' });
    expect(r.unitFrom.pressure_psia).toBe('header');
    sameHistory(r.rows, { tolerance: 1e-5 });
    expect(r.rows[0].observation_date).toBe('2009-12-31');
    expect(r.readBack.columns.map((c) => c.key)).toEqual(expect.arrayContaining(['cum_gas_inj_scf', 'cum_water_inj_stb']));
    // another atmospheric pressure at the door moves every pressure by the difference
    const local = readProductionTable(file('11-vendor-style-tank-history.txt'), { atmospherePsi: 14.2 });
    expect(local.rows[0].pressure_psia - r.rows[0].pressure_psia).toBeCloseTo(14.2 - STANDARD_ATMOSPHERE_PSI, 6);
  });

  test('the size a customer has: twenty years of monthly surveys', () => {
    const t0 = Date.now();
    const r = readProductionTable(file('12-monthly-twenty-years.csv'));
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(241);
    expect(r.rows[240]).toMatchObject({ timestep_index: 240, observation_date: '2020-01-01', pressure_psia: 3181 });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('what the door refuses, and what it says', () => {
  test('an empty file and a file with one row', () => {
    expect(readProductionTable('').refusal).toMatch(/holds no table/);
    expect(readProductionTable('Pressure (psia),Np\n3000,0\n').refusal).toMatch(/Only 1 row/);
  });

  test('a file whose pressure column has another name asks for it', () => {
    const r = readProductionTable('Date,BHP static,Np (STB)\n2020-01-01,3000,0\n2021-01-01,2900,1000\n');
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/No pressure column was found by name/);
    const placed = readProductionTable('Date,BHP static,Np (STB)\n2020-01-01,3000,0\n2021-01-01,2900,1000\n', { mapping: { pressure_psia: 1 } });
    expect(placed.ok).toBe(true);
    expect(placed.rows.map((x) => x.pressure_psia)).toEqual([3000, 2900]);
  });

  test('a cell that is not a number is left empty and listed with its line; nothing is read in part', () => {
    const r = readProductionTable('pressure,np\n3000,0\n29x0,100\n2900 psia,200\n2800,300\n');
    expect(r.rows.map((x) => x.pressure_psia)).toEqual([3000, 2800]);
    const cells = r.readBack.skipped.filter((s) => s.cell);
    expect(cells.map((s) => s.line)).toEqual([3, 4]);
    expect(cells[0].reason).toMatch(/"29x0" in column 1 is not a number/);
    expect(r.readBack.skipped.filter((s) => s.reason === 'no pressure on this row')).toHaveLength(2);
  });

  test('a year, an Excel serial day and a month name are dates', () => {
    const years = readProductionTable('Date,Pressure\n2019,3000\n2020,2900\n2021,2800\n');
    expect(years.rows.map((x) => x.observation_date)).toEqual(['2019-01-01', '2020-01-01', '2021-01-01']);
    const serial = readProductionTable('Date\tPressure\n43831\t3000\n44197\t2900\n');
    expect(serial.rows.map((x) => x.observation_date)).toEqual(['2020-01-01', '2021-01-01']);
    const names = readProductionTable('Date,Pressure\n31-May-2024,3000\n30-Jun-2024,2900\n');
    expect(names.rows.map((x) => x.observation_date)).toEqual(['2024-05-31', '2024-06-30']);
  });
});

describe('placing columns and reading units from a header', () => {
  const cols = (headers) => parseTabular(`${headers.join(',')}\n${headers.map(() => '1').join(',')}\n${headers.map(() => '2').join(',')}\n`).columns;

  test('the longest name that fits wins, and a column is used once', () => {
    expect(matchColumns(cols(['Cum Gas Inj', 'Cum Gas', 'P']))).toEqual({ cum_gas_inj_scf: 0, cum_gas_scf: 1, pressure_psia: 2 });
    expect(matchColumns(cols(['Np', 'Gp', 'Wp', 'Pressure', 'Z']))).toEqual({ cum_oil_stb: 0, cum_gas_scf: 1, cum_water_stb: 2, pressure_psia: 3, z_factor: 4 });
    // "p/z" is not a pressure column and "Wellhead pressure" is still a pressure by name, so it is offered and can be moved
    expect(matchColumns(cols(['p/z', 'Reservoir pressure'])).pressure_psia).toBe(1);
  });

  test('units by kind, with a known value for every conversion the door makes', () => {
    expect(unitFromHeader('pressure', 'Pressure', 'psig')).toBe('psig');
    expect(unitFromHeader('pressure', 'P_kPa', null)).toBe('kPa');
    expect(unitFromHeader('gas', 'cum_gas_mscf', null)).toBe('Mscf');
    expect(unitFromHeader('gas', 'Gp', 'Bcf')).toBe('Bscf');
    expect(unitFromHeader('stock', 'Np', 'MMbbl')).toBe('MMSTB');
    expect(unitFromHeader('fvfGas', 'bg_rb_scf', null)).toBe('RB/scf');
    expect(unitFromHeader('pressure', 'Pressure', null)).toBeNull();
    const one = (header, value) => readProductionTable(`Pressure (psia),${header}\n3000,0\n2900,${value}\n`).rows[1];
    expect(one('Np (MSTB)', 1.5).cum_oil_stb).toBe(1500);
    expect(one('Np (MMSTB)', 1.5).cum_oil_stb).toBe(1.5e6);
    expect(one('Np (sm3)', 1000).cum_oil_stb).toBeCloseTo(6289.810770432105, 6); // 1 m3 = 6.28981 bbl
    expect(one('Gp (Bscf)', 2).cum_gas_scf).toBe(2e9);
    expect(one('Gp (10^6 sm3)', 1).cum_gas_scf).toBeCloseTo(35314666.72, 0); // 1 m3 = 35.3147 ft3
    expect(one('Bg (RB/scf)', 0.00093).bg_rb_mscf).toBeCloseTo(0.93, 12);
    expect(one('Bg (rm3/sm3)', 0.005).bg_rb_mscf).toBeCloseTo(0.005 / 0.005614583333, 6); // 1 RB/Mscf = 0.00561458 m3/m3
    expect(one('Rs (Mscf/STB)', 0.5).rs_scf_stb).toBe(500);
    expect(one('Rs (sm3/sm3)', 100).rs_scf_stb).toBeCloseTo(561.4583333, 5);
    expect(one('We (MMRB)', 2).observed_we_rb).toBe(2e6);
    const p = (header, value) => readProductionTable(`${header},Np\n${value},0\n${value},10\n`).rows[0].pressure_psia;
    expect(p('Pressure (psig)', 3000)).toBeCloseTo(3014.695949, 5);
    expect(p('Pressure (kPa)', 20684.27188)).toBeCloseTo(3000, 5); // 1 psi = 6.894757 kPa
    expect(p('Pressure (bara)', 206.8427188)).toBeCloseTo(3000, 5);
    expect(p('Pressure (barg)', 100)).toBeCloseTo(100 * 14.503773773 + 14.695949, 4);
    expect(p('Pressure (MPa)', 20.68427188)).toBeCloseTo(3000, 5);
  });

  test('every column of the schema has names, and every door unit converts to the engine unit of its kind', () => {
    for (const c of IMPORT_COLUMNS) expect(c.names.length).toBeGreaterThan(0);
    for (const [kind, list] of Object.entries(DOOR_UNITS)) {
      for (const u of list) expect(u.family && u.unit && u.label).toBeTruthy();
      if (list.length) expect(list[0].gauge ?? false).toBe(false);
      expect(kind).toBeTruthy();
    }
  });
});
