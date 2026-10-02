/**
 * Risked Reserves Valuation Step 2: THE REPORT, read back from the PDF file
 * through the Report Kit's test side. Each Step 2 item adds its inputs with
 * unit and source, its figures and its limits (RL1 to RL12), and this suite
 * reads them off the page the Export button builds.
 */
import path from 'path';
import {
  readPdf, chartLogo, flat, listCaptions, pointCounts, expectFigureDrawn, checkGolden,
} from '@/lib/reportKit/testKit';
import { valueProspect } from '@/utils/prospectValuation';
import {
  fromRcpProspect, engineInput, upstreamState, inputProblem, setInput, setModelField, setMefsBasis,
} from '../services/rrvStore';
import { valueOrProblem } from '../services/rrvMath';
import { rrvUnits } from '../services/rrvUnits';
import {
  buildRrvReportModel, missingEngineInputs, missingModelInputs, F,
} from '../services/rrvReportModel';
import { buildRrvReport } from '../services/rrvReportExport';
import { ECON_MODEL_DEFAULTS, ECON_MODEL_FIELDS, npvOfSize, derivedMefs } from '../services/rrvEconomics';
import { RRV_SEED_PROSPECTS } from '../services/rrvFixtures';

jest.setTimeout(120000);

const AT = new Date('2026-10-02T15:05:00Z');
const NOW = new Date('2026-10-02T15:00:00Z');
const UUID = '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11';
const row = { id: UUID, ...RRV_SEED_PROSPECTS[0] };
const IDENT = { company: 'Lordsway Energy', licence: 'OML 143', play: 'Agbada stacked sands', analyst: 'A. Analyst' };
const logo = chartLogo();

const north = () => ({ ...fromRcpProspect(row, { now: NOW }), ident: IDENT });
const args = (p, over = {}) => {
  const bad = inputProblem(p);
  const { v, problem } = bad ? { v: null, problem: bad } : valueOrProblem(engineInput(p));
  return { p, v, problem, units: rrvUnits('MMbbl'), upstream: upstreamState(p, [row]), savedWhere: 'Petrolord account, 2026-10-02 15:01 UTC', build: 'Petrolord Suite 4.0.0 (abc1234)', company: 'Harness Energy', ...over };
};
const build = (p, over = {}) => buildRrvReport(buildRrvReportModel(args(p, over)), { logo, generatedAt: AT });
const num = (s) => Number(String(s).replace(/,/g, ''));

describe('U2-002: the derived MEFS and the value by field size, on the page', () => {
  let built; let pdf; let text; let model; let p;
  beforeAll(() => {
    // the analyst changed the capex and stated where the model came from
    p = { ...setModelField(setInput(north(), 'wellCost', 30), 'capex', 350), inputMeta: { econModel: { source: 'economics', note: 'Screening deck, September 2026' } } };
    built = build(p);
    model = built.model;
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf.close());

  test('RL1: the three derived inputs say what they were derived from, and every assumption of the model is a row with its unit and source', () => {
    expect(missingEngineInputs(model.inputs.rows, model.e)).toEqual([]);
    expect(missingModelInputs(model.inputs.rows, p)).toEqual([]);
    const by = Object.fromEntries(model.inputs.rows.map((r) => [r.key, r]));
    expect(by.mefs).toMatchObject({ unit: 'MMboe', source: 'Derived: the smallest size whose net present value is at or above zero under the economic model below' });
    expect(by.unitValue.source).toMatch(/^Derived from the economic model below: the slope/);
    expect(by.devCost.source).toMatch(/^Derived from the economic model below: the offset/);
    expect(by['model.price']).toMatchObject({ value: '70', unit: '$/boe', source: 'Economic model. Screening deck, September 2026. Enters through the MEFS, u and D' });
    expect(by['model.capex']).toMatchObject({ value: '350', unit: '$MM' });
    expect(by['model.discount']).toMatchObject({ value: '10', unit: '%' });
    for (const [k, label] of ECON_MODEL_FIELDS) {
      expect(by[`model.${k}`].value).not.toBe('n/a');
      expect(by[`model.${k}`].label).toBe(`Model: ${label.charAt(0).toLowerCase()}${label.slice(1)}`);
    }
    for (const s of ['Model: price 70 $/boe', 'Model: royalty 10 %', 'Model: tax 30 %', 'Model: discount rate 10 %', 'Model: producing life 15 years']) expect(text).toContain(s);
    expect(text).toMatch(/Minimum economic field size MEFS [\d.]+ MMboe Derived: the smallest size whose net present value is at or above zero/);
    // negative control: drop a model row and the completeness guard names it
    expect(missingModelInputs(model.inputs.rows.filter((r) => r.key !== 'model.tax'), p)).toEqual(['tax']);
  });

  test('the Economics section: basis, the value line, the MEFS, zero at the MEFS, the cross-check', () => {
    const m = derivedMefs({ ...ECON_MODEL_DEFAULTS, capex: 350 }).mefs;
    expect(model.e.mefs).toBeCloseTo(m, 12);
    expect(text).toContain('Economics: the MEFS and the value of a discovery');
    expect(text).toContain('Economic model of this valuation, on the canonical screening NPV: calculateEconomics (screening; src/utils/npvCalculations.js)');
    expect(text).toContain(`value(V) = u x V - D = ${F.plain(model.e.unitValue)} $/boe x V - ${F.plain(model.e.devCost)} $MM`);
    expect(text).toContain(`MEFS ${F.plain(m)} MMboe, derived: the smallest size whose engine NPV is at or above zero`);
    expect(text).toContain('Value at the MEFS 0.0 $MM: what a discovery of exactly the MEFS is worth on the line');
    const v = valueProspect(model.e);
    expect(text).toContain(`Mean commercial size and its value ${F.n1(v.meanIfCommercial)} MMboe, ${F.n1(v.npvIfCommercial)} $MM before the exploration well`);
    expect(text).toMatch(/Cross-check of the line EMV with the value-by-size curve integrated over the success case: -?[\d,.]+ \$MM; on the line: -?[\d,.]+ \$MM \(difference 0\.0\)/);
  });

  test('the table "Value by field size": the engine NPV read off the page is the canonical NPV at that size', () => {
    expect(text).toContain('Value by field size');
    expect(model.economics.table.head).toEqual(['Field size', 'Size (MMboe)', 'Engine NPV ($MM)', 'Engine NPV per barrel ($/boe)', 'Value on the line ($MM)', 'Line less engine ($MM)']);
    const labels = model.economics.table.body.map((r) => r[0]);
    expect(labels).toEqual(expect.arrayContaining(['MEFS', 'P90', 'P50', 'Mean', 'Mean if commercial', 'P10']));
    // sizes ascend
    const sizes = model.economics.table.body.map((r) => num(r[1]));
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    const a = p.econ.model;
    const p10 = /P10 75\.0 (-?[\d,.]+) (-?[\d,.]+) (-?[\d,.]+) (-?[\d,.]+)/.exec(text);
    expect(num(p10[1])).toBeCloseTo(npvOfSize(75, a), 1);
    expect(num(p10[2])).toBeCloseTo(npvOfSize(75, a) / 75, 2);
    // P90 (12 MMboe) is below the MEFS: its engine NPV is negative and the row says the size is for reading only
    const p90 = /P90 12\.0 (-?[\d,.]+)/.exec(text);
    expect(num(p90[1])).toBeLessThan(0);
    expect(text).toContain('A size below the MEFS is not developed, so its row is for reading only.');
  });

  test('RL6: the value-against-size figure is drawn with the engine curve, the line and the MEFS marked', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toContain('Value of a discovery against its size');
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    expectFigureDrawn(pdf, fig.valueSize, { logo: true });
    const counts = pointCounts(built.figures).valueSize[0];
    expect(Object.keys(counts)).toHaveLength(2);
    expect(Object.keys(counts)[0]).toBe('Engine NPV by size (economic model)');
    expect(Object.values(counts)).toEqual([model.economics.series.curve.length, model.economics.series.line.length]);
    // MEFS, the percentiles that fit the axis, and zero
    expect(fig.valueSize.panels[0].lines).toBeGreaterThanOrEqual(4);
    const page = flat(pdf.pageText[fig.valueSize.page - 1]);
    for (const s of ['MEFS', 'Zero', 'Size of the discovery (MMboe)', 'Value of the discovery ($MM)', 'They meet at the MEFS']) expect(page).toContain(s);
  });

  test('RL9: the limits name the model and its caution, and the untouched assumptions are flagged', () => {
    expect(text).toContain('The line is read from the economic model between the MEFS and the mean commercial size');
    expect(text).toContain('The MEFS is derived: the size at which a discovery is worth zero under the stated value');
    expect(text).toContain('That capex earns no tax relief');
    // the model's source was stated, so its defaults are not flagged as unstated
    expect(model.limits.flags.some((f) => /economic model/.test(f))).toBe(false);
    const bare = buildRrvReportModel(args(north()));
    expect(bare.limits.flags).toContain('The economic model is the starting screening default, never changed on this screen. Replace it with assumptions for this prospect, or state its source.');
    const some = buildRrvReportModel(args(setModelField(north(), 'capex', 350)));
    expect(some.limits.flags.some((f) => /^9 of the 10 assumptions of the economic model are starting defaults/.test(f))).toBe(true);
    // no MEFS flag: a derived MEFS cannot lose money
    expect(model.limits.flags.some((f) => /below the size that pays/.test(f))).toBe(false);
  });

  test('a typed MEFS below the size that pays is still flagged, with the size that pays beside it', () => {
    const typed = setInput(north(), 'mefs', 12);
    const m = buildRrvReportModel(args(typed));
    expect(m.limits.flags.some((f) => /A discovery of exactly the MEFS \(12 MMboe\) is worth -[\d,.]+ \$MM/.test(f))).toBe(true);
    expect(Object.fromEntries(m.economics.basis).MEFS).toMatch(/^12 MMboe, typed\. The size that pays under the stated value is [\d.]+ MMboe$/);
    expect(setMefsBasis(typed, 'derived').mefs).toBeCloseTo(north().mefs, 12);
  });

  test('PL3: in the metric view the model\'s prices are per cubic metre (70 $/boe = 440.287 $/m3) and the money does not move', () => {
    const si = buildRrvReportModel(args(north(), { units: rrvUnits('10^6 m3') }));
    const by = Object.fromEntries(si.inputs.rows.map((r) => [r.key, r]));
    expect(by['model.price']).toMatchObject({ value: '440.287', unit: '$/m3 oe' });
    expect(by['model.capex']).toMatchObject({ value: '400', unit: '$MM' });
    expect(si.economics.table.head[1]).toBe('Size (10^6 m3 oe)');
    const oil = buildRrvReportModel(args(north()));
    expect(si.headline.body[5][1]).toBe(oil.headline.body[5][1]); // the EMV
  });

  test('golden: text line for line, pages, figures and the document hash', () => {
    checkGolden(build(p), { dir: path.join(__dirname, '__fixtures__/reportGolden'), name: 'model-prospect', update: process.env.UPDATE_REPORT_GOLDENS === '1' });
  });
});
