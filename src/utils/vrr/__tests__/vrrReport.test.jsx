/**
 * VRR-U1: the Voidage Replacement report read back (reviewer lens RL1 to
 * RL12) and its goldens. The PDF is built by the function the Export button
 * calls, from the model the Report tab shows, and read with poppler.
 */
import {
  readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit';
import {
  CASES, GOLDEN_DIR, UPDATE, pdfOf, reportOf, sampleWells, fluidTablePatterns, undatedGrid,
} from './vrrTestKit';
import { engineInputOf } from '../reportModel';
import { deriveVrr } from '../workspace';
import { trendRows, termRows } from '../series';
import { buildLedgerCsv } from '../ledgerCsv';

const parseNum = (s) => Number(String(s).replace(/,/g, ''));

describe('goldens', () => {
  it.each(Object.keys(CASES))('%s', (name) => {
    const { built } = pdfOf(CASES[name]());
    const { pdf } = checkGolden(built, { dir: GOLDEN_DIR, name, update: UPDATE });
    pdf.close?.();
  });
});

describe('RL1: every input the analysis read is on the page, with unit and source', () => {
  it.each(Object.keys(CASES))('completeness guard, %s', (name) => {
    const inputs = CASES[name]();
    const { model, d } = reportOf(inputs);
    expect(missingInputRows(engineInputOf(inputs, d), model.inputs.rows)).toEqual([]);
    for (const r of model.inputs.rows) expect(r.source).toBeTruthy();
  });
  it('NEGATIVE CONTROL: an input without its row is named', () => {
    const inputs = fluidTablePatterns();
    const { model, d } = reportOf(inputs);
    const rows = model.inputs.rows.filter((r) => r.key !== 'pvtTable');
    expect(missingInputRows(engineInputOf(inputs, d), rows)).toEqual(['pvtTable']);
  });
  it('starting values print as assumptions, a stated source as stated, a handoff with its method and project', () => {
    const { model } = reportOf(fluidTablePatterns());
    const by = Object.fromEntries(model.inputs.rows.map((r) => [r.key, r]));
    expect(by.Bw.source).toMatch(/^Fluid Systems Studio pvt-1, taken from the PVT table at 2400 psia \(stated\); method McCain/);
    expect(by.Bo.source).toMatch(/project "Good Oil Well No. 4 PVT"/);
    expect(by.pvtMode.source).toMatch(/interpolated in the PVT table at each period's reservoir pressure \(\d+ rows/);
    const plain = reportOf(sampleWells()).model.inputs.rows.find((r) => r.key === 'Bo');
    expect(plain.source).toBe('Assumed: the starting value of the app (1.25 RB/STB); no field data behind it');
  });
  it('RL8: a value edited after the intake says so', () => {
    const inputs = fluidTablePatterns();
    inputs.fvf = { ...inputs.fvf, Bo: '1.5' };
    const bo = reportOf(inputs).model.inputs.rows.find((r) => r.key === 'Bo');
    expect(bo.source).toMatch(/^Edited in this app after the handoff \(received 1\.\d+\)/);
  });
});

describe('RL2: the voidage ledger closes on its totals', () => {
  it.each(Object.keys(CASES))('%s: every column sums to its total to the printed digits; the terms make the produced and injected columns', (name) => {
    const { model, d } = reportOf(CASES[name]());
    const body = model.ledger.rows.slice(0, -1);
    const total = model.ledger.rows[model.ledger.rows.length - 1];
    for (let c = 1; c <= 7; c += 1) {
      const sum = body.reduce((s, r) => s + parseNum(r[c]), 0);
      expect(Math.abs(sum - parseNum(total[c]))).toBeLessThanOrEqual(body.length); // rounding of the printed digits
    }
    for (const r of model.ledger.rows) {
      expect(Math.abs(parseNum(r[1]) + parseNum(r[2]) + parseNum(r[3]) - parseNum(r[4]))).toBeLessThanOrEqual(2);
      expect(Math.abs(parseNum(r[5]) + parseNum(r[6]) - parseNum(r[7]))).toBeLessThanOrEqual(1);
    }
    expect(d.ledger.closure).toBeLessThan(1e-12);
  });
  it('the sample: 62,865 RB produced, 59,460 RB injected, cumulative VRR 0.9458 (the T1 oracle)', () => {
    const { built } = pdfOf(sampleWells());
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Total 50,625 12,240 0 62,865 54,060 5,400 59,460 n\/a 0\.9458/);
    pdf.close?.();
  });
});

describe('RL4, RL5: identification and what the import read', () => {
  const { built } = pdfOf(sampleWells());
  const pdf = readPdf(built.doc);
  const t = flat(pdf.text);
  afterAll(() => pdf.close?.());
  it('the header', () => {
    for (const s of ['Company Lordsway Energy', 'Field Ekene', 'Licence or block OML 999', 'Reservoir or zone E-2000', 'Analyst A. Analyst', 'Periods 3 (2025-01 to 2025-03)', 'Data cut-off 2025-03', 'Wells 2 producers, 2 injectors', 'Software build test-build']) {
      expect(t).toContain(s);
    }
  });
  it('the import read-back and the volumes with their FVFs by period', () => {
    expect(t).toMatch(/What the import read/);
    expect(t).toMatch(/Water injected winj_stb bbl in the row's period \(volume\) the header 3/);
    expect(t).toMatch(/Volumes and FVFs by period/);
    expect(t).toMatch(/2025-01 15,000 3,000 8,000 15,000 3,000 1\.25 1\.02 0\.9 550 2,998 constant/);
  });
});

describe('RL6: every figure drawn from the screen series, or its reason', () => {
  it('the sample: captions, ink, marks and point counts against the screen', () => {
    const inputs = sampleWells();
    const { built, args } = pdfOf(inputs);
    const pdf = readPdf(built.doc, { ink: true });
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'Voidage replacement ratio by period', 'Reservoir voidage by term', 'Reservoir pressure history',
      'Production and injection rates', 'Formation volume factors by period', 'Cumulative VRR by pattern',
    ]);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const counts = pointCounts(built.figures);
    const d = deriveVrr(inputs);
    expect(counts.vrr[0]).toEqual({ Instantaneous: trendRows(d).length, 'Rolling (3)': trendRows(d).length, Cumulative: trendRows(d).length });
    expect(counts.terms[0]).toEqual({ Oil: termRows(d).length, Water: termRows(d).length, 'Free gas': termRows(d).length });
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'fvf'), 'Does not apply: one constant FVF set is used for every period');
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'patterns'), 'Not plotted: no pattern is defined.');
    expect(args.figures.length).toBe(6);
    pdf.close?.();
  });
  it('undated periods: no calendar, no rates, no pressure, each with its reason', () => {
    const { built } = pdfOf(undatedGrid());
    const pdf = readPdf(built.doc);
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'rates'), 'Does not apply: the periods are not calendar months');
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'pressure'), 'Does not apply: the periods are not calendar months');
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'patterns'), 'Does not apply: patterns need an imported per-well ledger.');
    pdf.close?.();
  });
  it('the Fluid table with patterns: the FVF and pattern figures are drawn', () => {
    const { built } = pdfOf(fluidTablePatterns());
    const pdf = readPdf(built.doc, { ink: true });
    for (const f of built.figures) {
      expect(f.plotted).toBe(true);
      expectFigureDrawn(pdf, f, { logo: true });
    }
    pdf.close?.();
  });
});

describe('RL7: the basis is named, the units convert with a known value', () => {
  it('SI: 62,865 RB is 9,995 rm3; 3,000 psia is 20,684 kPa', () => {
    const { built } = pdfOf(sampleWells({ system: 'si' }));
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Produced reservoir voidage 9,995 rm3/);
    expect(t).toMatch(/20,668 to 19,995 kPa/); // 2,997.6 and 2,900 psia at mid-January and mid-March
    expect(t).toMatch(/Display units SI \(oil sm3/);
    pdf.close?.();
  });
  it('the conventions are printed', () => {
    const { built } = pdfOf(fluidTablePatterns());
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Produced voidage Np Bo \+ Wp Bw \+ max\(0, Gp - Rs Np \/ 1000\) Bg/);
    expect(t).toMatch(/FVF basis Bo and Rs per stock-tank barrel.*The PVT table taken from Fluid Systems Studio states:/);
    expect(t).toMatch(/Pressure datum 8500 ft TVDSS; stated only, no correction to datum applied/);
    pdf.close?.();
  });
});

describe('RL9, RL11: limits, flags and the block the FVFs came from', () => {
  it('limits name the constant FVF assumption, free gas, injected fluid, allocation; flags name the gaps', () => {
    const { model } = reportOf(sampleWells({ surveys: false }));
    expect(model.limits.assumptions.join(' ')).toMatch(/FVFs are held constant over the record/);
    expect(model.limits.assumptions.join(' ')).toMatch(/No pressure survey is attached/);
    const { model: m2 } = reportOf(fluidTablePatterns());
    expect(m2.limits.assumptions.join(' ')).toMatch(/Pattern VRR rests on the allocation factors/);
    expect(m2.limits.assumptions.join(' ')).toMatch(/FVFs follow the pressure history through the Fluid Systems Studio table/);
  });
  it('a withheld VRR prints n/a with the reason, never a number', () => {
    const inputs = sampleWells();
    inputs.fvf = { ...inputs.fvf, Bg: '' };
    const { built } = pdfOf(inputs);
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Voidage replacement ratio n\/a The constant FVF set is not usable: Bg "" is not a number/);
    expect(t).not.toMatch(/Cumulative VRR 0\.\d/);
    pdf.close?.();
  });
  it('the pvt-1 block is printed', () => {
    const { built } = pdfOf(fluidTablePatterns());
    const pdf = readPdf(built.doc);
    expect(flat(pdf.text)).toMatch(/pvt-1 block the FVFs were taken from Item Value PVT contract pvt-1 Source Fluid Systems Studio, project "Good Oil Well No. 4 PVT"/);
    pdf.close?.();
  });
});

describe('RL12: the ledger CSV is the report\'s ledger with a provenance header', () => {
  it('header lines, the units in the column heads, rows that close on the total', () => {
    const args = reportOf(fluidTablePatterns());
    const csv = buildLedgerCsv(args, { generatedAt: new Date('2026-10-04T12:00:00Z'), projectName: 'Ekene waterflood' });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('# Petrolord Voidage Replacement Monitor: voidage ledger by period');
    expect(csv).toMatch(/# FVFs per period: interpolated in the PVT table/);
    expect(csv).toMatch(/# Closure: the terms agree with the engine VRR series/);
    const head = lines.find((l) => l.startsWith('period,')).split(',');
    expect(head).toContain('produced_voidage_RB');
    expect(head).toContain('Bg_RB/Mscf');
    const rows = lines.filter((l) => /^\d{4}-\d{2},/.test(l)).map((l) => l.split(','));
    const total = lines.find((l) => l.startsWith('total,')).split(',');
    const ip = head.indexOf('produced_voidage_RB');
    expect(rows.reduce((s, r) => s + Number(r[ip]), 0)).toBeCloseTo(Number(total[ip]), 4);
    const cum = rows[rows.length - 1][head.indexOf('vrr_cumulative')];
    expect(Number(cum)).toBeCloseTo(Number(total[head.indexOf('vrr_cumulative')]), 9);
  });
});
