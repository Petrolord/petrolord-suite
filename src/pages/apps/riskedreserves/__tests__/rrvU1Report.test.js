/**
 * Risked Reserves Valuation upgrade U1: THE REPORT, read back from the PDF
 * file through the Report Kit's test side (pdfinfo, pdftotext, pdfimages,
 * pdftoppm). Reviewer lens RL1 to RL12: what went in and where it came
 * from, what came out and how it divides, the plot behind each number, and
 * the fine print. The PDF is built by the function the Export button calls
 * on the model the Report tab shows.
 */
import path from 'path';
import {
  readPdf, chartLogo, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { isPrintable } from '@/lib/reportKit';
import { valueProspect } from '@/utils/prospectValuation';
import {
  fromRcpProspect, blankProspect, engineInput, upstreamState, inputProblem, upgradeProspect, INPUT_KEYS,
} from '../services/rrvStore';
import { valueOrProblem, volumeCurves, valueCurves } from '../services/rrvMath';
import { rrvUnits } from '../services/rrvUnits';
import {
  buildRrvReportModel, missingEngineInputs, inputRows, chanceModel, REPORT_TITLE, EMV_FORMULA, F,
} from '../services/rrvReportModel';
import { buildRrvReport, reportFileName } from '../services/rrvReportExport';
import { RRV_SEED_PROSPECTS, RRV_T1_BROWSER_LIST } from '../services/rrvFixtures';

jest.setTimeout(120000);

const AT = new Date('2026-10-02T15:05:00Z');
const NOW = new Date('2026-10-02T15:00:00Z');
const UUID = '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11';
const row = { id: UUID, ...RRV_SEED_PROSPECTS[0] };
const IDENT = { company: 'Lordsway Energy', licence: 'OML 143', play: 'Agbada stacked sands', analyst: 'A. Analyst' };
const logo = chartLogo();

const north = (over = {}) => ({ ...fromRcpProspect(row, { now: NOW }), ident: IDENT, ...over });
// as the workstation does: the input check first, then the engine
const args = (p, over = {}) => {
  const bad = inputProblem(p);
  const { v, problem } = bad ? { v: null, problem: bad } : valueOrProblem(engineInput(p));
  return { p, v, problem, units: rrvUnits('MMbbl'), upstream: upstreamState(p, [row]), savedWhere: 'Petrolord account, 2026-10-02 15:01 UTC', build: 'Petrolord Suite 4.0.0 (abc1234)', company: 'Harness Energy', ...over };
};
const build = (p, over = {}) => buildRrvReport(buildRrvReportModel(args(p, over)), { logo, generatedAt: AT });
const num = (s) => Number(String(s).replace(/,/g, ''));

describe('the report of a prospect handed over by ReservoirCalc Pro', () => {
  let built; let pdf; let text; let model;
  beforeAll(() => {
    const p = north({ mefs: 15, unitValue: 9.5, touched: { mefs: true, unitValue: true }, inputMeta: { mefs: { source: 'economics', note: 'Screening economics, September 2026' } } });
    built = build(p);
    model = built.model;
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf.close());

  test('RL4: identification (company, prospect, licence, play, analyst, type, source, saved state, build, units, time)', () => {
    const first = flat(pdf.pageText[0]);
    expect(first).toContain(REPORT_TITLE);
    expect(first).toContain('Petrolord Risked Reserves Valuation');
    for (const s of ['Company Lordsway Energy', 'Prospect Ekene North', 'Licence or block OML 143', 'Play Agbada stacked sands', 'Analyst A. Analyst',
      'Analysis type Risked prospect valuation, closed form', 'Volume basis Recoverable, success case', 'Build Petrolord Suite 4.0.0 (abc1234)', 'Generated 2026-10-02 15:05 UTC']) expect(first).toContain(s);
    expect(first).toMatch(/Volumes from ReservoirCalc Pro prospect "Ekene/);
    expect(first).toMatch(/Valuation saved Petrolord account, 2026-10-02 15:01 UTC/);
    expect(first).toMatch(/Display units Oilfield \(MMboe, \$\/boe, \$MM\); gas at 6/);
    // every page carries the report name and its number
    pdf.pageText.slice(0, pdf.pages).forEach((pg, i) => expect(flat(pg)).toContain(`Risked Prospect Valuation Report, Ekene North Page ${i + 1} of ${pdf.pages}`));
    expect(pdf.pages).toBe(built.pages);
  });

  test('RL1: every input the engine read is on the page with a value, a unit and a source', () => {
    const e = engineInput(north());
    expect(Object.keys(e).sort()).toEqual([...INPUT_KEYS].sort());
    expect(missingEngineInputs(model.inputs.rows, e)).toEqual([]);
    // negative control: take one row away and the guard names the key
    expect(missingEngineInputs(model.inputs.rows.filter((r) => r.key !== 'wellCost'), e)).toEqual(['wellCost']);
    // a recorded-for-the-reader row does not count as an engine row
    expect(missingEngineInputs(model.inputs.rows.map((r) => (r.key === 'pg' ? { ...r, engine: false } : r)), e)).toEqual(['pg']);
    for (const r of model.inputs.rows) {
      expect(r.value).toBeTruthy();
      expect(r.unit).toBeTruthy();
      expect(r.source.length).toBeGreaterThan(8);
      // the row is in the file (a long label wraps inside its cell, so its first words)
      expect(text).toContain(r.label.split(' ').slice(0, 3).join(' '));
    }
    expect(text).toMatch(/Success-case volume P90 \(low\) 12 MMboe ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC/);
    expect(text).toMatch(/Minimum economic field size MEFS 15 MMboe Economic model\. Screening economics, September 2026/);
    expect(text).toMatch(/9\.5 \$\/boe Entered, source not stated/);
    // a default the user never touched is an assumption, with its value
    expect(text).toMatch(/Development cost D 100 \$MM Assumed: the starting default of 100 \$MM, never changed on this screen/);
    expect(text).toMatch(/Exploration well cost W 25 \$MM Assumed: the starting default of 25 \$MM/);
    // what the recoverable volumes were made from, recorded for the reader
    expect(text).toMatch(/In-place volume STOIIP P90 \/ P50 \/ P10 \/ 48 \/ 120 \/ 300 \/ 152 MMSTB ReservoirCalc Pro project "Ekene Block", reservoir "D-07/);
    expect(text).toMatch(/Monte Carlo run of 2026-10-01 11:00 UTC, seed 123, 10,000 realizations\. Recorded for the reader/);
    expect(text).toMatch(/Recovery factor 25 % ReservoirCalc Pro: recoverable mean over in-place mean/);
    expect(text).toContain('Rows marked "Recorded for the reader" or "Enters through Pg" did not enter the calculation directly');
  });

  test('RL2: the chance of success is printed as the product of its named factors, and closes', () => {
    const page = text;
    const f = (name) => Number(new RegExp(`${name} ([01]\\.\\d{3}) `).exec(page)[1]);
    const product = f('Trap') * f('Reservoir') * f('Charge') * f('Seal');
    expect(f('Product of the factors')).toBeCloseTo(product, 3);
    expect(f('Pg used in the valuation')).toBeCloseTo(product, 3);
    expect(page).toContain('Pg = trap x reservoir x charge x seal = 0.800 x 0.800 x 0.500 x 1.000 = 0.320. The factors are treated as independent.');
    // the factors are also input rows
    expect(page).toMatch(/Chance factor: charge 0\.500 fraction/);
  });

  test('RL3: unrisked and risked volumes; the EMV in its parts with the formula; the outcomes close on it', () => {
    const v = valueProspect(model.e);
    expect(text).toContain(EMV_FORMULA);
    expect(text).toMatch(/P90 \(exceeded with 90%\) 12\.0 12\.0 0\.0/);
    expect(text).toMatch(/P10 \(exceeded with 10%\) 75\.0 75\.0 \d+\.\d/);
    expect(text).toContain(`Mean n/a ${F.n1(v.successCase.mean)} ${F.n1(v.riskedMean)}`);
    expect(text).toContain(`Risked mean = Pg x unrisked mean = 0.320 x ${F.n1(v.successCase.mean)} = ${F.n1(v.riskedMean)} MMboe`);
    // the three terms, read from the page, sum to the printed EMV
    const term = (label) => num(new RegExp(`${label} (-?[\\d,]+\\.\\d) `).exec(text)[1]);
    const sum = term('Chance-weighted value of the barrels') + term('Chance-weighted development cost') + term('Exploration well');
    const emv = term('Expected monetary value EMV');
    expect(Math.abs(sum - emv)).toBeLessThanOrEqual(0.15);
    expect(emv).toBeCloseTo(v.emv, 1);
    // outcomes: chances to 100%, chance x value to the EMV
    const out = /All outcomes 100\.0% ([\d,.]+) n\/a (-?[\d,.]+)/.exec(text);
    expect(num(out[2])).toBeCloseTo(v.emv, 1);
    expect(text).toMatch(/Dry hole 68\.0% 0\.0 -25\.0 -17\.0/);
    expect(text).toMatch(/Discovery below the MEFS \(not developed\) \d+\.\d% below the MEFS -25\.0/);
    expect(text).toMatch(/Commercial discovery \(mean case\) \d+\.\d%/);
    expect(text).toContain('The chances sum to 100% and the chance-weighted values to the EMV');
  });

  test('RL6: every claimed result has its plot, drawn with the screen series; the one that does not apply says why', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'Expectation curve of volume', 'Expectation curve of value', 'Chance factors and the chance of success', 'Sensitivity of the EMV',
    ]);
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    for (const id of ['volume', 'value', 'chance']) expectFigureDrawn(pdf, fig[id], { logo: true });
    // the points on the page are the points the screen chart draws
    const screen = volumeCurves(model.e);
    const names = Object.keys(pointCounts(built.figures).volume[0]);
    expect(names).toHaveLength(2);
    expect(pointCounts(built.figures).volume[0][names[0]]).toBe(screen.success.length);
    expect(pointCounts(built.figures).volume[0][names[1]]).toBe(screen.risked.length);
    expect(Object.values(pointCounts(built.figures).value[0])).toEqual([valueCurves(model.e).success.length, valueCurves(model.e).risked.length]);
    expect(pointCounts(built.figures).chance[0]).toEqual({ Chance: 6 });
    expect(fig.chance.panels[0].marks.bars).toBe(6);
    // the reference lines: MEFS, P90, P50, P10 on the volume plot; zero and the EMV on the value plot
    expect(fig.volume.panels[0].lines).toBe(4);
    expect(fig.value.panels[0].lines).toBe(2);
    const plots = flat(pdf.pageText[fig.volume.page - 1]);
    for (const s of ['MEFS', 'P90', 'P50', 'P10', 'Volume (MMboe, log scale)', 'Chance of at least this volume (%)', 'Unrisked (success case)', 'Risked (x Pg 32.0%)', 'Value of the outcome ($MM)', 'EMV']) expect(plots).toContain(s);
    // the value over each bar is text: the four factors, Pg and Pc
    const bars = flat(pdf.pageText[fig.chance.page - 1]);
    for (const s of ['80.0%', '50.0%', '100.0%', '32.0%', F.pct(built.model.parts.pCommercialGivenSuccess * 0.32), 'Trap', 'Reservoir', 'Charge', 'Seal', 'Pg used', 'Commercial chance Pc']) expect(bars).toContain(s);
    expectFigureStatement(pdf, fig.sensitivity, /Not plotted: this application has no sensitivity analysis\. The break-even Pg/);
    expect(fig.sensitivity.plotted).toBe(false);
  });

  test('RL7: the basis is named beside the numbers (a lexicon over the report text)', () => {
    const lexicon = [
      /P90 is the low case and P10 the high case: the volume exceeded with 90 and 10 percent probability/,
      /exceedance convention, SPE PRMS/,
      /Unrisked mean volume [\d,.]+ MMboe Success case: given a discovery/,
      /Risked mean volume [\d,.]+ MMboe Pg x unrisked mean, the dry hole averaged in/,
      /Expected monetary value EMV -?[\d,.]+ \$MM Risked, after the exploration well/,
      /Unrisked value if commercial -?[\d,.]+ \$MM Mean commercial discovery, before the exploration well/,
      /Volumes are recoverable and oil equivalent/,
      /gas handed over in gas units is converted at 6 Mscf per boe/,
      /Volumes sent in MMSTB/,
      /Volume basis Recoverable \(prospective resources\), success case/,
      /Entered \(MMboe\)/, /Unrisked, fitted lognormal \(MMboe\)/, /Risked \(MMboe\)/,
      /Value \(\$MM\)/,
    ];
    for (const re of lexicon) expect(text).toMatch(re);
    // no volume is called MMbbl: the app values oil equivalent
    expect(text).not.toMatch(/MMbbl/);
  });

  test('RL9: the limits of the method are printed, and what this prospect trips is flagged', () => {
    expect(text).toContain('Limits of this analysis');
    for (const s of ['Single prospect.', 'dependence between prospects, shared play risk and a drilling sequence are not modelled',
      'The chance factors are treated as independent and multiplied', 'lognormal fitted to the entered P90 and P10',
      'The value per barrel is deterministic', 'The MEFS is an input and is not derived', 'It is not a reserves estimate']) expect(text).toContain(s);
    expect(text).toContain('Flags on this prospect');
    expect(text).toMatch(/Development cost, exploration well cost: starting defaults that were never changed on this screen/);
    expect(model.limits.flags.some((f) => /MEFS/.test(f) && /below the size that pays/.test(f))).toBe(false); // 9.5 x 15 - 100 > 0
  });

  test('RL11: the handoff is printed in full: source record, times, unit, basis, convention, methods', () => {
    for (const s of ['Handoff from ReservoirCalc Pro', 'Source application ReservoirCalc Pro', `Source record Prospect "Ekene North" (rcp_prospects ${UUID})`,
      'Record saved 2026-10-02 14:05 UTC', 'Received here 2026-10-02 15:00 UTC', 'Volumes sent in MMSTB', 'Chance of success As risked in ReservoirCalc Pro',
      'Volumes method Monte Carlo in ReservoirCalc Pro', 'Source project and reservoir Project "Ekene Block", reservoir "D-07 sand"',
      'Monte Carlo run 2026-10-01 11:00 UTC, seed 123, 10,000 realizations, GRV from the surface against sampled',
      'Edited here after the handoff Nothing: every handed-over input is as received', 'Source record now Unchanged since it was received']) expect(text).toContain(s);
  });

  test('RL12: the Report tab rows are the PDF rows; numbers print in full; Latin-1 only', () => {
    for (const r of [...model.headline.body, ...model.volumes.body, ...model.outcomes.body]) {
      expect(text).toContain(r.filter((c) => c !== '').slice(0, 2).join(' '));
    }
    for (const r of model.handoff) expect(text).toContain(r[0]);
    expect(isPrintable(pdf.text.replace(/\f/g, ''))).toBe(true);
    expect(text).not.toMatch(/\b\d\.\d+e[+-]\d/); // no "3.80e+3"
    expect(F.n1(12345.67)).toBe('12,345.7');
    expect(F.n1(NaN)).toBe('n/a');
    expect(reportFileName('Ekene North / A')).toBe('risked-valuation_Ekene_North_A.pdf');
  });

  test('golden: text line for line, pages, figures and the document hash', () => {
    const p = north({ mefs: 15, unitValue: 9.5, touched: { mefs: true, unitValue: true }, inputMeta: { mefs: { source: 'economics', note: 'Screening economics, September 2026' } } });
    checkGolden(build(p), { dir: path.join(__dirname, '__fixtures__/reportGolden'), name: 'rcp-prospect', update: process.env.UPDATE_REPORT_GOLDENS === '1' });
  });
});

describe('the conditions of the report', () => {
  const read = (p, over) => { const b = build(p, over); return { b, text: flat(readPdf(b.doc).text) }; };

  test('RL4, PL5: a valuation saved before the upgrade prints n/a for what it never had, and does not throw', () => {
    const old = upgradeProspect(RRV_T1_BROWSER_LIST[0]);
    const { text, b } = read(old, { company: null, upstream: upstreamState(old, [{ ...row, id: 'prospect-1' }]) });
    const first = text;
    expect(first).toMatch(/Company n\/a/);
    expect(first).toMatch(/Licence or block n\/a/);
    expect(first).toMatch(/Analyst n\/a/);
    expect(Object.fromEntries(b.model.identification)['Volumes from']).toBe('ReservoirCalc Pro (imported before the source record was kept)');
    expect(first).toMatch(/Volumes from ReservoirCalc Pro \(imported before the/);
    expect(first).toContain('Volume basis Not stated by the source');
    expect(first).toContain('The source record does not say whether its volumes are recoverable or in place');
    expect(first).toContain('imported before the source record was kept with the valuation; refresh it to record the source');
    expect(b.pages).toBeGreaterThanOrEqual(3);
  });

  test('the company falls back to the organisation, and a typed company wins', () => {
    expect(read(north({ ident: { ...IDENT, company: '' } })).text).toContain('Company Harness Energy');
    expect(read(north()).text).toContain('Company Lordsway Energy');
  });

  test('RL1: a blank P50 prints n/a and says the cross-check is left out', () => {
    const { text } = read(north({ p50: '' }));
    expect(text).toMatch(/Success-case volume P50 \(best\) n\/a MMboe Not provided: the Swanson cross-check is left out/);
    expect(text).toMatch(/Swanson mean \(cross-check\) n\/a/);
  });

  test('RL11: an input edited after the handoff is marked on its row, in the handoff table and in the flags', () => {
    const { text } = read(north({ p50: 34, pg: 0.3, touched: { p50: true, pg: true } }));
    expect(text).toMatch(/Success-case volume P50 \(best\) 34 MMboe Edited on this screen \(ReservoirCalc Pro sent 30 MMboe\)/);
    expect(text).toMatch(/Chance of geological success Pg 0\.300 fraction Entered on this screen as a total \(ReservoirCalc Pro sent 0\.320\)/);
    expect(text).toContain('Edited here after the handoff Pg (sent 0.32); P50 (sent 30)');
    expect(text).toContain('Edited after the handoff from ReservoirCalc Pro: Pg, P50. The values printed are the edited ones.');
    // RL2 in its "entered as total" mode
    expect(text).toContain('The Pg used (0.300) is not the product of the factors (0.320): it was entered as a total after the handoff');
    expect(text).toContain('entered as a total, which is not their product');
    // the unedited row keeps the handoff wording
    expect(text).toMatch(/Success-case volume P90 \(low\) 12 MMboe ReservoirCalc Pro prospect "Ekene North"/);
  });

  test('RL11: a source record that changed after the valuation is said, with what moved', () => {
    const changed = { ...row, updated_at: '2026-10-03T08:00:00.000Z', risked: { ...row.risked, pg: 0.28, success: { ...row.risked.success, p50: 34 } } };
    const p = north();
    const { text } = read(p, { upstream: upstreamState(p, [changed]) });
    expect(text).toContain('Source record now The source prospect changed in ReservoirCalc Pro on 2026-10-03 08:00 UTC after these inputs were received (Pg 0.32 to 0.28; P50 30 to 34).');
    expect(text).toContain('Refresh the prospect before signing.');
  });

  test('RL9: in-place volumes, an MEFS that loses money and untouched defaults are flagged', () => {
    const inPlace = { ...row, inputs: { ...row.inputs, basis: 'in-place' } };
    const p = { ...fromRcpProspect(inPlace, { now: NOW }), ident: IDENT };
    const { text } = read(p, { upstream: upstreamState(p, [inPlace]) });
    expect(text).toContain('The volumes are IN PLACE (STOIIP or GIIP). A valuation needs recoverable volumes');
    expect(text).toContain('Volume basis IN PLACE (STOIIP or GIIP): not a recoverable volume');
    expect(text).toContain('Volumes are AS RECEIVED, and their basis is not recoverable');
    expect(text).toMatch(/A discovery of exactly the MEFS \(10 MMboe\) is worth -20\.0 \$MM with this value per barrel and development cost/);
    expect(text).toContain('MEFS, value per barrel, development cost, exploration well cost: starting defaults that were never changed');
    // and a clean prospect says so
    const clean = north({ mefs: 15, unitValue: 9.5, devCost: 120, wellCost: 30, touched: { mefs: true, unitValue: true, devCost: true, wellCost: true } });
    expect(read(clean).text).toContain('No input on this prospect raises a flag.');
  });

  test('RL9: a P50 far from the fitted lognormal is flagged', () => {
    const { text } = read(north({ p50: 55, touched: { p50: true } }));
    expect(text).toMatch(/The entered P50 \(55\.0 MMboe\) differs from the P50 of the fitted lognormal \(30\.0\) by 83%/);
  });

  test('RL6: a typed prospect has no chance factors, and a zero value per barrel has no value curve: each says why', () => {
    const typed = { ...blankProspect(1), name: 'Typed lead', ident: IDENT, inputMeta: { pg: { source: 'study', note: 'Regional play risking 2025' } } };
    const b = build(typed, { upstream: { state: 'own' } });
    const pdf = readPdf(b.doc);
    const t = flat(pdf.text);
    const fig = Object.fromEntries(b.figures.map((f) => [f.id, f]));
    expectFigureStatement(pdf, fig.chance, /Not plotted: entered as a total: this prospect was typed with its chance of success and no chance factors/);
    expect(t).toContain('Handoff from ReservoirCalc Pro None: this prospect was typed in Risked Reserves Valuation');
    expect(t).toContain('Volumes from Typed in this app');
    expect(t).toMatch(/Chance of geological success Pg 0\.250 fraction Technical study or report\. Regional play risking 2025/);
    expect(t).toMatch(/Success-case volume P90 \(low\) 10 MMboe Entered, source not stated/);
    expect(listCaptions(pdf).map((c) => c.title)).toHaveLength(4);
    const zero = build({ ...typed, unitValue: 0, touched: { unitValue: true } }, { upstream: { state: 'own' } });
    const zf = Object.fromEntries(zero.figures.map((f) => [f.id, f]));
    expectFigureStatement(readPdf(zero.doc), zf.value, /Not plotted: the value per barrel is zero/);
    expect(zf.volume.plotted).toBe(true);
  });

  test('PL3, RL7: in the metric view the values convert and the labels follow; the money does not move', () => {
    const p = north();
    const oil = build(p);
    const si = build(p, { units: rrvUnits('10^6 m3') });
    const t = flat(readPdf(si.doc).text);
    const k = 0.158987294928;
    expect(t).toMatch(/Display units SI \/ metric \(10\^6 m3 oe, \$\/m3 oe, \$MM\)/);
    expect(t).toMatch(new RegExp(`Success-case volume P90 \\(low\\) ${String(parseFloat((12 * k).toPrecision(6))).replace('.', '\\.')} 10\\^6 m3 oe`));
    expect(t).toMatch(new RegExp(`Value per barrel u \\(NPV of a developed ${String(parseFloat((8 / k).toPrecision(6))).replace('.', '\\.')} \\$/m3 oe`));
    expect(t).toContain('Volume (10^6 m3 oe, log scale)');
    expect(t).not.toMatch(/MMboe/);
    // the EMV, the chances and the plotted point counts are the same in both
    const emv = (b) => b.model.headline.body.find((r) => r[0].startsWith('Expected monetary value'))[1];
    expect(emv(si)).toBe(emv(oil));
    expect(pointCounts(si.figures).volume).toEqual(pointCounts(oil.figures).volume);
    expect(si.model.volumes.body[0][1]).toBe(F.n1(12 * k));
  });

  test('a portfolio of the analyst\'s other prospects is context, with the independence caveat', () => {
    const a = north(); const b2 = { ...fromRcpProspect({ id: 'b', ...RRV_SEED_PROSPECTS[1] }, { now: NOW }) };
    const rows = [a, b2].map((p) => ({ p, v: valueProspect(engineInput(p)) }));
    const totals = { count: 2, riskedMean: rows[0].v.riskedMean + rows[1].v.riskedMean, emv: rows[0].v.emv + rows[1].v.emv, expectedCommercial: rows[0].v.pc + rows[1].v.pc, pAtLeastOneCommercial: 1 - (1 - rows[0].v.pc) * (1 - rows[1].v.pc) };
    const { text } = read(a, { portfolio: { rows, totals, leftOut: 1 } });
    expect(text).toContain('Portfolio context');
    expect(text).toMatch(/Ekene Deep 18\.0%/);
    expect(text).toContain(`Sum of 2 prospects n/a n/a ${F.n1(totals.riskedMean)} ${F.n1(totals.emv)}`);
    expect(text).toContain('added as INDEPENDENT prospects');
    expect(text).toContain('1 prospect with unfinished inputs left out');
  });

  test('PL4: a prospect that cannot be valued has no report, and the reason is given', () => {
    const p = north({ pg: '' });
    const model = buildRrvReportModel(args(p));
    expect(model.valued).toBe(false);
    expect(() => buildRrvReport(model, { logo })).toThrow(/cannot be reported yet/);
    // the inputs it has are still listed for the screen
    expect(inputRows(p, rrvUnits('MMbbl')).find((r) => r.key === 'pg').value).toBe('n/a');
    expect(chanceModel(p).rows).toBeTruthy();
  });
});
