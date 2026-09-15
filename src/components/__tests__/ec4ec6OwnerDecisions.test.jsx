/**
 * EC4-5, EC4-7 and EC6-5 (owner decisions 2026-09-15): the Suite side.
 *
 * EC4-5: one first-move label for a chance-root tree, shared by the Decision
 * Tree Builder card and the Decision Studio brief.
 * EC4-7: N/A for a missing P(NPV > 0), a brief PDF that pages instead of
 * dropping sections, live percent totals on the VOI inputs, and a help guide
 * without the typo or the stale normal approximation.
 * EC6-5: the FDP well campaign does not depend on the order of the well table.
 * Each block carries a negative control showing the check can fail.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('jspdf', () => {
  const Doc = jest.fn().mockImplementation(() => {
    const calls = { text: [], addPage: 0 };
    const doc = {
      internal: { pageSize: { width: 210, height: 297 } },
      setTextColor() {}, setFont() {}, setFontSize() {}, setFillColor() {}, setDrawColor() {},
      roundedRect() {}, line() {}, save() {},
      // About 90 characters to a line at this width, enough to make long
      // provenance wrap the way the real renderer does.
      splitTextToSize(t) {
        const str = String(t);
        const out = [];
        for (let i = 0; i < str.length; i += 90) out.push(str.slice(i, i + 90));
        return out.length ? out : [''];
      },
      text(t) { calls.text.push(Array.isArray(t) ? t.join('') : String(t)); },
      addPage() { calls.addPage += 1; },
      __calls: calls,
    };
    global.__lastBriefDoc = doc;
    return doc;
  });
  return { __esModule: true, default: Doc, jsPDF: Doc };
});
jest.mock('@/lib/pdfBrand', () => ({
  loadPetrolordLogo: jest.fn(async () => null),
  drawBrandHeader: jest.fn(() => 30),
  fitText: (doc, text) => text,
}));

/* eslint-disable import/first */
import { rollback } from '@/lib/decisionTree';
import {
  firstMoveLabel, CHANCE_ROOT_LABEL,
} from '@/components/decisiontree/firstMoveLabel';
import {
  decisionSection, economicsSection, fmtPct,
} from '@/components/decisionstudio/briefModel';
import { generateBriefPdf } from '@/components/decisionstudio/briefPdf';
import InputPanel from '@/components/voianalyzer/InputPanel';
import { defaultInputs } from '@/pages/apps/ValueOfInformationAnalyzer';
import { layoutWellCampaign, campaignOrder } from '@/components/fdp/modules/wells/wellCampaign';
import WellStrategy from '@/components/fdp/modules/wells/WellStrategy';
/* eslint-enable import/first */

const SRC = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ---------------------------------------------------------------------------
// EC4-5
// ---------------------------------------------------------------------------
describe('EC4-5 chance-root first-move label', () => {
  const CHANCE_TREE = {
    type: 'chance', label: 'Nature first',
    branches: [
      { label: 'Up', probability: 0.5, node: { type: 'terminal', payoff: 10 } },
      { label: 'Down', probability: 0.5, node: { type: 'terminal', payoff: -2 } },
    ],
  };

  test('the label says there is no first decision', () => {
    expect(CHANCE_ROOT_LABEL).toBe('Chance root: no first decision to make');
    expect(firstMoveLabel(rollback(CHANCE_TREE))).toBe(CHANCE_ROOT_LABEL);
    expect(firstMoveLabel(null)).toBe('N/A');
  });

  test('the brief prints the shared label for a chance root', () => {
    const s = decisionSection({ id: 'x', project_name: 'Chance first', inputs_data: { tree: CHANCE_TREE } });
    expect(s.rows).toContainEqual(['Recommended first move', CHANCE_ROOT_LABEL]);
    // Negative control: the retired brief wording is gone.
    expect(s.rows).not.toContainEqual(['Recommended first move', 'Single path']);
  });

  test('both screens call the one helper and carry no private wording', () => {
    const builder = read('pages/apps/DecisionTreeBuilder.jsx');
    const brief = read('components/decisionstudio/briefModel.js');
    for (const source of [builder, brief]) {
      // EC4-1 (engines #192) added isIndifferentFirstMove beside it, so the
      // guard checks the shared helper is imported from the one module, not
      // that it is the only name taken from it.
      expect(source).toMatch(/import \{[^}]*\bfirstMoveLabel\b[^}]*\} from '@\/components\/decisiontree\/firstMoveLabel'/);
      expect(source).toMatch(/firstMoveLabel\(/);
    }
    expect(builder).not.toMatch(/'Chance root'/);
    expect(brief).not.toMatch(/'Single path'/);
    // Negative control: the old builder line would have failed the check above.
    const retired = "value={bestBranch ? bestBranch.label : root ? (root.type === 'chance' ? 'Chance root' : 'Single outcome') : 'N/A'}";
    expect(retired).toMatch(/'Chance root'/);
  });
});

// ---------------------------------------------------------------------------
// EC4-7.1 N/A instead of NaN%
// ---------------------------------------------------------------------------
describe('EC4-7 missing P(NPV > 0) reads N/A', () => {
  test('fmtPct', () => {
    expect(fmtPct(undefined)).toBe('N/A');
    expect(fmtPct(null)).toBe('N/A');
    expect(fmtPct(NaN)).toBe('N/A');
    expect(fmtPct(0.923)).toBe('92.3%');
    expect(fmtPct(0.923, 0)).toBe('92%');
    expect(fmtPct(0)).toBe('0.0%');
    // Negative control: the retired expression printed NaN%.
    expect(`${(undefined * 100).toFixed(1)}%`).toBe('NaN%');
  });

  test('a brief economics section from a run with no probNpvPositive', () => {
    const s = economicsSection({ id: 'r1', results: { seed: 1, iterations: 10, npv: { p50: 1e6 } } });
    expect(s.rows).toContainEqual(['Chance NPV is positive', 'N/A']);
    expect(JSON.stringify(s.rows)).not.toMatch(/NaN/);
  });

  test('Decision Studio formats both P(NPV > 0) cells through fmtPct', () => {
    const page = read('pages/apps/DecisionStudio.jsx');
    expect(page).not.toMatch(/probNpvPositive \* 100/);
    expect((page.match(/fmtPct\(r\.results\?\.probNpvPositive/g) || []).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// EC4-7.2 brief PDF pages instead of dropping
// ---------------------------------------------------------------------------
describe('EC4-7 brief PDF draws every section', () => {
  const section = (i) => ({
    heading: `Section ${i}`,
    rows: [['A', '1'], ['B', '2'], ['C', '3'], ['D', '4'], ['E', '5'], ['F', '6']],
    note: 'N'.repeat(400),
    provenance: `Provenance ${i} `.padEnd(900, 'p'),
  });
  const model = (n) => ({
    title: 'Brief', recommendation: 'Drill.', preparedBy: 'a@b.c',
    generatedAt: '2026-09-15T00:00:00Z', footer: 'Footer.',
    sections: Array.from({ length: n }, (_, i) => section(i + 1)),
  });

  test('a brief longer than a page adds a page and keeps every heading', async () => {
    await generateBriefPdf(model(6));
    const calls = global.__lastBriefDoc.__calls;
    expect(calls.addPage).toBeGreaterThanOrEqual(1);
    for (let i = 1; i <= 6; i += 1) expect(calls.text).toContain(`Section ${i}`);
    // Negative control: under the retired `if (y > pageHeight - 50) break`
    // these sections cannot all fit one page. Each is 7 + 3 rows + 5 note
    // lines + 10 provenance lines tall, about 80 mm, against 297 mm.
    const perSection = 7 + 3 * 5.5 + (5 * 4 + 2) + 10 * 3.6 + 8;
    expect(30 + 12 + 8 + 6 * perSection).toBeGreaterThan(297 - 50);
  });

  test('a short brief stays on one page', async () => {
    await generateBriefPdf(model(1));
    const calls = global.__lastBriefDoc.__calls;
    expect(calls.addPage).toBe(0);
    expect(calls.text).toContain('Section 1');
  });
});

// ---------------------------------------------------------------------------
// EC4-7.3 VOI running totals
// ---------------------------------------------------------------------------
describe('EC4-7 VOI input running totals', () => {
  const renderPanel = (inputs) => render(
    <InputPanel onAnalyze={() => {}} loading={false} inputs={inputs} setInputs={() => {}} />,
  );

  test('the default study shows every group at 100 and nothing flagged', () => {
    renderPanel(defaultInputs());
    expect(screen.getByTestId('voi-sum-outcomes').textContent).toBe('Total 100%');
    expect(screen.getByTestId('voi-sum-indicators').textContent).toBe('Total 100%');
    expect(screen.getByTestId('voi-sum-conditional-1').textContent).toBe('Total 100%');
    expect(screen.getByTestId('voi-sum-conditional-2').textContent).toBe('Total 100%');
    expect(document.querySelectorAll('[data-off="true"]').length).toBe(0);
  });

  test('an off group is flagged with its total', () => {
    const inputs = defaultInputs();
    inputs.outcomes[0].probability = 20; // 20 + 70
    inputs.infoScenario.indicators[1].conditionalProbabilities[0].probability = 15; // 15 + 90
    renderPanel(inputs);
    const outcomes = screen.getByTestId('voi-sum-outcomes');
    expect(outcomes.getAttribute('data-off')).toBe('true');
    expect(outcomes.textContent).toBe('Total 90% (must be 100%)');
    const cond2 = screen.getByTestId('voi-sum-conditional-2');
    expect(cond2.getAttribute('data-off')).toBe('true');
    expect(cond2.textContent).toBe('Total 105% (must be 100%)');
    // The untouched groups stay unflagged.
    expect(screen.getByTestId('voi-sum-indicators').getAttribute('data-off')).toBe('false');
    expect(screen.getByTestId('voi-sum-conditional-1').getAttribute('data-off')).toBe('false');
  });

  test('the total follows the edit', () => {
    let current = defaultInputs();
    const setInputs = (fn) => { current = typeof fn === 'function' ? fn(current) : fn; };
    const { rerender } = render(
      <InputPanel onAnalyze={() => {}} loading={false} inputs={current} setInputs={setInputs} />,
    );
    const probInputs = screen.getAllByDisplayValue('30');
    fireEvent.change(probInputs[0], { target: { value: '35' } });
    rerender(<InputPanel onAnalyze={() => {}} loading={false} inputs={current} setInputs={setInputs} />);
    expect(screen.getByTestId('voi-sum-outcomes').textContent).toBe('Total 105% (must be 100%)');
  });
});

// ---------------------------------------------------------------------------
// EC4-7.4 help guide
// ---------------------------------------------------------------------------
describe('EC4-7 Decision Studio help guide', () => {
  const guide = read('components/decisionstudio/DecisionStudioHelpGuide.jsx');
  test('no stale normal approximation, and the seeded Monte Carlo is named', () => {
    expect(guide).not.toMatch(/normal approximation/i);
    expect(guide).toMatch(/seeded Monte Carlo \(seed 20260829, 10,000 iterations\)/);
  });
  test('the typo is gone', () => {
    expect(guide).not.toMatch(/the tool s\b/);
    // Negative control: the retired sentence would match.
    expect('The recommendation line is yours, not the tool s. The').toMatch(/the tool s\b/);
  });
  test('the stated seed and iterations match the engine defaults', () => {
    const engine = fs.readFileSync(path.join(SRC, '../packages/engines/engines/economics/portfolio.js'), 'utf8');
    expect(engine).toMatch(/DEFAULT_RISK_SEED = 20260829;/);
    expect(engine).toMatch(/DEFAULT_RISK_ITERATIONS = 10000;/);
  });
});

// ---------------------------------------------------------------------------
// EC6-5 campaign layout independent of table order
// ---------------------------------------------------------------------------
describe('EC6-5 FDP well campaign', () => {
  // The retired rule: hand out wells in table order.
  const listOrderDays = (wells, rigCount) => {
    const rigs = new Array(Math.max(1, rigCount)).fill(0);
    wells.forEach((w) => {
      let next = 0;
      for (let r = 1; r < rigs.length; r += 1) if (rigs[r] < rigs[next]) next = r;
      rigs[next] += Number(w.days) || 0;
    });
    return Math.max(...rigs, 0);
  };

  const CRAFTED = [
    { id: 'w1', name: 'A', days: 10 },
    { id: 'w2', name: 'B', days: 10 },
    { id: 'w3', name: 'C', days: 20 },
  ];

  test('the crafted case: the list-order rule depends on order, the new layout does not', () => {
    const reversed = [...CRAFTED].reverse();
    // Negative control: the retired rule gives 30 one way and 20 the other.
    expect(listOrderDays(CRAFTED, 2)).toBe(30);
    expect(listOrderDays(reversed, 2)).toBe(20);
    expect(layoutWellCampaign(CRAFTED, 2).totalDays).toBe(20);
    expect(layoutWellCampaign(reversed, 2).totalDays).toBe(20);
  });

  test('a mixed list and its reverse give identical schedules', () => {
    const wells = [
      { id: 'P-3', days: 45 }, { id: 'P-1', days: 61 }, { id: 'I-2', days: 42 },
      { id: 'P-4', days: '34' }, { id: 'I-1', days: 45 }, { id: 'P-2', days: null }, { id: 'P-10', days: 45 },
    ];
    for (const rigs of [1, 2, 3, 4]) {
      const a = layoutWellCampaign(wells, rigs);
      const b = layoutWellCampaign([...wells].reverse(), rigs);
      expect(b.totalDays).toBe(a.totalDays);
      expect(b.schedule.map((s) => [s.id, s.rig, s.start])).toEqual(a.schedule.map((s) => [s.id, s.rig, s.start]));
      expect(a.rigDays).toBe(61 + 45 + 45 + 45 + 42 + 34);
    }
  });

  test('longest first, ties by well id', () => {
    const order = campaignOrder([
      { id: 'P-10', days: 45 }, { id: 'P-2', days: 45 }, { id: 'X', days: 50 }, { id: 'I-1', days: 45 },
    ]).map((w) => w.id);
    expect(order).toEqual(['X', 'I-1', 'P-2', 'P-10']);
  });

  test('WellStrategy shows the order-independent campaign length', () => {
    const { container, rerender } = render(<WellStrategy wells={CRAFTED} rigCount={2} />);
    const days = () => container.querySelectorAll('.text-2xl')[1].textContent;
    expect(days()).toBe('20');
    rerender(<WellStrategy wells={[...CRAFTED].reverse()} rigCount={2} />);
    expect(days()).toBe('20');
  });
});
