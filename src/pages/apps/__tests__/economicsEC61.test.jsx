/**
 * EC6-1 guards: the findings the owner asked to be implemented.
 *
 * Each of these was recorded in FINDINGS-fdp.md, left as a finding by the
 * EC6-0 decision, and then fixed. They are the kind a later edit could
 * quietly undo, so they are pinned here.
 */
import fs from 'fs';
import path from 'path';
import { getRiskLevel, riskScore } from '@/data/fdp/RiskManagementModel';
import { calculateRiskScore, getRiskLevel as hseRiskLevel, createRisk } from '@/data/fdp/HSEModel';
import { RiskIntegrationService } from '@/services/fdp/RiskIntegrationService';
import { calculateEVM } from '@/utils/projectManagementCalculations';
import { runFdpCase } from '@/utils/fdp/economics';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

describe('one risk banding scale across the FDP studio', () => {
  test('the HSE tab and the register band every cell of the 5 by 5 the same way', () => {
    for (let p = 1; p <= 5; p += 1) {
      for (let i = 1; i <= 5; i += 1) {
        const risk = { probability: p, impact: i };
        expect(hseRiskLevel(calculateRiskScore(risk))).toBe(getRiskLevel(p * i).level);
      }
    }
    // The old HSE boundaries, for the record: 12 read Medium there and High
    // on the register.
    expect(hseRiskLevel(12)).toBe('High');
    expect(hseRiskLevel(20)).toBe('Critical');
  });

  test('an unassessed hazard is not a low one', () => {
    expect(calculateRiskScore({ impact: 4 })).toBeNull();
    expect(hseRiskLevel(calculateRiskScore({ impact: 4 }))).toBe('Unscored');
    expect(riskScore({ probability: '', impact: 3 })).toBeNull();
  });

  test('no screen carries its own thresholds any more', () => {
    const screens = [
      'components/fdp/modules/risk/RiskMatrix.jsx',
      'components/fdp/modules/risk/RiskResponsePlanning.jsx',
      'components/fdp/modules/risk/RiskManagementOverview.jsx',
      'components/fdp/modules/hse/HSERiskRegister.jsx',
      'data/fdp/HSEModel.js',
    ];
    screens.forEach((relative) => {
      const code = read(relative).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // the five scales that used to live in these files
      expect(code).not.toMatch(/score >= 15/);
      expect(code).not.toMatch(/>= 8\b/);
      expect(code).not.toMatch(/\* risk\.impact\) >= 10/);
      expect(code).toMatch(/getRiskLevel|riskScore/);
    });
  });

  test('two hazards created in the same millisecond do not share an id', () => {
    const a = createRisk({ name: 'one' });
    const b = createRisk({ name: 'two' });
    expect(a.id).not.toBe(b.id);
  });

  test('a mitigation typed on the form reaches the register', () => {
    const state = {
      risks: [{ id: 'r1', name: 'Kick', probability: 4, impact: 5, mitigation: 'Raise the mud weight' }],
    };
    const [risk] = RiskIntegrationService.consolidateRisks(state);
    // It used to be saved as `mitigation` and read as `mitigationStrategy`,
    // so everything typed showed as "-".
    expect(risk.mitigationStrategy).toBe('Raise the mud weight');
  });
});

describe('the screening IRR is an answer or a reason, never a clamp', () => {
  const profile = [10, 25, 45, 50, 48, 42, 35, 30, 25, 20];
  const prices = profile.map(() => 75);

  test('a case that never pays back reports its real, negative, rate', () => {
    const r = runFdpCase({
      capexMM: 100000, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    expect(r.metrics.irrStatus).toBe('ok');
    expect(r.metrics.irr).toBeCloseTo(-36.6747, 3);
  });

  test('a case with no rate at all reports none, not 1000 percent', () => {
    const r = runFdpCase({
      capexMM: 800, annualOpexMM: 700, productionKbpd: [10, 40, 60, 60, 20, 5],
      pricesUsd: [75, 75, 75, 75, 75, 75],
    });
    expect(r.metrics.irr).toBeNull();
    expect(r.metrics.irrStatus).toBe('no-root');
  });

  test('the NPV Scenario Builder prints a missing rate rather than crashing on it', () => {
    const code = read('components/npv/ResultsPanel.jsx');
    expect(code).toMatch(/IRR_REASON/);
    // `metrics.irr.toFixed` on a null is a crash: every use must be guarded
    // by a null check on the same line.
    code.split('\n')
      .filter((line) => line.includes('metrics.irr.toFixed'))
      .forEach((line) => expect(line).toMatch(/metrics\.irr === null \?/));
    // and the card formatter never calls toFixed on a non-number
    expect(code).toMatch(/const formatPct = \(val\) => \(typeof val === 'number'/);
  });
});

describe('Project Management Pro earned value', () => {
  const WINDOW = { planned_start_date: '2026-01-01', planned_end_date: '2026-12-31' };

  test('the schedule index is time-phased to the date it is given', () => {
    const tasks = [{ name: 'a', ...WINDOW, planned_cost: 1000, percent_complete: 50 }];
    const midway = calculateEVM(tasks, { asOf: '2026-07-02' });
    const closed = calculateEVM(tasks, { asOf: '2026-12-31' });
    expect(midway.spi).toBeGreaterThan(closed.spi);
    expect(closed.spi).toBeCloseTo(0.5, 9);
    expect(midway.completionRatio).toBeCloseTo(0.5, 9);
  });

  test('the dashboard passes an as-of date rather than letting the engine read the clock', () => {
    const code = read('pages/apps/ProjectManagementPro.jsx');
    // W3: the date is the typed as-of, which defaults to today
    expect(code).toMatch(/calculateEVM\(tasksData \|\| \[\], \{ asOf: resolveAsOf\(asOfRef\.current\) \}\)/);
    expect(code).toMatch(/useState\(todayIsoDate\(\)\)/);
  });
});

describe('Technical Report Autopilot', () => {
  const page = () => read('pages/apps/TechnicalReportAutopilot.jsx');
  const panel = () => read('components/reportautopilot/InputPanel.jsx');

  test('the brief no longer arrives holding invented measurements', () => {
    const code = page().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/Alpha Prospect/);
    expect(code).not.toMatch(/West Delta/);
    expect(code).not.toMatch(/150 ft\/hr/);
    expect(code).not.toMatch(/'NPT'/);
    expect(code).toMatch(/project_name: ''/);
    expect(code).toMatch(/kpis: \[\{ key: '', value: '' \}\]/);
  });

  test('the GPT-4 picker the service never read is gone', () => {
    expect(panel()).not.toMatch(/gpt4_sections/);
    expect(page()).not.toMatch(/gpt4_sections/);
  });

  test('Back goes somewhere that exists', () => {
    expect(page()).not.toMatch(/navigate\('\/dashboard\/automation'\)/);
    expect(read('App.jsx')).toMatch(/path="economics"/);
  });

  test('Max Pages caps the document, not a third of it', () => {
    const fn = read('../supabase/functions/report-autopilot/index.ts');
    expect(fn).toMatch(/wordBudget\(detail, maxPages, sections\.length\)/);
    expect(fn).not.toMatch(/\* 450\) \/ 3\)/);
  });
});
