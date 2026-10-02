// H12 (Reservoir gap matrix): the Material Balance data hub read a decimal
// comma as a thousands separator, so a European export (semicolon columns,
// decimal commas) gave 325075 psia for 3250,75 and a Bo of 1245. The number
// reading now comes from the shared table reader (src/lib/tabularFile.js).
import { readProductionCsv } from '../DataHub';

describe('Material Balance data hub: decimal commas (H12)', () => {
  test('semicolon columns with decimal commas', () => {
    const text = [
      'Date;Pressure (psia);Np (MSTB);Gp (MMscf);Bo (RB/STB);Bg (RB/Mscf)',
      '2020-01-01;3250,75;0;0;1,245;0,8125',
      '2020-07-01;3100,5;120,5;96,4;1,2385;0,8502',
      '2021-01-01;2950,25;1.240,75;992,6;1,2311;0,8947',
    ].join('\r\n');
    const out = readProductionCsv(text);
    expect(out.parseErrors).toEqual([]);
    expect(out.rows).toHaveLength(3);
    expect(out.rows.map((r) => r.pressure_psia)).toEqual([3250.75, 3100.5, 2950.25]);
    expect(out.rows.map((r) => r.bo_rb_stb)).toEqual([1.245, 1.2385, 1.2311]);
    expect(out.rows.map((r) => r.bg_rb_mscf)).toEqual([0.8125, 0.8502, 0.8947]);
    expect(out.rows[1].cum_oil_stb).toBeCloseTo(120500, 6);
    expect(out.rows[2].cum_oil_stb).toBeCloseTo(1240750, 6);          // 1.240,75 MSTB: the point groups thousands
    expect(out.rows[2].cum_gas_scf).toBeCloseTo(992.6e6, 3);
    expect(out.rows.map((r) => r.observation_date)).toEqual(['2020-01-01', '2020-07-01', '2021-01-01']);
    // the defect: 3250,75 psia read as 325075
    expect(out.rows[0].pressure_psia).toBeLessThan(20000);
  });
  test('tab columns with thousands separators still read as thousands', () => {
    const text = 'Pressure (psia)\tNp (STB)\tBo\n3,250.5\t0\t1.245\n3,100.0\t1,234,567\t1.238\n';
    const out = readProductionCsv(text);
    expect(out.rows.map((r) => r.pressure_psia)).toEqual([3250.5, 3100]);
    expect(out.rows[1].cum_oil_stb).toBe(1234567);
    expect(out.warnings.join(' ')).not.toMatch(/thousands or for decimals/);
  });
  test('quoted thousands in a comma file, as before', () => {
    const out = readProductionCsv('pressure,np\n"3,250.5",0\n"3,100",1200\n');
    expect(out.rows.map((r) => r.pressure_psia)).toEqual([3250.5, 3100]);
  });
  test('a file that cannot settle the mark says so in a warning', () => {
    const out = readProductionCsv('pressure;np\n3,250;0\n3,100;1,200\n');
    expect(out.rows.map((r) => r.pressure_psia)).toEqual([3.25, 3.1]);       // a semicolon file: decimal comma, flagged
    expect(out.warnings.join(' ')).toMatch(/could use the comma for thousands or for decimals/);
    expect(out.warnings.join(' ')).toMatch(/3,250/);
  });
  test('a value that is not a number is counted in a warning, never read in part', () => {
    const out = readProductionCsv('pressure,np\n3000,0\n29x0,100\n2900 psia,200\n2800,300\n');
    expect(out.rows.map((r) => r.pressure_psia)).toEqual([3000, 2800]);
    expect(out.warnings.join(' ')).toMatch(/2 value\(s\) could not be read as numbers/);
  });
});
