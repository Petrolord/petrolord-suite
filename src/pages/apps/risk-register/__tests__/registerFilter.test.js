/**
 * AS13 — the register tab's filters, and the heatmap drill-down.
 *
 * Both heatmaps said "Click any cell to drill down into the specific
 * risks" and then opened the register unfiltered; the tab's Filter
 * button had no handler at all. These pin the filter the cell hands over
 * to the same set of risks the cell counted.
 */
import fs from 'fs';
import path from 'path';
import { RISK_LIVE_STATUSES } from '@/lib/riskScoring';
import { ALL, cellFilter, describeCellFilter, filterRisks } from '../utils/registerFilter';

const APP = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

const risks = [
  { id: '1', risk_id: 'R1', title: 'Kick', category: 'Drilling', status: 'Open', likelihood: 4, impact: 3 },
  { id: '2', risk_id: 'R2', title: 'Spill', category: 'HSE', status: 'Mitigated', likelihood: 4, impact: 3 },
  { id: '3', risk_id: 'R3', title: 'Fraud', category: 'Financial', status: 'Closed', likelihood: 4, impact: 3 },
  { id: '4', risk_id: 'R4', title: 'Late rig', category: 'Drilling', status: 'Open', likelihood: 1, impact: 2 },
  { id: '5', risk_id: 'R5', title: 'Blowout', category: 'HSE', status: 'Realized', likelihood: 5, impact: 5 },
];

describe('the register filters', () => {
  it('with nothing set, shows every risk', () => {
    expect(filterRisks(risks)).toHaveLength(5);
  });

  it('filters by status', () => {
    expect(filterRisks(risks, { status: 'Open' }).map((r) => r.id)).toEqual(['1', '4']);
  });

  it('filters by inherent band', () => {
    expect(filterRisks(risks, { band: 'Critical' }).map((r) => r.id)).toEqual(['5']);
    expect(filterRisks(risks, { band: 'Low' }).map((r) => r.id)).toEqual(['4']);
  });

  it('searches title, category and code', () => {
    expect(filterRisks(risks, { search: 'hse' }).map((r) => r.id)).toEqual(['2', '5']);
    expect(filterRisks(risks, { search: 'r4' }).map((r) => r.id)).toEqual(['4']);
  });

  it('ALL is the unset value', () => {
    expect(filterRisks(risks, { status: ALL, band: ALL })).toHaveLength(5);
  });
});

describe('a heatmap cell drills down to exactly the risks it counted', () => {
  it('the Heatmap View cell lists the live risks in that cell, not closed ones', () => {
    const cell = cellFilter(4, 3, RISK_LIVE_STATUSES, 'risks not closed or draft');
    expect(filterRisks(risks, { cell }).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('the Dashboard cell lists open and under review risks only', () => {
    const cell = cellFilter(4, 3, ['Open', 'Under Review']);
    expect(filterRisks(risks, { cell }).map((r) => r.id)).toEqual(['1']);
  });

  it('says what it is filtering on', () => {
    expect(describeCellFilter(cellFilter(4, 3, null, 'open risks')))
      .toBe('Likelihood 4, impact 3, open risks');
  });

  it('both heatmaps pass the clicked cell on instead of dropping it', () => {
    ['RiskHeatmapPage.jsx', 'RiskRegisterDashboardPage.jsx'].forEach((f) => {
      const src = read(f);
      expect(src).toMatch(/onCellClick=\{\(l, i\) => onDrillDown\(cellFilter\(l, i/);
      expect(src).not.toMatch(/onCellClick=\{\(l, i\) => setActiveTab\('register'\)\}/);
    });
  });
});

describe('the register tab controls do something', () => {
  const table = read('RiskRegisterTablePage.jsx');

  it('New Risk navigates to the form', () => {
    expect(table).toMatch(/onClick=\{\(\) => navigate\(`\$\{BASE\}\/new`\)\}/);
  });

  it('a row opens its risk', () => {
    expect(table).toMatch(/onClick=\{\(\) => navigate\(`\$\{BASE\}\/\$\{risk\.id\}`\)\}/);
  });

  it('there is no Filter button without a handler', () => {
    expect(table).not.toMatch(/<Button variant="ghost" size="sm"><Filter/);
  });
});
