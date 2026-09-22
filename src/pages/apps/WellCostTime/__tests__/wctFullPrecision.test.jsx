// W3 (D3 and FOLLOW-ON-PROGRAMME §1 wellcost): the MERLIN A-12 course case
// file loads into the studio's own run service and reproduces the graded
// wellcost keys, and the Risk tab prints the seeded run at full precision
// only while the Full precision switch is on. Every value is a return of the
// studio's run service (engine + canonical Monte Carlo); the keys below are
// the published NextGen capstone keys (fields.json), never recomputed here.
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { runDeterministic, runMonteCarlo } from '../services/wctRun';
import {
  caseDocFromFile, caseFileFromDraft, caseFileText, caseFilename, CASE_FILE_FORMAT,
} from '../services/wctCaseFile';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import RiskTab from '../components/RiskTab';
import CostTab from '../components/CostTab';

jest.mock('../charts/WctCharts', () => ({
  CostHistogramChart: () => null, SCurveChart: () => null, TornadoChart: () => null,
  CostTimeChart: () => null, TimeDepthChart: () => null,
}));

const FILE = path.join(__dirname, '..', '..', '..', '..', '..', 'public', 'course-cases', 'wellcost-merlin-a12-advanced.wct.json');
const text = fs.readFileSync(FILE, 'utf8');

// published keys (NextGen wellcost capstone, key and tol)
const KEYS = {
  drill_reservoir_hr: [128.8659793814433, 5e-5],
  trip_td_hr: [12.725806451612904, 5e-6],
  casing_liner_run_hr: [41.285714285714285, 2e-5],
  productive_hr: [896.5426011394405, 5e-4],
  npt_hr: [255.51464132474018, 2e-4],
  total_days: [48.0023851026742, 2e-5],
  tangible_usd: [3140000, 2],
  intangible_usd: [12245809.811338801, 6],
  contingency_usd: [3615665.305664618, 2],
  total_usd: [19001475.11700342, 10],
  curve_at_int_casing_usd: [5421894.326682938, 2],
  curve_at_evaluation_usd: [11152431.73458189, 5],
  curve_final_usd: [15385809.811338803, 8],
  mc_cost_p10_usd: [15111064.647716, 8],
  mc_cost_p90_usd: [17776363.724421192, 10],
  mc_days_p50: [49.37724886122158, 3e-5],
};
const within = (got, key) => {
  const [want, tol] = KEYS[key];
  expect(Number.isFinite(got)).toBe(true);
  expect(Math.abs(got - want)).toBeLessThanOrEqual(tol);
};

const doc = caseDocFromFile(text);
const res = runDeterministic({ caseDoc: doc });
let mc;
beforeAll(() => { mc = runMonteCarlo({ caseDoc: doc }); });

describe('the MERLIN A-12 case file', () => {
  test('is a studio case file with its seed and iteration count', () => {
    const raw = JSON.parse(text);
    expect(raw.format).toBe(CASE_FILE_FORMAT);
    expect(raw.version).toBe(1);
    expect(doc.risk.seed).toBe(20260904);
    expect(doc.risk.iterations).toBe(20000);
    expect(doc.risk.uncertainties).toHaveLength(5);
    expect(doc.program.activities).toHaveLength(17);
  });

  test('reproduces the deterministic keys', () => {
    const row = (id) => res.program.rows.find((r) => r.id === id);
    within(row('w13').productiveHr, 'drill_reservoir_hr');
    within(row('w15').productiveHr, 'trip_td_hr');
    within(row('w16').productiveHr, 'casing_liner_run_hr');
    within(res.program.totals.productiveHr, 'productive_hr');
    within(res.program.totals.nptHr, 'npt_hr');
    within(res.program.totals.totalDays, 'total_days');
    within(res.costs.tangibleUsd, 'tangible_usd');
    within(res.costs.intangibleUsd, 'intangible_usd');
    within(res.costs.contingencyUsd, 'contingency_usd');
    within(res.costs.totalUsd, 'total_usd');
    const at = (id) => res.costCurve[res.program.rows.findIndex((r) => r.id === id) + 1].usd;
    within(at('w8'), 'curve_at_int_casing_usd');
    within(at('w14'), 'curve_at_evaluation_usd');
    within(res.costCurve[res.costCurve.length - 1].usd, 'curve_final_usd');
  });

  test('reproduces the seeded risk keys', () => {
    within(mc.cost.p10, 'mc_cost_p10_usd');
    within(mc.cost.p90, 'mc_cost_p90_usd');
    within(mc.days.p50, 'mc_days_p50');
  });

  test('round trips through export and import unchanged', () => {
    const again = caseDocFromFile(caseFileText({ ...doc, id: 'x', wellbore_id: 'y' }));
    expect(again).toEqual(doc);
    expect(caseFileFromDraft(doc).format).toBe(CASE_FILE_FORMAT);
    expect(caseFilename('MERLIN A-12 capstone')).toBe('merlin-a-12-capstone.wct.json');
  });

  test('refuses what is not a case file', () => {
    expect(() => caseDocFromFile('not json')).toThrow('not JSON');
    expect(() => caseDocFromFile({ format: 'other' })).toThrow('not a Well Cost & Time case');
    expect(() => caseDocFromFile({ format: CASE_FILE_FORMAT, version: 2 })).toThrow('not supported');
    expect(() => caseDocFromFile({ format: CASE_FILE_FORMAT, version: 1, program: { activities: [] }, costs: { items: [] } })).toThrow('no activities');
  });
});

describe('Risk and Cost tabs under the Full precision switch', () => {
  const draft = { id: 'c1', ...doc };
  test('off: percentiles in MM USD to 2 decimals and days to 1, no curve table', () => {
    render(<FullPrecisionProvider><RiskTab caseDraft={draft} onCaseChange={() => {}} res={res} mc={mc} onRunMc={() => {}} runningMc={false} /></FullPrecisionProvider>);
    expect(screen.getByTestId('wct-mc-cost-p10').textContent).toBe(`${(mc.cost.p10 / 1e6).toFixed(2)} MM`);
    expect(screen.getByTestId('wct-mc-days-p50').textContent).toBe(`${mc.days.p50.toFixed(1)} d`);
    expect(screen.queryByTestId('wct-mc-full')).toBeNull();
  });
  test('on: cost to the cent and days at 6 decimals', () => {
    render(<FullPrecisionProvider initial><RiskTab caseDraft={draft} onCaseChange={() => {}} res={res} mc={mc} onRunMc={() => {}} runningMc={false} /></FullPrecisionProvider>);
    expect(screen.getByTestId('wct-mc-cost-p10').textContent).toBe(`${formatFull(mc.cost.p10, 2)} USD`);
    expect(screen.getByTestId('wct-mc-cost-p90').textContent).toBe(`${formatFull(mc.cost.p90, 2)} USD`);
    expect(screen.getByTestId('wct-mc-days-p50').textContent).toBe(`${formatFull(mc.days.p50, 6)} d`);
    expect(screen.getByTestId('wct-mc-full').textContent).toContain('20260904');
  });
  test('cost tab: off unchanged, on adds the cumulative cost at each activity end', () => {
    const { unmount } = render(<FullPrecisionProvider><CostTab caseDraft={draft} onCaseChange={() => {}} res={res} /></FullPrecisionProvider>);
    expect(screen.queryByTestId('wct-curve-table')).toBeNull();
    expect(screen.getByTestId('wct-total-usd').textContent).toBe(`${Math.round(res.costs.totalUsd).toLocaleString()} USD`);
    unmount();
    render(<FullPrecisionProvider initial><CostTab caseDraft={draft} onCaseChange={() => {}} res={res} /></FullPrecisionProvider>);
    expect(screen.getByTestId('wct-total-usd').textContent).toBe(`${formatFull(res.costs.totalUsd, 2)} USD`);
    const i = res.program.rows.findIndex((r) => r.id === 'w8');
    expect(screen.getByTestId('wct-curve-w8').textContent).toContain(formatFull(res.costCurve[i + 1].usd, 2));
  });
});
