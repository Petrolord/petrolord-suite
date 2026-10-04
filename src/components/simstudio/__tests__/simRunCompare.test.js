/**
 * SIM-U2-005: run compare. Two or more completed runs of a case, read from
 * summaries OPM Flow 2026.04 really wrote: the difference table against the
 * base, the overlay series on the calendar axis, and the report (table and
 * figure) read back from the PDF.
 * Negative controls: one run is no comparison; a thinned series without a
 * cumulative is never integrated.
 */
import { readPdf, flat, listCaptions, expectFigureDrawn } from '@/lib/reportKit/testKit';
import { compareRuns, compareSeries, runQuantities } from '@/utils/simstudio/runCompare';
import { collectSimReportArgs, buildSimPdf } from '@/utils/simstudio/reportExport';
import * as K from './simTestKit';

const base = () => ({ run: K.runOf(K.builtSummary(), { id: 'run-base-0001', finished_at: '2026-10-04T09:00:09Z' }), summary: K.builtSummary() });
const other = () => ({ run: K.runOf(K.builtS4Summary(), { id: 'run-hist-0002', finished_at: '2026-10-04T10:00:09Z' }), summary: K.builtS4Summary() });

describe('SIM-U2-005 run compare', () => {
  it('the base and a second run: values, differences and the deck they ran', () => {
    const m = compareRuns({ entries: [base(), other()] });
    expect(m.ok).toBe(true);
    expect(m.head).toEqual(['Quantity', 'Unit', 'Base run-base, 2026-10-04 09:00:09', 'run-hist, 2026-10-04 10:00:09', 'Difference run-hist minus base']);
    const b = K.builtSummary().field.FOPT.at(-1);
    const o = K.builtS4Summary().field.FOPT.at(-1);
    const row = m.rows.find((r) => r[0] === 'Cumulative oil produced');
    expect(row.slice(0, 4)).toEqual(['Cumulative oil produced', 'STB', Math.round(b).toLocaleString('en-US'), Math.round(o).toLocaleString('en-US')]);
    expect(row[4]).toMatch(/^[+-][\d,]+ \([+-]\d+\.\d percent\)$/);
    expect(Number(row[4].split(' ')[0].replace(/,/g, ''))).toBe(Math.round(o - b));
    expect(Number(/\(([+-][\d.]+) percent/.exec(row[4])[1])).toBeCloseTo(((o - b) / b) * 100, 1);
    expect(m.rows.find((r) => r[0] === 'Deck')[3]).toMatch(/^another deck, SHA-256 b96ff2cb9a43/);
    expect(m.rows.find((r) => r[0] === 'Material balance').slice(2, 4)).toEqual(['closes', 'closes']);
  });

  it('a cumulative the summary lacks is the step rates integrated, which for oil equals the run\'s own FOPT', () => {
    const s = K.builtSummary();
    const noCum = { ...s, field: { ...s.field } };
    delete noCum.field.FOPT;
    const q = runQuantities(noCum);
    expect(q.oil.how).toBe('FOPR integrated over the time steps');
    expect(Math.abs(q.oil.value - s.field.FOPT.at(-1)) / s.field.FOPT.at(-1)).toBeLessThan(1e-5);
    // negative control: a thinned series is never integrated
    const thin = { ...noCum, steps: { ...s.steps, stride: 3 } };
    expect(runQuantities(thin).oil).toEqual({ value: null, how: 'FOPR is thinned' });
    const m = compareRuns({ entries: [{ ...base(), summary: noCum }, other()] });
    expect(m.notes.join(' ')).toMatch(/oil is the FOPR integrated over the time steps \(the summary holds no cumulative\)/);
  });

  it('negative control: one run is no comparison', () => {
    expect(compareRuns({ entries: [base()] })).toEqual({ ok: false, reason: 'Pick two or more completed runs of the case to compare them.' });
  });

  it('the overlay is on the calendar axis in the display units (SI pinned: 1 STB/d = 0.1589873 sm3/d)', () => {
    const s = compareSeries([base(), other()], 'FOPR', 'si');
    expect(s.unit).toBe('sm3/d');
    expect(s.series.length).toBe(2);
    expect(s.series[0].pts[0][0]).toBe(Date.parse('2026-01-02T00:00:00Z'));
    expect(s.series[1].pts[0][0]).toBe(Date.parse('2025-01-02T00:00:00Z'));
    expect(s.series[1].pts[0][1]).toBeCloseTo(2000 * 0.158987294928, 6);
  });

  it('the report prints the comparison table and the overlay figure', () => {
    const s = K.builtSummary();
    const args = collectSimReportArgs({
      caseRow: K.builtCase(), run: base().run, summary: s, deckText: K.builtDeck(), form: K.builtForm(s), system: 'oilfield', build: K.BUILD,
      compare: [base(), other()],
    });
    expect(args.model.compare.ok).toBe(true);
    const built = buildSimPdf(args, { logo: K.logo, generatedAt: K.AT });
    const pdf = readPdf(built.doc, { ink: true });
    const text = flat(pdf.text);
    expect(text).toMatch(/Run comparison/);
    expect(text).toMatch(/The first run is the base; a difference is the run minus the base/);
    expect(listCaptions(pdf).map((c) => c.title)).toContain('Run comparison');
    expectFigureDrawn(pdf, built.figures.find((f) => f.id === 'compare'), { logo: true });
    // without a comparison the report is as before: no section, no figure
    const plain = collectSimReportArgs({ caseRow: K.builtCase(), run: base().run, summary: s, deckText: K.builtDeck(), form: K.builtForm(s), system: 'oilfield', build: K.BUILD });
    expect(plain.model.compare).toBeUndefined();
    expect(plain.figures.find((f) => f.id === 'compare')).toBeUndefined();
  });
});
