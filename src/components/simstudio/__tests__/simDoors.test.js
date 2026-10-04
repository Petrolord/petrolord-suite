/**
 * SIM-U1 import doors (PL2, RL10) on the hostile file set
 * (e2e/fixtures/simulation/hostile): the deck upload door and the per-well
 * history door. Each refusal names its reason; each accepted file is read
 * back.
 */
import fs from 'fs';
import path from 'path';
import { planDeckUpload, looksBinary } from '@/utils/simstudio/deckUpload';
import { parseWellRateCsv, historyFromWellRows } from '@/utils/simWellHistoryImport';

const H = path.join(process.cwd(), 'e2e', 'fixtures', 'simulation', 'hostile');
const file = (name) => {
  const buf = fs.readFileSync(path.join(H, name));
  return { name, size: buf.length, text: buf.toString('latin1') };
};
const text = (name) => fs.readFileSync(path.join(H, name), 'utf8');
const spe9 = () => {
  const p = path.join(process.cwd(), 'public', 'sim-templates', 'spe9', 'SPE9.DATA');
  const t = fs.readFileSync(p, 'utf8');
  return { name: 'SPE9.DATA', size: t.length, text: t };
};

describe('SIM-U1-012 the deck upload door', () => {
  test('two main decks in one pick are refused (before: the last one silently became the main deck)', () => {
    const out = planDeckUpload([file('A.DATA'), file('B.DATA')]);
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/2 main deck files were picked \(A\.DATA, B\.DATA\)/);
  });
  test('embedded Python is refused at the door', () => {
    const out = planDeckUpload([file('pyaction.DATA')]);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/PYACTION \(embedded Python\)/);
  });
  test('a binary file is refused', () => {
    expect(looksBinary(file('binary.DATA').text)).toBe(true);
    expect(planDeckUpload([file('binary.DATA')]).errors.join(' ')).toMatch(/not a text file/);
  });
  test('a CRLF deck with a lowercase extension is read (OPM Flow runs it: worker check 2026-10-04)', () => {
    const out = planDeckUpload([file('spe1-crlf-lowercase.data')]);
    expect(out.ok).toBe(true);
    expect(out.main).toBe('spe1-crlf-lowercase.data');
    expect(out.readBack[0]).toBe('Main deck: spe1-crlf-lowercase.data, FIELD units, 10 x 10 x 3 grid, 2 wells.');
  });
  test('a deck whose include files were not picked says which', () => {
    const out = planDeckUpload([spe9()]);
    expect(out.ok).toBe(true);
    expect(out.missingIncludes).toEqual(['TOPSVALUES.DATA', 'PERMVALUES.DATA']);
    expect(out.warnings.join(' ')).toMatch(/includes TOPSVALUES\.DATA, PERMVALUES\.DATA, not picked here/);
    // negative control: picked together, nothing is missing
    const inc = (n) => { const t = fs.readFileSync(path.join(process.cwd(), 'public', 'sim-templates', 'spe9', n), 'utf8'); return { name: n, size: t.length, text: t }; };
    expect(planDeckUpload([spe9(), inc('TOPSVALUES.DATA'), inc('PERMVALUES.DATA')]).missingIncludes).toEqual([]);
  });
  test('an include file alone is accepted only when the case has a main deck', () => {
    const inc = { name: 'EXTRA.INC', size: 10, text: 'PORO\n 300*0.2 /\n' };
    expect(planDeckUpload([inc]).ok).toBe(false);
    const ok = planDeckUpload([inc], { currentMain: 'u/c/deck/MAIN.DATA' });
    expect(ok.ok).toBe(true);
    expect(ok.readBack[0]).toMatch(/main deck stays MAIN\.DATA/);
  });
  test('over 25 MB is refused', () => {
    expect(planDeckUpload([{ name: 'BIG.DATA', size: 26 * 1048576, text: 'RUNSPEC\n' }]).errors.join(' ')).toMatch(/limit is 25 MB/);
  });
});

describe('SIM-U1-011 the per-well history door', () => {
  test('semicolons, comma decimals, day-first dates, a units row, a title line: read and said', () => {
    // "900.000" next to "1.500,5": the shared reader asks which mark is the decimal one
    const asked = parseWellRateCsv(text('history-dayfirst-comma-units.csv'));
    expect(asked.rows).toEqual([]);
    expect(asked.questions[0].kind).toBe('decimalMark');
    const out = parseWellRateCsv(text('history-dayfirst-comma-units.csv'), { decimal: ',' });
    expect(out.errors).toEqual([]);
    expect(out.questions).toEqual([]);
    expect(out.rows[0]).toEqual({ date: '2025-01-15', well: 'PROD1', oil: 1500.5, water: 100, gas: 900 });
    expect(out.rows[2]).toEqual({ date: '2025-02-15', well: 'PROD1', oil: 1450, water: 120.5, gas: 880 });
    expect(out.readBack.join(' ')).toMatch(/semicolon separated, decimal mark ","/);
    expect(out.readBack.join(' ')).toMatch(/gas: column "gas" read as scf\/d \(from the header\), converted to Mscf\/d/);
    expect(out.readBack.join(' ')).toMatch(/Skipped 1 line/);
  });
  test('dates the file does not settle are asked, never guessed', () => {
    const out = parseWellRateCsv(text('history-ambiguous-dates.csv'));
    expect(out.rows).toEqual([]);
    expect(out.questions[0].kind).toBe('dateOrder');
    const dmy = parseWellRateCsv(text('history-ambiguous-dates.csv'), { dateOrder: 'dmy' });
    expect(dmy.rows.map((r) => r.date)).toEqual(['2025-02-01', '2025-03-01']);
    const mdy = parseWellRateCsv(text('history-ambiguous-dates.csv'), { dateOrder: 'mdy' });
    expect(mdy.rows.map((r) => r.date)).toEqual(['2025-01-02', '2025-01-03']);
  });
  test('metric units in the headers convert at the door (one known value per conversion)', () => {
    const out = parseWellRateCsv(text('history-metric.csv'));
    expect(out.errors).toEqual([]);
    // 238.48 m3/d = 1,500.0 STB/d (1 bbl = 0.158987 m3); 25,485 m3/d = 900.0 Mscf/d (1 Mscf = 28.3168 m3)
    expect(out.rows[0].oil).toBeCloseTo(1500.0, 0);
    expect(out.rows[0].gas).toBeCloseTo(900.0, 0);
    expect(out.readBack.join(' ')).toMatch(/oil: column "oil \(m3\/d\)" read as m3\/d \(from the header\), converted to STB\/d/);
  });
  test('the gas select applies only to a column with no unit', () => {
    const csv = 'date,well,oil,gas\n2025-01-01,PROD1,1000,500000\n';
    expect(parseWellRateCsv(csv, { gasUnit: 'scf' }).rows[0].gas).toBe(500);
    expect(parseWellRateCsv(csv).rows[0].gas).toBe(500000);
  });
  test('bad cells are named by line and nothing half-imports', () => {
    const out = parseWellRateCsv(text('history-bad-cells.csv'));
    expect(out.errors).toEqual([
      "Line 2: oil value 'abc' is not a number.",
      'Line 3: needs a date and a well name (read "2025-02-01", "").',
    ]);
  });
  test('the read rows build the same periods as the S5 path', () => {
    const { rows } = parseWellRateCsv(text('history-dayfirst-comma-units.csv'), { decimal: ',' });
    const out = historyFromWellRows(rows, [{ name: 'PROD1', type: 'producer' }, { name: 'INJ1', type: 'water_injector' }]);
    expect(out.periods[0].prod).toEqual([{ name: 'PROD1', orat: 1500.5, wrat: 100, grat: 900 }]);
  });
});
