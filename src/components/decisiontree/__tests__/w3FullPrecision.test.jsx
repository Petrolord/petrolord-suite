/**
 * W3 (NextGen graded-field follow-on, D3): Full precision in the Decision
 * Tree Builder diagram and the Decision Studio brief. Off, the labels print
 * as before; on, $MM at 4 decimals. Expected values come from the canonical
 * rollback engine on the course's ABALAMA tree, never a restated formula.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import TreeDiagram from '@/components/decisiontree/TreeDiagram';
import { decisionSection, buildBriefModel, fmtMM } from '@/components/decisionstudio/briefModel';
import { rollback } from '@/lib/decisionTree';
import { formatFull } from '@/lib/fullPrecision';

const t = (payoff) => ({ type: 'terminal', payoff });
const ABALAMA = {
  type: 'decision', label: 'ABALAMA',
  branches: [
    {
      label: 'Drill', cost: 47.3,
      node: {
        type: 'chance', label: 'Outcome',
        branches: [
          {
            label: 'Success', probability: 0.37,
            node: {
              type: 'decision', label: 'After success',
              branches: [
                {
                  label: 'Develop', cost: 212.6,
                  node: { type: 'chance', label: 'Size', branches: [
                    { label: 'Large', probability: 0.62, node: t(684.2) },
                    { label: 'Small', probability: 0.38, node: t(118.9) },
                  ] },
                },
                { label: 'Sell', node: t(268.4) },
              ],
            },
          },
          { label: 'Marginal', probability: 0.21, node: t(96.4) },
          { label: 'Dry hole', probability: 0.42, node: t(-31.8) },
        ],
      },
    },
    {
      label: 'Farm out',
      node: { type: 'chance', label: 'Farm-out outcome', branches: [
        { label: 'Success', probability: 0.37, node: t(118.5) },
        { label: 'Marginal', probability: 0.21, node: t(22.7) },
        { label: 'Dry hole', probability: 0.42, node: t(0) },
      ] },
    },
    { label: 'Walk away', node: t(0) },
  ],
};

describe('Decision Tree Builder diagram', () => {
  const annotated = rollback(ABALAMA);
  const developChance = annotated.branches[0].node.branches[0].node.branches[0].node;

  it('the engine gives the course keys', () => {
    expect(Math.abs(annotated.emv - 58.896)).toBeLessThan(1e-9);
    expect(Math.abs(developChance.emv - 469.386)).toBeLessThan(1e-9);
  });

  it('off: node EMVs round as before (469 at or above 100)', () => {
    const { container } = render(<FullPrecisionProvider><TreeDiagram annotated={annotated} /></FullPrecisionProvider>);
    expect(container.textContent).toContain('EMV 469 $MM');
    expect(container.textContent).not.toContain(formatFull(developChance.emv, 4));
  });

  it('on: every node EMV at 4 decimals', () => {
    const { container } = render(<FullPrecisionProvider initial><TreeDiagram annotated={annotated} /></FullPrecisionProvider>);
    expect(container.textContent).toContain(`${formatFull(developChance.emv, 4)} $MM`);
    expect(container.textContent).toContain(`${formatFull(annotated.emv, 4)} $MM`);
  });
});

describe('Decision Studio brief', () => {
  const project = { id: '11112222-3333-4444-5555-666677778888', project_name: 'ABALAMA', updated_at: '2026-09-22T10:00:00Z', inputs_data: { tree: ABALAMA } };
  const annotated = rollback(ABALAMA);
  const nextBest = Math.max(...annotated.branches.filter((_, i) => i !== annotated.bestBranchIndex).map((b) => b.branchValue));

  it('off: $MM to 1 dp as before', () => {
    const rows = Object.fromEntries(decisionSection(project).rows);
    expect(rows['Optimal EMV']).toBe(fmtMM(annotated.emv));
    expect(rows['Optimal EMV']).toBe('$58.9M');
  });

  it('on: Optimal EMV, Next best and Decision advantage at 4 decimals', () => {
    const rows = Object.fromEntries(decisionSection(project, { full: true }).rows);
    expect(rows['Optimal EMV']).toBe(`$${formatFull(annotated.emv, 4)}M`);
    expect(rows['Next best alternative']).toBe(`$${formatFull(nextBest, 4)}M`);
    expect(rows['Decision advantage']).toBe(`$${formatFull(annotated.emv - nextBest, 4)}M`);
    const model = buildBriefModel({ treeProject: project, full: true });
    expect(Object.fromEntries(model.sections[0].rows)['Optimal EMV']).toBe(`$${formatFull(annotated.emv, 4)}M`);
  });
});
